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

        const grid = GameMap.getTerrainGrid();
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                const t = grid[y][x];
                tctx.drawImage(Sprites.drawTile(t, GameMap.getVariant(x, y)), x * TILE_SIZE, y * TILE_SIZE);
            }
        }

        // Shorelines: foam on water tiles bordering land
        for (let y = 0; y < MAP_HEIGHT; y++) {
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

        // Flower decorations
        GameMap.getDecorations().forEach(d => {
            tctx.drawImage(Sprites.drawFlowers(2, d.seed), d.x * TILE_SIZE, d.y * TILE_SIZE);
        });

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
                pctx.drawImage(Sprites.drawTile(type, 0), 0, 0);
                const d = pctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
                let r = 0, g = 0, b = 0, n = 0;
                for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } }
                if (n) col = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
            } catch (e) { /* tainted canvas under file:// - keep fallback colour */ }
            if (type === TERRAIN.FOREST) col = MINIMAP_COLORS[TERRAIN.FOREST]; // trees dominate forests visually
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

    function nightAmount(gs) {
        if (!Game.hasCastle()) return 0;
        const t = (gs.day + gs.dayProgress) / DAY_NIGHT_CYCLE_DAYS;
        // 0 at noon, 1 at midnight; eased so days feel longer than nights
        const v = Math.max(0, -Math.cos(t * Math.PI * 2));
        return Math.pow(v, 1.6);
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
        Effects.update(simRunning ? simDt : dt * 0.3);
        const night = nightAmount(gs);
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
                if (grid[ty][tx] !== TERRAIN.WATER) continue;
                if ((tx * 3 + ty * 5) % 4 !== 0) continue;
                const f = (waveFrame + tx + ty) % 3;
                const off = Math.sin(timeSec * 1.5 + tx + ty) * 2;
                ctx.drawImage(Sprites.drawWave(f), tx * TILE_SIZE + 8 + off, ty * TILE_SIZE + 12 + ((tx + ty) % 2) * 8);
            }
        }

        // Stone piles (ground layer)
        const stonePileSprite = Sprites.drawStonePile();
        GameMap.getStones().forEach(s => {
            if (s.x + 32 > vx0 && s.x - 32 < vx1 && s.y + 24 > vy0 && s.y - 24 < vy1) {
                ctx.drawImage(stonePileSprite, s.x, s.y);
            }
        });

        // Collect drawables for depth sorting
        const drawables = [];

        // Trees
        GameMap.getTrees().forEach(t => {
            if (t.x + 40 > vx0 && t.x - 40 < vx1 && t.y + 60 > vy0 && t.y - 60 < vy1) {
                drawables.push({
                    y: t.y + 16,
                    draw: () => {
                        const sprite = t.type === 'pine' ? Sprites.drawPineTree() : Sprites.drawTree();
                        drawShadowEllipse(t.x + 3, t.y + 15, 9, 4, 0.22);
                        ctx.drawImage(sprite, t.x - sprite.width / 2, t.y - sprite.height + 16);
                    }
                });
            }
        });


        // Buildings
        BuildingManager.getAll().forEach(b => {
            if (b.pixelX + b.width < vx0 || b.pixelX > vx1 || b.pixelY + b.height < vy0 || b.pixelY > vy1) return;
            drawables.push({
                y: b.pixelY + b.height,
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
            if (b.type === 'blacksmith' && !b.buildStart && b.active && simRunning && Math.random() < simDt * 1.5) {
                Effects.sparks(b.pixelX + 32, b.pixelY + 40);
            }
        });

        // Villagers
        Villagers.getAll().forEach(v => {
            if (v.x < vx0 - 20 || v.x > vx1 + 20 || v.y < vy0 - 30 || v.y > vy1 + 20) return;
            drawables.push({
                y: v.y,
                draw: () => {
                    const sprite = Sprites.drawVillager(v.frame, v.palette, v.flip);
                    drawShadowEllipse(v.x, v.y, 5, 2, 0.25);
                    const bob = v.waitT > 0 ? (v.frame ? -1 : 0) : 0;
                    ctx.drawImage(sprite, Math.round(v.x - sprite.width / 2), Math.round(v.y - sprite.height + bob));
                }
            });
        });

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

        // Placement preview
        if (placementPreview) drawPlacementPreview(placementPreview);

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

        // Weather, light halos, rain, vignette
        Atmosphere.drawScreen(ctx, view);

        // Placement hint text near the cursor
        if (placementPreview && placementPreview.reason && placementPreview.screenX !== undefined) {
            drawHint(placementPreview.screenX + 16, placementPreview.screenY + 20, placementPreview.reason, '#ffb0a0');
        } else if (placementPreview && placementPreview.valid && placementPreview.screenX !== undefined) {
            const def = BUILDINGS[placementPreview.type];
            drawHint(placementPreview.screenX + 16, placementPreview.screenY + 20, placementPreview.hint || t('cv.click', { name: bName(def) }), '#c8ffc0');
        }
    }

    function drawBuilding(b, nowT, night, hoverInfo) {
        const sprite = Sprites.getBuilding(b.type, { grown: b.grown });
        if (!sprite) return;

        // Sprites are anchored bottom-center on their footprint, so custom art may be taller/wider
        const ox = b.pixelX + Math.round((b.width - sprite.width) / 2);
        const oy = b.pixelY + b.height - sprite.height;

        // Under construction: foundation, rising building, scaffold, builder
        if (b.buildStart) {
            drawConstruction(b, sprite, ox, oy, nowT);
            return;
        }

        // Soft drop shadow (silhouette offset to the lower right)
        const shadow = Sprites.getBuildingShadow(b.type, { grown: b.grown });
        if (shadow) {
            ctx.globalAlpha = 0.28;
            ctx.drawImage(shadow, ox + 4, oy + 4);
            ctx.globalAlpha = 1;
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
            const pct = Math.min(1, (b.growthProgress + gs.dayProgress) / b.def.production.growthDays);
            const bw = Math.min(b.width - 8, 56);
            const bx = b.pixelX + (b.width - bw) / 2;
            const by = b.pixelY - 10;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(bx, by, bw, 7);
            ctx.fillStyle = '#6fcf4a';
            ctx.fillRect(bx + 1, by + 1, (bw - 2) * pct, 5);
            ctx.fillStyle = '#fff';
            ctx.font = '7px monospace';
            ctx.fillText(t('cv.growing'), bx + 2, by - 2);
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
        else if (d.provides.productionBonus) text = t('menu.bonus', { n: Math.round(d.provides.productionBonus * 100) });
        else if (d.production) text = t('menu.prod', { n: d.production.amount, res: resName(d.production.resource) }) +
            (d.production.growthDays ? ' · ' + t('menu.after', { n: d.production.growthDays }) : '');
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
            ctx.fillStyle = '#8a5a2a';
            ctx.fillRect(left, top, 2, bottom - top);
            ctx.fillRect(right, top, 2, bottom - top);
            if (sprite.width > 70) ctx.fillRect(ox + Math.round(sprite.width / 2) - 1, top, 2, bottom - top);
            ctx.fillStyle = '#6b4226';
            for (let y = bottom - 10; y > top; y -= 12) ctx.fillRect(left, y, right - left + 2, 2);
            // Planks on the current working level
            ctx.fillStyle = '#c49a5c';
            ctx.fillRect(left - 2, top, right - left + 6, 2);
        }

        // Builder hammering next to the site
        const swing = Math.floor(nowT / 110) % 2;
        const bx = fx - 6, by = fy + fh;
        const villager = Sprites.drawVillager(swing, (b.id + 2) % 6, false);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(Math.round(bx - 5), Math.round(by - 1), 10, 2);
        ctx.drawImage(villager, Math.round(bx - villager.width / 2), Math.round(by - villager.height));
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(Math.round(bx + 5), Math.round(by - 15 + swing * 3), 2, 6);
        ctx.fillStyle = '#b8b8c0';
        ctx.fillRect(Math.round(bx + 4), Math.round(by - 17 + swing * 3), 5, 3);

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
        const px = pp.tileX * TILE_SIZE;
        const py = pp.tileY * TILE_SIZE;
        const pw = def.width * TILE_SIZE;
        const ph = def.height * TILE_SIZE;

        // Resource radius for production buildings that need a nearby resource
        if (def.production?.requires) {
            const r = 5 * TILE_SIZE;
            ctx.fillStyle = pp.valid ? 'rgba(255,255,255,0.07)' : 'rgba(255,120,120,0.07)';
            ctx.fillRect(px - r, py - r, pw + 2 * r, ph + 2 * r);
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 1 / zoom;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(px - r, py - r, pw + 2 * r, ph + 2 * r);
            ctx.setLineDash([]);
        }

        // Tile grid under the footprint
        ctx.fillStyle = pp.valid ? 'rgba(80, 255, 80, 0.18)' : 'rgba(255, 60, 60, 0.22)';
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = pp.valid ? 'rgba(120, 255, 120, 0.5)' : 'rgba(255, 120, 120, 0.5)';
        ctx.lineWidth = 1 / zoom;
        for (let dx = 1; dx < def.width; dx++) {
            ctx.beginPath(); ctx.moveTo(px + dx * TILE_SIZE, py); ctx.lineTo(px + dx * TILE_SIZE, py + ph); ctx.stroke();
        }
        for (let dy = 1; dy < def.height; dy++) {
            ctx.beginPath(); ctx.moveTo(px, py + dy * TILE_SIZE); ctx.lineTo(px + pw, py + dy * TILE_SIZE); ctx.stroke();
        }

        ctx.globalAlpha = 0.7;
        const sprite = Sprites.getBuilding(pp.type);
        if (sprite) ctx.drawImage(sprite, px + Math.round((pw - sprite.width) / 2), py + ph - sprite.height);
        ctx.globalAlpha = 1;

        ctx.strokeStyle = pp.valid ? 'rgba(80, 255, 80, 0.9)' : 'rgba(255, 60, 60, 0.9)';
        ctx.lineWidth = 2 / zoom;
        ctx.strokeRect(px, py, pw, ph);
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
