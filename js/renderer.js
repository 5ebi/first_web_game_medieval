// ============================================
// Renderer - Canvas Drawing
// World is drawn through a camera transform (pan + zoom), crisp on HiDPI.
// ============================================

const Renderer = (() => {
    let canvas, ctx;
    let camera = { x: 0, y: 0 }; // world coords at the top-left screen pixel
    let zoom = 1;
    let canvasWidth, canvasHeight, dpr = 1;

    // Areas of the screen covered by UI panels (CSS px); the map is kept visible inside them
    let insets = { top: 48, right: 240, bottom: 0, left: 0 };

    // Terrain tile cache
    let terrainCanvas = null;
    let terrainSeason = null;   // season the terrain cache was rendered for
    let season = 'spring';      // current season id (updated every frame)
    let minimapTerrain = null;

    let lastFrame = performance.now();
    let timeSec = 0;

    function init(canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', () => {
            resize();
            setCamera(camera.x, camera.y);
        });
        centerCamera();
    }

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvasWidth = window.innerWidth;
        canvasHeight = window.innerHeight;
        canvas.width = Math.round(canvasWidth * dpr);
        canvas.height = Math.round(canvasHeight * dpr);
        canvas.style.width = canvasWidth + 'px';
        canvas.style.height = canvasHeight + 'px';
    }

    function setInsets(i) {
        insets = Object.assign(insets, i);
        setCamera(camera.x, camera.y);
    }

    function centerCamera() {
        const vw = (canvasWidth - insets.left - insets.right) / zoom;
        const vh = (canvasHeight - insets.top - insets.bottom) / zoom;
        setCamera(MAP_PIXEL_W / 2 - vw / 2 - insets.left / zoom, MAP_PIXEL_H / 2 - vh / 2 - insets.top / zoom);
    }

    function getCamera() { return camera; }
    function getZoom() { return zoom; }

    function clampAxis(cam, start, end, mapSize) {
        const minCam = -start / zoom;            // map edge touches the panel edge
        const maxCam = mapSize - end / zoom;
        if (maxCam < minCam) return (minCam + maxCam) / 2; // map smaller than view: center it
        return Math.max(minCam, Math.min(maxCam, cam));
    }

    function setCamera(x, y) {
        camera.x = clampAxis(x, insets.left, canvasWidth - insets.right, MAP_PIXEL_W);
        camera.y = clampAxis(y, insets.top, canvasHeight - insets.bottom, MAP_PIXEL_H);
    }

    function moveCamera(dx, dy) {
        setCamera(camera.x + dx / zoom, camera.y + dy / zoom);
    }

    // Zoom keeping the world point under (sx, sy) fixed
    function setZoom(newZoom, sx, sy) {
        newZoom = Math.max(ZOOM_LEVELS[0], Math.min(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], newZoom));
        if (sx === undefined) { sx = (insets.left + canvasWidth - insets.right) / 2; sy = (insets.top + canvasHeight - insets.bottom) / 2; }
        const wx = camera.x + sx / zoom;
        const wy = camera.y + sy / zoom;
        zoom = newZoom;
        setCamera(wx - sx / zoom, wy - sy / zoom);
    }

    function zoomStep(dir, sx, sy) {
        let idx = ZOOM_LEVELS.indexOf(zoom);
        if (idx === -1) {
            // find nearest
            idx = ZOOM_LEVELS.reduce((best, z, i) => Math.abs(z - zoom) < Math.abs(ZOOM_LEVELS[best] - zoom) ? i : best, 0);
        }
        idx = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx + dir));
        setZoom(ZOOM_LEVELS[idx], sx, sy);
    }

    function screenToWorld(sx, sy) {
        return {
            x: sx / zoom + camera.x,
            y: sy / zoom + camera.y,
        };
    }

    function worldToScreen(wx, wy) {
        return {
            x: (wx - camera.x) * zoom,
            y: (wy - camera.y) * zoom,
        };
    }

    function screenToTile(sx, sy) {
        const w = screenToWorld(sx, sy);
        return {
            x: Math.floor(w.x / TILE_SIZE),
            y: Math.floor(w.y / TILE_SIZE),
        };
    }

    // ---------- Terrain cache ----------
    function renderTerrainCache() {
        if (terrainCanvas) return;
        terrainCanvas = document.createElement('canvas');
        terrainCanvas.width = MAP_PIXEL_W;
        terrainCanvas.height = MAP_PIXEL_H;
        const tctx = terrainCanvas.getContext('2d');
        tctx.imageSmoothingEnabled = false;

        terrainSeason = season;
        const winter = season === 'winter';
        const grid = GameMap.getTerrainGrid();
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                const t = grid[y][x];
                tctx.drawImage(Sprites.getSeasonalTile(t, GameMap.getVariant(x, y), season), x * TILE_SIZE, y * TILE_SIZE);
            }
        }

        // Soft, ragged transitions between different kinds of ground (no hard 32px tile edges):
        // a jagged strip of the neighbouring tile is drawn over each shared edge.
        const landPriority = { [TERRAIN.SAND]: 1, [TERRAIN.DIRT]: 2, [TERRAIN.ROCKY]: 2.5, [TERRAIN.STONE_DEPOSIT]: 3, [TERRAIN.MEADOW]: 3.5, [TERRAIN.GRASS]: 4, [TERRAIN.FLOWERS]: 4, [TERRAIN.GRASS_DARK]: 5, [TERRAIN.FOREST]: 6 };
        const T = TILE_SIZE;
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                const t = grid[y][x];
                if (t === TERRAIN.WATER) continue;
                [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) return;
                    const n = grid[ny][nx];
                    if (n === TERRAIN.WATER || n === t) return;
                    // only the "stronger" ground creeps over the weaker one (grass over sand, forest over grass)
                    if ((landPriority[n] || 0) <= (landPriority[t] || 0)) return;
                    if ((landPriority[n] === 4 && landPriority[t] === 4)) return;
                    tctx.save();
                    tctx.beginPath();
                    // an organic, wavy edge reaching up to ~10px into the tile
                    const ph = ((x * 92821 + y * 68917 + (dx + 2) * 31 + (dy + 2) * 17) >>> 0) % 628 / 100;
                    for (let i = 0; i < T; i += 2) {
                        const h0 = (x * 928371 + y * 364479 + i * 7919 + (dx + 2) * 31 + (dy + 2) * 17) >>> 0;
                        const wave = Math.sin(i * 0.21 + ph) * 0.6 + Math.sin(i * 0.47 + ph * 2.3) * 0.4;
                        const depth = Math.max(1, Math.round(4 + wave * 4 + (h0 % 3) - 1));
                        if (dx === 1) tctx.rect((x + 1) * T - depth, y * T + i, depth, 2);
                        if (dx === -1) tctx.rect(x * T, y * T + i, depth, 2);
                        if (dy === 1) tctx.rect(x * T + i, (y + 1) * T - depth, 2, depth);
                        if (dy === -1) tctx.rect(x * T + i, y * T, 2, depth);
                    }
                    tctx.clip();
                    tctx.drawImage(Sprites.getSeasonalTile(n, GameMap.getVariant(nx, ny), season), x * T, y * T);
                    tctx.restore();
                });
            }
        }

        // Shorelines: foam on water tiles bordering land (frozen in winter: no foam)
        for (let y = 0; y < MAP_HEIGHT && !winter; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                if (grid[y][x] !== TERRAIN.WATER) continue;
                const land = (tx, ty) => {
                    const t = GameMap.getTerrain(tx, ty);
                    return t !== TERRAIN.WATER;
                };
                if (land(x, y - 1)) tctx.drawImage(Sprites.drawShore('n'), x * TILE_SIZE, y * TILE_SIZE);
                if (land(x, y + 1)) tctx.drawImage(Sprites.drawShore('s'), x * TILE_SIZE, y * TILE_SIZE);
                if (land(x - 1, y)) tctx.drawImage(Sprites.drawShore('w'), x * TILE_SIZE, y * TILE_SIZE);
                if (land(x + 1, y)) tctx.drawImage(Sprites.drawShore('e'), x * TILE_SIZE, y * TILE_SIZE);
            }
        }

        // Soft shadow on the land side of shores / forest edges for depth
        tctx.fillStyle = 'rgba(0,0,0,0.08)';
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                const t = grid[y][x];
                if (t === TERRAIN.WATER) continue;
                if (GameMap.getTerrain(x, y + 1) === TERRAIN.WATER) tctx.fillRect(x * TILE_SIZE, y * TILE_SIZE + TILE_SIZE - 2, TILE_SIZE, 2);
            }
        }

        // Flower decorations: none in winter, fewer in autumn
        GameMap.getDecorations().forEach(d => {
            if (winter || (season === 'autumn' && d.seed % 3 !== 0)) return;
            tctx.drawImage(Sprites.drawFlowers(2, d.seed), d.x * TILE_SIZE, d.y * TILE_SIZE);
        });

        drawHillShade(tctx, grid, winter);

        // Minimap base (1px per tile)
        Atmosphere.onMapChanged();

        minimapTerrain = document.createElement('canvas');
        minimapTerrain.width = MAP_WIDTH;
        minimapTerrain.height = MAP_HEIGHT;
        const mctx = minimapTerrain.getContext('2d');
        // Average colour of each terrain tile, so custom tile art also shows on the minimap
        const avg = {};
        const probe = document.createElement('canvas');
        probe.width = TILE_SIZE; probe.height = TILE_SIZE;
        const pctx = probe.getContext('2d', { willReadFrequently: true });
        const tileColor = (type) => {
            if (avg[type]) return avg[type];
            let col = MINIMAP_COLORS[type] || '#5a8f3c';
            try {
                pctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
                pctx.drawImage(Sprites.getSeasonalTile(type, 0, season), 0, 0);
                const d = pctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
                let r = 0, g = 0, b = 0, n = 0;
                for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } }
                if (n) col = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
            } catch (e) { /* tainted canvas under file:// - keep fallback colour */ }
            if (type === TERRAIN.FOREST) col = { autumn: '#8a5a22', winter: '#7d9180' }[season] || MINIMAP_COLORS[TERRAIN.FOREST]; // trees dominate forests visually
            avg[type] = col;
            return col;
        };
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                mctx.fillStyle = tileColor(grid[y][x]);
                mctx.fillRect(x, y, 1, 1);
            }
        }
    }

    // Gentle hills: the elevation field is lit from the upper left and the result is
    // posterised into a few bands on a 2px grid, so the ground has relief but stays pixel art.
    function drawHillShade(tctx, grid, winter) {
        const C = 2;
        const W = MAP_PIXEL_W / C, H = MAP_PIXEL_H / C;
        const img = tctx.createImageData(W, H);
        const d = img.data;
        const k = 1 / (TILE_SIZE / C);
        const h = (x, y) => GameMap.getElevation(x * k - 0.5, y * k - 0.5);
        for (let y = 0; y < H; y++) {
            const ty = Math.floor(y * C / TILE_SIZE);
            for (let x = 0; x < W; x++) {
                const tx = Math.floor(x * C / TILE_SIZE);
                if (grid[ty][tx] === TERRAIN.WATER) continue;
                // slope towards the light (upper left) brightens, away darkens
                const gx = h(x + 3, y) - h(x - 3, y), gy = h(x, y + 3) - h(x, y - 3);
                let l = -(gx * 0.8 + gy) * 420;
                // ordered dither so band edges are pixel-crisp but not ruler-straight
                l += ((x * 3 + y * 7) % 4 - 1.5) * 0.06;
                const band = Math.max(-3, Math.min(3, Math.round(l)));
                if (!band) continue;
                const i = (y * W + x) * 4;
                if (band > 0) { d[i] = 255; d[i + 1] = 245; d[i + 2] = 200; d[i + 3] = band * (winter ? 9 : 13); }
                else { d[i] = 20; d[i + 1] = 30; d[i + 2] = 20; d[i + 3] = -band * (winter ? 12 : 18); }
            }
        }
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        c.getContext('2d').putImageData(img, 0, 0);
        tctx.imageSmoothingEnabled = false;
        tctx.drawImage(c, 0, 0, MAP_PIXEL_W, MAP_PIXEL_H);
    }

    function invalidateTerrainCache() {
        terrainCanvas = null;
        minimapTerrain = null;
    }

    // ---------- Helpers ----------
    function drawShadowEllipse(cx, cy, rx, ry, alpha = 0.25) {
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // 0 during the day, 1 in the middle of the night (darkest around 01:00)
    function nightAmount(gs) {
        if (!Game.isClockRunning()) return 0;
        const v = Math.max(0, Math.cos((Game.getHour() - 1) / 24 * Math.PI * 2));
        return Math.pow(v, 1.5);
    }

    // ---------- Sun & shadows ----------
    // The sun rises in the east (right) and sets in the west (left): shadows swing from
    // long to the left in the morning, short around noon, to long to the right at dusk.
    function sunParams(night) {
        const hour = Game.isClockRunning() ? Game.getHour() : 10;
        const t = Math.max(0, Math.min(1, (hour - 6) / 14));
        const s = (0.5 - t) * 2;                 // +1 morning .. -1 evening
        const cover = Atmosphere.getCover();
        const overcast = Math.max(0, Math.min(1, (cover - 0.35) / 0.55));
        const alpha = 0.34 * Math.pow(1 - night, 1.5) * (1 - overcast * 0.7);
        return { shear: s * 1.05, len: 0.32 + Math.abs(s) * 0.42, alpha };
    }

    let shadowCanvas = null, sctx = null;
    function prepareShadowLayer() {
        if (!shadowCanvas || shadowCanvas.width !== canvas.width || shadowCanvas.height !== canvas.height) {
            shadowCanvas = document.createElement('canvas');
            shadowCanvas.width = canvas.width; shadowCanvas.height = canvas.height;
            sctx = shadowCanvas.getContext('2d');
        }
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.clearRect(0, 0, shadowCanvas.width, shadowCanvas.height);
        sctx.imageSmoothingEnabled = false;
    }

    // Projects a sprite's silhouette onto the ground from its base line
    function castShadow(sprite, ox, oy, baseY, sun) {
        if (!sctx) return;
        const sil = Sprites.getSilhouette(sprite);
        if (!sil) return;
        sctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -camera.x * dpr * zoom, -camera.y * dpr * zoom);
        sctx.translate(0, baseY);
        sctx.transform(1, 0, sun.shear, sun.len, 0, 0);
        sctx.drawImage(sil, ox, oy - baseY);
    }

    function buildingSprite(b) {
        return (season === 'winter' && !b.buildStart)
            ? Sprites.getBuildingSeasonal(b.type, { grown: b.grown }, season)
            : Sprites.getBuilding(b.type, { grown: b.grown });
    }

    // ---------- Soldier orders ----------
    function drawUnitOrders(hoverInfo, nowT) {
        const sel = Units.getSelected();
        if (sel.length) {
            // dotted patrol loops (one per route, shared by the group)
            ctx.lineWidth = 1 / zoom;
            ctx.setLineDash([3 / zoom, 3 / zoom]);
            ctx.strokeStyle = 'rgba(255, 230, 150, 0.7)';
            sel.forEach(u => {
                if (u.state !== 'patrol' || !u.patrol) return;
                const pts = u.patrol.pts;
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                if (pts.length > 2) ctx.closePath();
                ctx.stroke();
            });
            ctx.setLineDash([]);
        }
        // destination marker: a ring that shrinks for a second
        const m = hoverInfo?.marker;
        if (m) {
            const age = (nowT - m.t) / 1000;
            if (age < 1.1) {
                const r = 9 - age * 5;
                ctx.globalAlpha = Math.max(0, 1 - age);
                ctx.strokeStyle = m.kind === 'patrol' ? '#9ad0ff' : '#ffe080';
                ctx.lineWidth = 2 / zoom;
                ctx.beginPath();
                ctx.ellipse(m.x, m.y, r, r * 0.45, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(m.x, m.y - 2); ctx.lineTo(m.x, m.y - 10 + age * 3);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }
    }

    // Box selection rectangle (screen space)
    function drawSelectBox(box) {
        if (!box) return;
        const x = Math.min(box.x0, box.x1), y = Math.min(box.y0, box.y1);
        const w = Math.abs(box.x1 - box.x0), h = Math.abs(box.y1 - box.y0);
        ctx.fillStyle = 'rgba(255, 215, 0, 0.12)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
    }

    // ---------- Main render ----------
    function render(placementPreview, hoverInfo) {
        const nowT = performance.now();
        const dt = Math.min(0.1, (nowT - lastFrame) / 1000);
        lastFrame = nowT;
        const gs = Game.getState();
        const simRunning = gs.started && !gs.paused && !gs.gameOver;
        const simDt = simRunning ? dt * Math.max(1, gs.speed) : 0;
        timeSec += dt;

        // Update cosmetic systems
        updateConstruction(nowT);
        Villagers.sync(BuildingManager.getAll());
        Villagers.update(simDt);
        Units.update(simDt);
        Effects.update(simRunning ? simDt : dt * 0.3);
        const night = nightAmount(gs);
        season = Game.getSeason().id;
        if (terrainSeason && season !== terrainSeason) invalidateTerrainCache();
        Atmosphere.update(dt, gs, night);

        // Clear in screen space
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#16301a';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // World transform
        ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -camera.x * dpr * zoom, -camera.y * dpr * zoom);
        ctx.imageSmoothingEnabled = false;

        renderTerrainCache();

        // Visible world rect
        const vx0 = camera.x, vy0 = camera.y;
        const vx1 = camera.x + canvasWidth / zoom, vy1 = camera.y + canvasHeight / zoom;

        const startTileX = Math.max(0, Math.floor(vx0 / TILE_SIZE) - 1);
        const startTileY = Math.max(0, Math.floor(vy0 / TILE_SIZE) - 1);
        const endTileX = Math.min(MAP_WIDTH, Math.ceil(vx1 / TILE_SIZE) + 1);
        const endTileY = Math.min(MAP_HEIGHT, Math.ceil(vy1 / TILE_SIZE) + 1);

        if (endTileX > startTileX && endTileY > startTileY) {
            const sx = startTileX * TILE_SIZE;
            const sy = startTileY * TILE_SIZE;
            const sw = (endTileX - startTileX) * TILE_SIZE;
            const sh = (endTileY - startTileY) * TILE_SIZE;
            ctx.drawImage(terrainCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
        }

        // Map border
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2 / zoom;
        ctx.strokeRect(0, 0, MAP_PIXEL_W, MAP_PIXEL_H);

        // Animated water highlights
        const grid = GameMap.getTerrainGrid();
        const waveFrame = Math.floor(timeSec * 2) % 3;
        for (let ty = startTileY; ty < endTileY; ty++) {
            for (let tx = startTileX; tx < endTileX; tx++) {
                if (grid[ty][tx] !== TERRAIN.WATER || season === 'winter') continue;
                if ((tx * 3 + ty * 5) % 4 !== 0) continue;
                const f = (waveFrame + tx + ty) % 3;
                const off = Math.sin(timeSec * 1.5 + tx + ty) * 2;
                ctx.drawImage(Sprites.drawWave(f), tx * TILE_SIZE + 8 + off, ty * TILE_SIZE + 12 + ((tx + ty) % 2) * 8);
            }
        }

        // Stone piles (ground layer)
        GameMap.getStones().forEach(s => {
            if (s.x + 32 > vx0 && s.x - 32 < vx1 && s.y + 24 > vy0 && s.y - 24 < vy1) {
                ctx.drawImage(Sprites.getStonePile(season, ((s.x * 7 + s.y * 3) | 0) % 3), Math.round(s.x), Math.round(s.y));
            }
        });

        // Collect drawables for depth sorting. Each may also cast a sun shadow.
        const drawables = [];
        const sun = sunParams(night);
        const wind = Atmosphere.getWind();

        // Trees (crowns sway in the wind, a few px at most)
        const swayAmp = 0.5 + wind * 1.8;
        GameMap.getTrees().forEach(t => {
            if (t.x + 40 > vx0 && t.x - 40 < vx1 && t.y + 60 > vy0 && t.y - 60 < vy1) {
                const kind = t.type === 'pine' ? 'pine' : 'oak';
                const variant = ((t.x * 13 + t.y * 7) | 0) % 3;
                const ph = t.x * 0.045 + t.y * 0.031;
                const sway = Math.sin(timeSec * (0.9 + wind * 1.4) + ph) + Math.sin(timeSec * 2.3 + ph * 1.7) * 0.25;
                const frame = Math.max(-2, Math.min(2, Math.round(sway * swayAmp)));
                const sprite = Sprites.getTreeFrame(kind, season, variant, frame);
                // Felled trees: a stump, then a sapling that grows back to full size
                if (t.g < 1) {
                    const stump = Sprites.getStump(season);
                    const sxp = Math.round(t.x - 5), syp = Math.round(t.y + 10);
                    if (t.g < 0.3) {
                        drawables.push({ y: t.y + 16, draw: () => ctx.drawImage(stump, sxp, syp) });
                        return;
                    }
                    const k = t.g < 0.65 ? 0.4 : 0.7;
                    const sw = Math.round(sprite.width * k), sh = Math.round(sprite.height * k);
                    const sox = Math.round(t.x - sw / 2), soy = Math.round(t.y - sh + 16);
                    drawables.push({ y: t.y + 16, draw: () => ctx.drawImage(sprite, sox, soy, sw, sh) });
                    return;
                }
                const ox = Math.round(t.x - sprite.width / 2), oy = Math.round(t.y - sprite.height + 16);
                drawables.push({
                    y: t.y + 16,
                    shadow: () => castShadow(sprite, ox, oy, t.y + 16, sun),
                    draw: () => ctx.drawImage(sprite, ox, oy),
                });
            }
        });

        // Buildings
        BuildingManager.getAll().forEach(b => {
            if (b.pixelX + b.width < vx0 - 60 || b.pixelX > vx1 + 60 || b.pixelY + b.height < vy0 || b.pixelY > vy1 + 120) return;
            drawables.push({
                y: b.pixelY + b.height,
                shadow: () => {
                    if (b.buildStart) return;
                    const spr = buildingSprite(b);
                    if (!spr) return;
                    castShadow(spr, b.pixelX + Math.round((b.width - spr.width) / 2), b.pixelY + b.height - spr.height, b.pixelY + b.height - 2, sun);
                },
                draw: () => drawBuilding(b, nowT, night, hoverInfo),
            });
            // Smoke
            if (b.def.chimney && !b.buildStart && (b.active || b.maxWorkers === 0) && simRunning) {
                b._smokeT = (b._smokeT || 0) - simDt;
                if (b._smokeT <= 0) {
                    b._smokeT = 0.35 + Math.random() * 0.3;
                    const spr = Sprites.getBuilding(b.type, { grown: b.grown });
                    const sx0 = b.pixelX + Math.round((b.width - spr.width) / 2);
                    const sy0 = b.pixelY + b.height - spr.height;
                    Effects.smoke(sx0 + b.def.chimney[0], sy0 + b.def.chimney[1]);
                }
            }
            if (b.def.crafts && !b.buildStart && b.active && simRunning && Math.random() < simDt * 1.5) {
                Effects.sparks(b.pixelX + 32, b.pixelY + 40);
            }
        });

        // Villagers: feet exactly on their position, sun shadow plus a small contact shadow
        const selVillager = hoverInfo?.villager;
        Villagers.getAll().forEach(v => {
            if (v.x < vx0 - 20 || v.x > vx1 + 20 || v.y < vy0 - 30 || v.y > vy1 + 20) return;
            const sprite = Sprites.drawVillager(v.frame, v.palette, v.flip, v.tool, v.carry);
            const ox = Math.round(v.x - sprite.width / 2), oy = Math.round(v.y) - sprite.height + 1 + (v.bob || 0);
            drawables.push({
                y: v.y,
                shadow: () => castShadow(sprite, ox, oy - (v.bob || 0), Math.round(v.y) + 1, sun),
                draw: () => {
                    ctx.fillStyle = 'rgba(0,0,0,0.28)';
                    ctx.fillRect(Math.round(v.x) - 3, Math.round(v.y), 7, 1);
                    if (selVillager === v) {
                        ctx.strokeStyle = 'rgba(255, 215, 0, 0.95)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.ellipse(Math.round(v.x) + 0.5, Math.round(v.y) + 0.5, 6, 2.5, 0, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    ctx.drawImage(sprite, ox, oy);
                },
            });
        });

        // Soldiers (same anchoring as villagers); selected ones get a ring
        const selUnit = hoverInfo?.unit;
        Units.getAll().forEach(u => {
            if (u.x < vx0 - 20 || u.x > vx1 + 20 || u.y < vy0 - 30 || u.y > vy1 + 20) return;
            const sprite = Sprites.drawSoldier(u.type, u.frame, u.flip);
            const ox = Math.round(u.x - sprite.width / 2), oy = Math.round(u.y) - sprite.height + 1;
            drawables.push({
                y: u.y,
                shadow: () => castShadow(sprite, ox, oy, Math.round(u.y) + 1, sun),
                draw: () => {
                    ctx.fillStyle = 'rgba(0,0,0,0.28)';
                    ctx.fillRect(Math.round(u.x) - 3, Math.round(u.y), 7, 1);
                    if (selUnit === u || Units.isSelected(u)) {
                        ctx.strokeStyle = 'rgba(255, 215, 0, 0.95)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.ellipse(Math.round(u.x) + 0.5, Math.round(u.y) + 0.5, 6, 2.5, 0, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    ctx.drawImage(sprite, ox, oy);
                },
            });
        });

        // Sun shadows: drawn opaque into their own layer, then laid over the ground once,
        // so overlapping shadows don't stack into dark blotches
        if (sun.alpha > 0.01) {
            prepareShadowLayer();
            drawables.forEach(d => d.shadow && d.shadow());
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = sun.alpha;
            ctx.drawImage(shadowCanvas, 0, 0);
            ctx.globalAlpha = 1;
            ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -camera.x * dpr * zoom, -camera.y * dpr * zoom);
        }

        drawables.sort((a, b) => a.y - b.y);
        drawables.forEach(d => d.draw());

        // Atmosphere: fog, cloud shadows, small critters
        const view = {
            x0: vx0, y0: vy0, x1: vx1, y1: vy1, zoom, dpr, w: canvasWidth, h: canvasHeight,
            setWorld: () => { ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -camera.x * dpr * zoom, -camera.y * dpr * zoom); ctx.imageSmoothingEnabled = false; },
            setScreen: () => { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false; },
        };
        Atmosphere.drawGround(ctx, view);

        // Particles & floating texts
        Effects.draw(ctx);
        Atmosphere.drawSky(ctx, view);

        // How good every spot is for the building being placed (red -> yellow -> green)
        if (hoverInfo?.placing) drawSpotTint(hoverInfo.placing, nowT);

        // Placement preview
        if (placementPreview) drawPlacementPreview(placementPreview);

        // Patrol routes of the selected soldiers and the last order's destination
        drawUnitOrders(hoverInfo, nowT);

        // Hover highlight on a building (when not placing)
        if (hoverInfo?.building && !placementPreview) {
            const b = hoverInfo.building;
            ctx.strokeStyle = 'rgba(255, 230, 150, 0.8)';
            ctx.lineWidth = 2 / zoom;
            ctx.strokeRect(b.pixelX + 1, b.pixelY + 1, b.width - 2, b.height - 2);
        }
        if (hoverInfo?.selected) {
            const b = hoverInfo.selected;
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.95)';
            ctx.lineWidth = 2 / zoom;
            ctx.setLineDash([6 / zoom, 4 / zoom]);
            ctx.strokeRect(b.pixelX, b.pixelY, b.width, b.height);
            ctx.setLineDash([]);
        }

        // ---------- Screen-space overlays ----------
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Day/night tint
        if (night > 0.01) {
            ctx.fillStyle = `rgba(12, 16, 60, ${(night * 0.42).toFixed(3)})`;
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        }

        // Weather, light halos, rain
        Atmosphere.drawScreen(ctx, view);

        // Yield the ghost would get there, with its parts (Civilization style)
        if (placementPreview?.yield) drawYieldLabel(placementPreview);

        // Placement hint text near the cursor
        if (placementPreview && placementPreview.reason && placementPreview.screenX !== undefined) {
            drawHint(placementPreview.screenX + 16, placementPreview.screenY + 20, placementPreview.reason, '#ffb0a0');
        } else if (placementPreview && placementPreview.valid && placementPreview.screenX !== undefined) {
            const def = BUILDINGS[placementPreview.type];
            drawHint(placementPreview.screenX + 16, placementPreview.screenY + 20, placementPreview.hint || t('cv.click', { name: bName(def) }), '#c8ffc0');
        }
        drawSelectBox(hoverInfo?.box);
        // Waiting for a Move / Patrol target: hint next to the mouse cursor
        if (hoverInfo?.orderHint && hoverInfo.pointer) drawHint(hoverInfo.pointer.x + 16, hoverInfo.pointer.y + 20, hoverInfo.orderHint, '#c8e4ff');
    }

    function drawBuilding(b, nowT, night, hoverInfo) {
        const sprite = (season === 'winter' && !b.buildStart)
            ? Sprites.getBuildingSeasonal(b.type, { grown: b.grown }, season)
            : Sprites.getBuilding(b.type, { grown: b.grown });
        if (!sprite) return;

        // Sprites are anchored bottom-center on their footprint, so custom art may be taller/wider
        const ox = b.pixelX + Math.round((b.width - sprite.width) / 2);
        const oy = b.pixelY + b.height - sprite.height;

        // Under construction: foundation, rising building, scaffold, builder
        if (b.buildStart) {
            drawConstruction(b, sprite, ox, oy, nowT);
            return;
        }


        // Small "settle" bounce right after completion (in whole pixels)
        let lift = 0;
        if (b._doneAt) {
            const age = (nowT - b._doneAt) / 1000;
            if (age < 0.3) lift = -Math.round(Math.sin(age / 0.3 * Math.PI) * 3);
            else b._doneAt = 0;
        }
        ctx.drawImage(sprite, ox, oy + lift);
        const scale = 1;

        // Night window glow (positions are relative to the sprite's top-left)
        if (night > 0.15 && b.def.lights && scale === 1) {
            ctx.fillStyle = `rgba(255, 190, 80, ${(Math.min(1, (night - 0.15) * 2) * 0.85).toFixed(3)})`;
            b.def.lights.forEach(([lx, ly, lw, lh]) => ctx.fillRect(ox + lx, oy + ly, lw, lh));
        }

        // Work cycle: a thin bar under production buildings shows when the next delivery arrives
        if (b.def.production && b.active && Game.isClockRunning()) {
            const bw = Math.min(b.width - 12, 40);
            const bx = Math.round(b.pixelX + (b.width - bw) / 2), by = b.pixelY + b.height - 3;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(bx - 1, by - 1, bw + 2, 3);
            ctx.fillStyle = COLORS[b.def.production.resource] || '#ffd24a';
            ctx.fillRect(bx, by, Math.round(bw * Math.min(1, b.progress || 0)), 1);
        }

        // Inactive (no workers) indicator
        if (b.maxWorkers > 0 && !b.active) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(b.pixelX + 2, b.pixelY + b.height - 12, 44, 10);
            ctx.fillStyle = '#ff9a8a';
            ctx.font = '8px monospace';
            ctx.fillText(t('cv.noworkers'), b.pixelX + 4, b.pixelY + b.height - 4);
        }

        // Growth progress for orchards / farms
        if (!b.grown && b.def.production?.growthDays) {
            const gs = Game.getState();
            const dormant = season === 'winter';
            const pct = Math.min(1, (b.growthProgress + (dormant ? 0 : gs.dayProgress)) / b.def.production.growthDays);
            const bw = Math.min(b.width - 8, 56);
            const bx = b.pixelX + (b.width - bw) / 2;
            const by = b.pixelY - 10;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(bx, by, bw, 7);
            ctx.fillStyle = '#6fcf4a';
            ctx.fillRect(bx + 1, by + 1, (bw - 2) * pct, 5);
            ctx.fillStyle = '#fff';
            ctx.font = '7px monospace';
            ctx.fillText(dormant ? t('season.rest') : t('cv.growing'), bx + 2, by - 2);
        }
    }

    // ---------- Construction ----------
    function buildInfo(b) {
        return BUILD_ANIM[b.type] || { ms: 1500, material: 'wood' };
    }

    function constructionProgress(b, nowT) {
        return Math.min(1, (nowT - b.buildStart) / buildInfo(b).ms);
    }

    // Reveal height in whole 2px steps so the building rises pixel by pixel
    function revealHeight(spriteH, prog) {
        const k = Math.min(1, Math.max(0, (prog - 0.12) / 0.8));
        const eased = 1 - Math.pow(1 - k, 2);
        return Math.round(spriteH * eased / 2) * 2;
    }

    const CHIP_COLORS = { wood: '196,140,70', stone: '190,190,190', soil: '150,110,60' };

    function updateConstruction(nowT) {
        BuildingManager.getAll().forEach(b => {
            if (!b.buildStart) return;
            const info = buildInfo(b);
            const prog = constructionProgress(b, nowT);
            if (prog >= 1) {
                b.buildStart = 0;
                b._doneAt = nowT;
                onConstructionDone(b);
                return;
            }
            // Hammer blows while the walls go up
            if (prog > 0.1 && prog < 0.95 && nowT >= (b._nextHammer || 0)) {
                b._nextHammer = nowT + 190 + Math.random() * 90;
                AudioSys.play('hammer', { material: info.material });
                const spr = Sprites.getBuilding(b.type, { grown: b.grown });
                const h = revealHeight(spr.height, prog);
                const lineY = b.pixelY + b.height - h;
                Effects.chips(b.pixelX + 6 + Math.random() * (b.width - 12), lineY, CHIP_COLORS[info.material]);
            }
        });
    }

    function onConstructionDone(b) {
        AudioSys.play('buildDone');
        Effects.ring(b.pixelX, b.pixelY, b.width, b.height);
        Effects.stars(b.pixelX, b.pixelY, b.width, b.height);
        const d = b.def;
        let text = null;
        if (d.provides.populationCap) text = t('menu.villagers', { n: d.provides.populationCap });
        else if (d.provides.storage) text = t('menu.storage', { n: d.provides.storage });
        else if (d.production) text = t('menu.prod', { n: Math.round(d.production.amount * 60 / d.production.cycle), res: resName(d.production.resource) });
        if (text) Effects.floatText(b.pixelX + b.width / 2, b.pixelY - 6, text, '#ffe08a');
    }

    function drawConstruction(b, sprite, ox, oy, nowT) {
        const prog = constructionProgress(b, nowT);
        const info = buildInfo(b);
        const fx = b.pixelX, fy = b.pixelY, fw = b.width, fh = b.height;

        // Foundation: dug earth with a darker rim and a few stones
        const fa = Math.min(1, prog / 0.12);
        ctx.globalAlpha = fa;
        ctx.fillStyle = info.material === 'soil' ? '#7a5a32' : '#8a6a40';
        ctx.fillRect(fx + 2, fy + 2, fw - 4, fh - 4);
        ctx.fillStyle = '#5e4426';
        ctx.fillRect(fx + 2, fy + 2, fw - 4, 2);
        ctx.fillRect(fx + 2, fy + fh - 4, fw - 4, 2);
        ctx.fillRect(fx + 2, fy + 2, 2, fh - 4);
        ctx.fillRect(fx + fw - 4, fy + 2, 2, fh - 4);
        ctx.fillStyle = '#a08a6a';
        for (let i = 0; i < 5; i++) ctx.fillRect(fx + 6 + ((i * 37 + b.id * 11) % (fw - 14)), fy + 6 + ((i * 23 + b.id * 7) % (fh - 12)), 3, 2);
        // Corner stakes with string
        ctx.fillStyle = '#c49a5c';
        [[fx + 1, fy + 1], [fx + fw - 3, fy + 1], [fx + 1, fy + fh - 3], [fx + fw - 3, fy + fh - 3]].forEach(([x, y]) => ctx.fillRect(x, y - 4, 2, 6));
        ctx.globalAlpha = 1;

        // Faint blueprint of the finished building
        ctx.globalAlpha = 0.18 * fa;
        ctx.drawImage(sprite, ox, oy);
        ctx.globalAlpha = 1;

        // The part that is already built, rising from the ground
        const h = revealHeight(sprite.height, prog);
        if (h > 0) {
            ctx.drawImage(sprite, 0, sprite.height - h, sprite.width, h, ox, oy + sprite.height - h, sprite.width, h);
        }

        // Scaffold that grows just ahead of the walls
        if (prog > 0.08) {
            const top = oy + sprite.height - Math.min(sprite.height, h + 8);
            const bottom = oy + sprite.height;
            const left = ox + 2, right = ox + sprite.width - 4;
            // 1px poles with a lighter edge, cross braces and lashings
            const pole = (x) => {
                ctx.fillStyle = '#8a5a2a'; ctx.fillRect(x, top, 1, bottom - top);
                ctx.fillStyle = '#b07a42'; ctx.fillRect(x - 1, top, 1, bottom - top);
            };
            pole(left + 1); pole(right);
            if (sprite.width > 70) pole(ox + Math.round(sprite.width / 2));
            for (let y = bottom - 10; y > top; y -= 10) {
                ctx.fillStyle = '#6b4226'; ctx.fillRect(left, y, right - left + 1, 1);
                ctx.fillStyle = '#c8b090'; ctx.fillRect(left, y - 1, 2, 3); ctx.fillRect(right - 1, y - 1, 2, 3);
            }
            // Planks on the current working level
            ctx.fillStyle = '#c49a5c';
            ctx.fillRect(left - 2, top, right - left + 6, 1);
            ctx.fillStyle = '#8a6a3a';
            ctx.fillRect(left - 2, top + 1, right - left + 6, 1);
        }

        // Builder hammering next to the site
        const swing = Math.floor(nowT / 140) % 2;
        const bx = fx - 6, by = fy + fh;
        const villager = Sprites.drawVillager(5 + swing, (b.id + 2) % 6, false, 'hammer');
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(Math.round(bx - 3), Math.round(by), 7, 1);
        ctx.drawImage(villager, Math.round(bx - villager.width / 2), Math.round(by - villager.height + 1));

        // Thin progress bar above the site
        const bw = Math.min(fw - 8, 48);
        const pbx = fx + (fw - bw) / 2, pby = fy - 8;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(pbx, pby, bw, 4);
        ctx.fillStyle = '#ffd24a';
        ctx.fillRect(pbx + 1, pby + 1, Math.round((bw - 2) * prog), 2);
    }

    function drawPlacementPreview(pp) {
        const def = BUILDINGS[pp.type];
        if (!def) return;
        const px = pp.x;
        const py = pp.y;
        const pw = def.width * TILE_SIZE;
        const ph = def.height * TILE_SIZE;

        // Resource radius for production buildings that need a nearby resource
        if (def.production?.requires) {
            const r = RESOURCE_RADIUS * TILE_SIZE;
            ctx.fillStyle = pp.valid ? 'rgba(255,255,255,0.07)' : 'rgba(255,120,120,0.07)';
            ctx.fillRect(px - r, py - r, pw + 2 * r, ph + 2 * r);
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 1 / zoom;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(px - r, py - r, pw + 2 * r, ph + 2 * r);
            ctx.setLineDash([]);
        }

        // Wells: the reach of the one being placed (houses it reaches get a ring), and of
        // the standing ones while placing a house or tavern
        const wellR = BUILDINGS.well.well.radius * TILE_SIZE;
        const ring = (cx, cy, alpha) => {
            ctx.strokeStyle = `rgba(150, 210, 255, ${alpha})`;
            ctx.lineWidth = 1.5 / zoom;
            ctx.setLineDash([5 / zoom, 4 / zoom]);
            ctx.beginPath();
            ctx.arc(cx, cy, wellR, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        };
        if (def.well) {
            ring(px + pw / 2, py + ph / 2, 0.8);
            BuildingManager.getAll().forEach(b => {
                if (!def.well.bonus[b.type]) return;
                const dx = Math.max(b.pixelX - (px + pw / 2), 0, px + pw / 2 - (b.pixelX + b.width));
                const dy = Math.max(b.pixelY - (py + ph / 2), 0, py + ph / 2 - (b.pixelY + b.height));
                if (dx * dx + dy * dy > wellR * wellR) return;
                ctx.strokeStyle = 'rgba(150, 210, 255, 0.9)';
                ctx.lineWidth = 2 / zoom;
                ctx.strokeRect(b.pixelX + 1, b.pixelY + 1, b.width - 2, b.height - 2);
            });
        } else if (BUILDINGS.well.well.bonus[pp.type]) {
            BuildingManager.getAll().forEach(b => { if (b.type === 'well') ring(b.pixelX + b.width / 2, b.pixelY + b.height / 2, 0.55); });
        }

        // Footprint (free placement: no tile grid inside it)
        ctx.fillStyle = pp.valid ? 'rgba(80, 255, 80, 0.18)' : 'rgba(255, 60, 60, 0.22)';
        ctx.fillRect(px, py, pw, ph);

        ctx.globalAlpha = 0.7;
        const sprite = Sprites.getBuilding(pp.type);
        if (sprite) ctx.drawImage(sprite, px + Math.round((pw - sprite.width) / 2), py + ph - sprite.height);
        ctx.globalAlpha = 1;

        ctx.strokeStyle = pp.valid ? 'rgba(80, 255, 80, 0.9)' : 'rgba(255, 60, 60, 0.9)';
        ctx.lineWidth = 2 / zoom;
        ctx.strokeRect(px, py, pw, ph);
    }

    // ---------- Spot quality tint ----------
    // One pixel per tile, alpha baked in, scaled up crisp over the map: one drawImage per
    // frame. Rebuilt when the type changes or buildings/trees change (at most once a
    // second for tree changes, which happen with every wood delivery).
    let tint = { type: null, gv: -1, bv: -1, at: 0, canvas: null, empty: true };

    // Quality 0..1 -> [r, g, b, a]: dark red (poor) -> yellow -> bright green (great).
    // Brightness rises with quality too, so it reads without telling red from green.
    function qualityColor(q) {
        const lerp = (a, b, k) => a + (b - a) * k;
        let r, g, b;
        if (q < 0.5) { const k = q / 0.5; r = lerp(150, 235, k); g = lerp(25, 200, k); b = lerp(25, 40, k); }
        else { const k = (q - 0.5) / 0.5; r = lerp(235, 110, k); g = lerp(200, 245, k); b = lerp(40, 120, k); }
        return [Math.round(r), Math.round(g), Math.round(b), lerp(0.46, 0.32, q)];
    }

    function rebuildTint(type, nowT) {
        const grid = Game.getQualityGrid(type);
        if (!tint.canvas) {
            tint.canvas = document.createElement('canvas');
            tint.canvas.width = MAP_WIDTH;
            tint.canvas.height = MAP_HEIGHT;
        }
        const tctx = tint.canvas.getContext('2d');
        const img = tctx.createImageData(MAP_WIDTH, MAP_HEIGHT);
        let empty = true;
        if (grid) {
            for (let i = 0; i < grid.length; i++) {
                const q = grid[i];
                if (q < 0) continue;
                const c = qualityColor(q);
                img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2];
                img.data[i * 4 + 3] = Math.round(c[3] * 255);
                empty = false;
            }
        }
        tctx.putImageData(img, 0, 0);
        tint.type = type; tint.gv = GameMap.getVersion(); tint.bv = BuildingManager.getVersion();
        tint.at = nowT; tint.empty = empty;
    }

    function drawSpotTint(type, nowT) {
        if (!Game.hasSpotYield(type)) return;
        const stale = tint.type !== type || tint.bv !== BuildingManager.getVersion() ||
            (tint.gv !== GameMap.getVersion() && nowT - tint.at > 1000);
        if (stale) rebuildTint(type, nowT);
        if (tint.empty) return;
        const was = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tint.canvas, 0, 0, MAP_PIXEL_W, MAP_PIXEL_H);
        ctx.imageSmoothingEnabled = was;
    }

    // Label above the ghost: "+9 wood/min" and the parts ("14 trees · ×0.7")
    function drawYieldLabel(pp) {
        const def = BUILDINGS[pp.type];
        const sprite = Sprites.getBuilding(pp.type);
        const pw = def.width * TILE_SIZE, ph = def.height * TILE_SIZE;
        const topY = pp.y + ph - (sprite ? Math.max(ph, sprite.height) : ph);
        const s = worldToScreen(pp.x + pw / 2, topY);
        const y = pp.yield;
        const c = qualityColor(y.quality);
        const col = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
        const line2 = y.parts.join(' · ');
        ctx.font = '700 14px "Segoe UI", sans-serif';
        const w1 = ctx.measureText(y.main).width;
        ctx.font = '600 11px "Segoe UI", sans-serif';
        const w2 = line2 ? ctx.measureText(line2).width : 0;
        const w = Math.ceil(Math.max(w1, w2)) + 16, h = line2 ? 38 : 24;
        let x = Math.round(s.x - w / 2), yy = Math.round(s.y - h - 8);
        x = Math.max(insets.left + 4, Math.min(canvasWidth - insets.right - 4 - w, x));
        yy = Math.max(insets.top + 4, Math.min(canvasHeight - insets.bottom - 4 - h, yy));
        ctx.fillStyle = 'rgba(25, 18, 8, 0.92)';
        ctx.fillRect(x, yy, w, h);
        ctx.fillStyle = col;
        ctx.fillRect(x, yy, 4, h);           // quality stripe
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, yy + 0.5, w - 1, h - 1);
        ctx.font = '700 14px "Segoe UI", sans-serif';
        ctx.fillStyle = '#fff6dc';
        ctx.fillText(y.main, x + 10, yy + 17);
        if (line2) {
            ctx.font = '600 11px "Segoe UI", sans-serif';
            ctx.fillStyle = '#e8d8b0';
            ctx.fillText(line2, x + 10, yy + 32);
        }
    }

    function drawHint(x, y, text, color) {
        ctx.font = '600 12px "Segoe UI", sans-serif';
        const w = ctx.measureText(text).width + 14;
        const h = 22;
        if (x + w > canvasWidth - insets.right - 4) x = canvasWidth - insets.right - 4 - w;
        if (y + h > canvasHeight - 4) y = canvasHeight - 4 - h;
        ctx.fillStyle = 'rgba(25, 18, 8, 0.92)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.fillStyle = color;
        ctx.fillText(text, x + 7, y + 15);
    }

    // ---------- Minimap ----------
    function renderMinimap(mctx, w, h) {
        renderTerrainCache();
        mctx.imageSmoothingEnabled = false;
        mctx.clearRect(0, 0, w, h);
        mctx.drawImage(minimapTerrain, 0, 0, w, h);
        const sx = w / MAP_PIXEL_W, sy = h / MAP_PIXEL_H;
        BuildingManager.getAll().forEach(b => {
            mctx.fillStyle = b.type === 'castle' ? '#ffd700' : (b.def.production ? '#f0f0f0' : '#e8b060');
            mctx.fillRect(Math.floor(b.pixelX * sx), Math.floor(b.pixelY * sy), Math.max(2, Math.ceil(b.width * sx)), Math.max(2, Math.ceil(b.height * sy)));
        });
        // Viewport rectangle (uncovered screen area)
        const vx = camera.x + insets.left / zoom;
        const vy = camera.y + insets.top / zoom;
        const vw = (canvasWidth - insets.left - insets.right) / zoom;
        const vh = (canvasHeight - insets.top - insets.bottom) / zoom;
        mctx.strokeStyle = 'rgba(255,255,255,0.9)';
        mctx.lineWidth = 1;
        mctx.strokeRect(Math.floor(vx * sx) + 0.5, Math.floor(vy * sy) + 0.5, Math.floor(vw * sx), Math.floor(vh * sy));
    }

    // Center the visible area on a world point
    function centerOn(wx, wy) {
        const vw = (canvasWidth - insets.left - insets.right) / zoom;
        const vh = (canvasHeight - insets.top - insets.bottom) / zoom;
        setCamera(wx - vw / 2 - insets.left / zoom, wy - vh / 2 - insets.top / zoom);
    }

    return {
        init,
        resize,
        setInsets,
        getCamera,
        getZoom,
        setCamera,
        moveCamera,
        setZoom,
        zoomStep,
        centerCamera,
        centerOn,
        screenToWorld,
        worldToScreen,
        screenToTile,
        render,
        renderMinimap,
        invalidateTerrainCache,
    };
})();
