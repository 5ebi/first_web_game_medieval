// ============================================
// Renderer - Canvas Drawing
// ============================================
//
// Two layers:
//  - a static layer (terrain, flowers, stone piles and ALL trees) baked once
//    into an offscreen canvas per map,
//  - a dynamic pass per frame: buildings plus the few trees that overlap a
//    building, depth-sorted by their base.
// Frames are only redrawn when something visible changed (camera, buildings,
// placement preview, day/night tint, a new day), so an idle game costs ~0 CPU.

const Renderer = (() => {
    let canvas, ctx;
    let camera = { x: 0, y: 0 };
    let canvasWidth, canvasHeight;

    // Static map layer
    let terrainCanvas = null;

    // Redraw bookkeeping
    let dirty = true;
    let lastBuildingsVersion = -1;
    let lastPreviewKey = '';
    let lastTintKey = -1;
    let lastDay = -1;

    // Trees whose sprite overlaps a building; they must be depth-sorted with it
    let frontTrees = [];

    function init(canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);

        // Center camera on map center
        camera.x = MAP_PIXEL_W / 2 - canvasWidth / 2;
        camera.y = MAP_PIXEL_H / 2 - canvasHeight / 2;
    }

    function resize() {
        canvasWidth = window.innerWidth;
        canvasHeight = window.innerHeight;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        dirty = true;
    }

    function getCamera() { return { x: camera.x, y: camera.y }; }

    function setCamera(x, y) {
        // Clamp camera
        const menuWidth = 220;
        const nx = Math.round(Math.max(0, Math.min(MAP_PIXEL_W - canvasWidth + menuWidth, x)));
        const ny = Math.round(Math.max(-50, Math.min(MAP_PIXEL_H - canvasHeight + 50, y)));
        if (nx !== camera.x || ny !== camera.y) {
            camera.x = nx;
            camera.y = ny;
            dirty = true;
        }
    }

    function moveCamera(dx, dy) {
        setCamera(camera.x + dx, camera.y + dy);
    }

    function screenToWorld(sx, sy) {
        return {
            x: sx + camera.x,
            y: sy + camera.y,
        };
    }

    function screenToTile(sx, sy) {
        const w = screenToWorld(sx, sy);
        return {
            x: Math.floor(w.x / TILE_SIZE),
            y: Math.floor(w.y / TILE_SIZE),
        };
    }

    function markDirty() { dirty = true; }

    // ---- Trees ----
    function treeSprite(t) {
        return t.type === 'pine' ? Sprites.drawPineTree() : Sprites.drawTree();
    }

    function drawTree(c, t, offX, offY) {
        const sprite = treeSprite(t);
        c.drawImage(sprite,
            Math.round(t.x - offX - sprite.width / 2),
            Math.round(t.y - offY - sprite.height + 16));
    }

    function treeRect(t) {
        const sprite = treeSprite(t);
        return {
            x: t.x - sprite.width / 2,
            y: t.y - sprite.height + 16,
            w: sprite.width,
            h: sprite.height,
        };
    }

    // ---- Static layer: everything that never moves ----
    function renderTerrainCache() {
        if (terrainCanvas) return;
        terrainCanvas = document.createElement('canvas');
        terrainCanvas.width = MAP_PIXEL_W;
        terrainCanvas.height = MAP_PIXEL_H;
        const tctx = terrainCanvas.getContext('2d');

        const terrainGrid = GameMap.getTerrainGrid();
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                const t = terrainGrid[y][x];
                let color;
                switch (t) {
                    case TERRAIN.GRASS: color = COLORS.grassLight; break;
                    case TERRAIN.GRASS_DARK: color = COLORS.grassDark; break;
                    case TERRAIN.WATER: color = COLORS.water; break;
                    case TERRAIN.SAND: color = COLORS.sand; break;
                    case TERRAIN.DIRT: color = COLORS.dirt; break;
                    case TERRAIN.FOREST: color = COLORS.grassDark; break;
                    case TERRAIN.STONE_DEPOSIT: color = '#6a6a5a'; break;
                    case TERRAIN.FLOWERS: color = COLORS.grassLight; break;
                    default: color = COLORS.grassLight;
                }
                tctx.fillStyle = color;
                tctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

                // Add subtle grid line
                tctx.fillStyle = 'rgba(0,0,0,0.04)';
                tctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, 1);
                tctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, 1, TILE_SIZE);

                // Water shimmer
                if (t === TERRAIN.WATER) {
                    if ((x + y) % 3 === 0) {
                        tctx.fillStyle = 'rgba(255,255,255,0.1)';
                        tctx.fillRect(x * TILE_SIZE + 4, y * TILE_SIZE + 4, 8, 2);
                    }
                }

                // Stone deposit texture
                if (t === TERRAIN.STONE_DEPOSIT) {
                    tctx.fillStyle = '#7a7a6a';
                    tctx.fillRect(x * TILE_SIZE + 4, y * TILE_SIZE + 4, 12, 8);
                    tctx.fillStyle = '#5a5a4a';
                    tctx.fillRect(x * TILE_SIZE + 8, y * TILE_SIZE + 12, 16, 10);
                }
            }
        }

        // Flower decorations
        GameMap.getDecorations().forEach(d => {
            const flowerSprite = Sprites.drawFlowers(2, d.seed);
            tctx.drawImage(flowerSprite, d.x * TILE_SIZE, d.y * TILE_SIZE);
        });

        // Stone piles
        const stonePileSprite = Sprites.drawStonePile();
        GameMap.getStones().forEach(s => {
            tctx.drawImage(stonePileSprite, Math.round(s.x), Math.round(s.y));
        });

        // Trees (already sorted by y in GameMap, so overlaps are correct)
        GameMap.getTrees().forEach(t => drawTree(tctx, t, 0, 0));

        lastBuildingsVersion = -1; // front trees depend on the map
        dirty = true;
    }

    function rectsOverlap(a, b) {
        return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    }

    // Only runs when buildings change, not per frame
    function computeFrontTrees() {
        const rects = BuildingManager.getAll().map(b => ({ x: b.pixelX, y: b.pixelY, w: b.width, h: b.height }));
        frontTrees = rects.length === 0 ? [] : GameMap.getTrees().filter(t => {
            const r = treeRect(t);
            return rects.some(br => rectsOverlap(r, br));
        });
    }

    // Night tint alpha for the current day phase, quantized so we only
    // redraw when the change is actually visible
    function nightTintKey() {
        const dayPhase = Game.getState().dayProgress;
        let alpha = 0;
        if (dayPhase > 0.7) alpha = (dayPhase - 0.7) / 0.3 * 0.15;
        else if (dayPhase < 0.15) alpha = (0.15 - dayPhase) / 0.15 * 0.15;
        return Math.round(alpha * 255);
    }

    function previewKey(pp) {
        return pp ? `${pp.type}|${pp.tileX}|${pp.tileY}|${pp.valid}` : '';
    }

    // Returns true when a frame was actually drawn
    function render(placementPreview) {
        renderTerrainCache();

        const version = BuildingManager.getVersion();
        if (version !== lastBuildingsVersion) {
            lastBuildingsVersion = version;
            computeFrontTrees();
            dirty = true;
        }

        const tintKey = nightTintKey();
        const pKey = previewKey(placementPreview);
        const day = Game.getState().day;
        if (tintKey !== lastTintKey || pKey !== lastPreviewKey || day !== lastDay) dirty = true;
        if (!dirty) return false;

        lastTintKey = tintKey;
        lastPreviewKey = pKey;
        lastDay = day;
        dirty = false;

        // Background (for areas outside map)
        ctx.fillStyle = '#1a3a1a';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Static layer (only the visible portion)
        const sx = Math.max(0, camera.x);
        const sy = Math.max(0, camera.y);
        const sw = Math.min(MAP_PIXEL_W, camera.x + canvasWidth) - sx;
        const sh = Math.min(MAP_PIXEL_H, camera.y + canvasHeight) - sy;
        if (sw > 0 && sh > 0) {
            ctx.drawImage(terrainCanvas, sx, sy, sw, sh, sx - camera.x, sy - camera.y, sw, sh);
        }

        // Dynamic, depth-sorted pass: buildings + trees overlapping them
        const viewL = camera.x, viewT = camera.y, viewR = camera.x + canvasWidth, viewB = camera.y + canvasHeight;
        const drawables = [];
        const visibleBuildings = [];

        BuildingManager.getAll().forEach(b => {
            if (b.pixelX + b.width > viewL && b.pixelX < viewR && b.pixelY + b.height > viewT && b.pixelY < viewB) {
                drawables.push({ y: b.pixelY + b.height, building: b });
                visibleBuildings.push(b);
            }
        });
        frontTrees.forEach(t => {
            const r = treeRect(t);
            if (r.x + r.w > viewL && r.x < viewR && r.y + r.h > viewT && r.y < viewB) {
                drawables.push({ y: t.y + 30, tree: t });
            }
        });

        drawables.sort((a, b) => a.y - b.y);
        drawables.forEach(d => {
            if (d.building) {
                const b = d.building;
                const sprite = Sprites.getBuilding(b.type, { grown: b.grown });
                if (sprite) ctx.drawImage(sprite, b.pixelX - camera.x, b.pixelY - camera.y);
            } else {
                drawTree(ctx, d.tree, camera.x, camera.y);
            }
        });

        // Labels always on top of trees and neighbours
        visibleBuildings.forEach(b => drawBuildingLabels(b, b.pixelX - camera.x, b.pixelY - camera.y));

        // Placement preview
        if (placementPreview) drawPlacementPreview(placementPreview);

        // Day/night cycle tint
        if (tintKey > 0) {
            ctx.fillStyle = `rgba(10, 10, 40, ${(tintKey / 255).toFixed(3)})`;
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        }
        return true;
    }

    function drawBuildingLabels(b, bx, by) {
        // Worker indicator
        if (b.maxWorkers > 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(bx + 2, by + b.height - 10, 36, 10);
            ctx.fillStyle = b.active ? '#4a4' : '#a44';
            ctx.font = '9px monospace';
            ctx.fillText(`👤${b.workers}/${b.maxWorkers}`, bx + 4, by + b.height - 2);
        }

        // Growth progress for orchards
        if (!b.grown && b.def.production?.growthDays) {
            const pct = b.growthProgress / b.def.production.growthDays;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(bx + 2, by - 10, b.width - 4, 8);
            ctx.fillStyle = '#4a4';
            ctx.fillRect(bx + 3, by - 9, (b.width - 6) * pct, 6);
            ctx.fillStyle = '#fff';
            ctx.font = '8px monospace';
            ctx.fillText('Growing...', bx + 4, by - 3);
        }
    }

    function drawPlacementPreview(pp) {
        const def = BUILDINGS[pp.type];
        if (!def) return;
        const px = pp.tileX * TILE_SIZE - camera.x;
        const py = pp.tileY * TILE_SIZE - camera.y;
        const pw = def.width * TILE_SIZE;
        const ph = def.height * TILE_SIZE;

        // Preview sprite with transparency
        ctx.globalAlpha = 0.6;
        const sprite = Sprites.getBuilding(pp.type);
        if (sprite) ctx.drawImage(sprite, px, py);
        ctx.globalAlpha = 1;

        // Placement outline + tint
        const canBuild = pp.valid;
        ctx.strokeStyle = canBuild ? 'rgba(0, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(px, py, pw, ph);
        ctx.fillStyle = canBuild ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 0, 0, 0.15)';
        ctx.fillRect(px, py, pw, ph);
    }

    return {
        init,
        resize,
        getCamera,
        setCamera,
        moveCamera,
        screenToWorld,
        screenToTile,
        render,
        markDirty,
        invalidateTerrainCache: () => { terrainCanvas = null; dirty = true; },
    };
})();
