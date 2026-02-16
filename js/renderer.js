// ============================================
// Renderer - Canvas Drawing
// ============================================

const Renderer = (() => {
    let canvas, ctx;
    let camera = { x: 0, y: 0 };
    let canvasWidth, canvasHeight;

    // Terrain tile cache
    let terrainCanvas = null;

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
        // Invalidate terrain cache on resize
        terrainCanvas = null;
    }

    function getCamera() { return camera; }

    function setCamera(x, y) {
        // Clamp camera
        const menuWidth = 220;
        camera.x = Math.max(0, Math.min(MAP_PIXEL_W - canvasWidth + menuWidth, x));
        camera.y = Math.max(-50, Math.min(MAP_PIXEL_H - canvasHeight + 50, y));
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

    // Pre-render terrain tiles to a big canvas
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

                // Water animation shimmer
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

        // Draw flower decorations
        const decs = GameMap.getDecorations();
        decs.forEach(d => {
            const flowerSprite = Sprites.drawFlowers(2, d.seed);
            tctx.drawImage(flowerSprite, d.x * TILE_SIZE, d.y * TILE_SIZE);
        });
    }

    function render(placementPreview) {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // Background (for areas outside map)
        ctx.fillStyle = '#1a3a1a';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Render terrain cache
        renderTerrainCache();

        // Calculate visible area
        const startTileX = Math.max(0, Math.floor(camera.x / TILE_SIZE) - 1);
        const startTileY = Math.max(0, Math.floor(camera.y / TILE_SIZE) - 1);
        const endTileX = Math.min(MAP_WIDTH, Math.ceil((camera.x + canvasWidth) / TILE_SIZE) + 1);
        const endTileY = Math.min(MAP_HEIGHT, Math.ceil((camera.y + canvasHeight) / TILE_SIZE) + 1);

        // Draw terrain from cache (only visible portion)
        const sx = startTileX * TILE_SIZE;
        const sy = startTileY * TILE_SIZE;
        const sw = (endTileX - startTileX) * TILE_SIZE;
        const sh = (endTileY - startTileY) * TILE_SIZE;
        ctx.drawImage(terrainCanvas, sx, sy, sw, sh,
            sx - camera.x, sy - camera.y, sw, sh);

        // Draw stone piles
        const stonePileSprite = Sprites.drawStonePile();
        GameMap.getStones().forEach(s => {
            if (s.x + 32 > camera.x && s.x - 32 < camera.x + canvasWidth &&
                s.y + 24 > camera.y && s.y - 24 < camera.y + canvasHeight) {
                ctx.drawImage(stonePileSprite, s.x - camera.x, s.y - camera.y);
            }
        });

        // Collect all drawable things for depth sorting
        const drawables = [];

        // Trees
        const trees = GameMap.getTrees();
        trees.forEach(t => {
            if (t.x + 40 > camera.x && t.x - 40 < camera.x + canvasWidth &&
                t.y + 60 > camera.y && t.y - 60 < camera.y + canvasHeight) {
                drawables.push({
                    y: t.y + 30, // Sort by base
                    draw: () => {
                        const sprite = t.type === 'pine' ? Sprites.drawPineTree() : Sprites.drawTree();
                        ctx.drawImage(sprite,
                            t.x - camera.x - sprite.width / 2,
                            t.y - camera.y - sprite.height + 16);
                    }
                });
            }
        });

        // Buildings
        const buildings = BuildingManager.getAll();
        buildings.forEach(b => {
            const bx = b.pixelX - camera.x;
            const by = b.pixelY - camera.y;
            if (bx + b.width > 0 && bx < canvasWidth && by + b.height > 0 && by < canvasHeight) {
                drawables.push({
                    y: b.pixelY + b.height,
                    draw: () => {
                        const sprite = Sprites.getBuilding(b.type, { grown: b.grown });
                        if (sprite) {
                            ctx.drawImage(sprite, bx, by);
                        }

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
                });
            }
        });

        // Sort by Y and draw
        drawables.sort((a, b) => a.y - b.y);
        drawables.forEach(d => d.draw());

        // Placement preview
        if (placementPreview) {
            const pp = placementPreview;
            const def = BUILDINGS[pp.type];
            if (def) {
                const px = pp.tileX * TILE_SIZE - camera.x;
                const py = pp.tileY * TILE_SIZE - camera.y;
                const pw = def.width * TILE_SIZE;
                const ph = def.height * TILE_SIZE;

                // Draw preview sprite with transparency
                ctx.globalAlpha = 0.6;
                const sprite = Sprites.getBuilding(pp.type);
                if (sprite) {
                    ctx.drawImage(sprite, px, py);
                }
                ctx.globalAlpha = 1;

                // Draw placement grid
                const canBuild = pp.valid;
                ctx.strokeStyle = canBuild ? 'rgba(0, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)';
                ctx.lineWidth = 2;
                ctx.strokeRect(px, py, pw, ph);

                // Fill with tint
                ctx.fillStyle = canBuild ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 0, 0, 0.15)';
                ctx.fillRect(px, py, pw, ph);
            }
        }

        // Day/night cycle tint
        const gs = Game.getState();
        const dayPhase = gs.dayProgress;
        // Subtle darkening at "night" part of cycle
        if (dayPhase > 0.7) {
            const nightAlpha = (dayPhase - 0.7) / 0.3 * 0.15;
            ctx.fillStyle = `rgba(10, 10, 40, ${nightAlpha})`;
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        } else if (dayPhase < 0.15) {
            const nightAlpha = (0.15 - dayPhase) / 0.15 * 0.15;
            ctx.fillStyle = `rgba(10, 10, 40, ${nightAlpha})`;
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        }
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
        invalidateTerrainCache: () => { terrainCanvas = null; },
    };
})();
