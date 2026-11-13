// ============================================
// Map Generation
// ============================================

const GameMap = (() => {
    let terrain = [];  // 2D array [y][x] of terrain types
    let treeMap = [];  // Positions of trees for rendering
    let stoneMap = []; // Positions of stone deposits
    let decorations = []; // Flowers, etc.
    let currentSeed = 42;
    let elevation = null; // tile-resolution elevation (0..1) for hill shading

    // Seeded random
    function seededRandom(seed) {
        let s = seed;
        return function() {
            s = (s * 16807 + 0) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }

    // Simple 2D noise approximation
    function generateNoise(w, h, scale, rng) {
        const noise = [];
        // Generate base grid
        const gw = Math.ceil(w / scale) + 2;
        const gh = Math.ceil(h / scale) + 2;
        const grid = [];
        for (let y = 0; y < gh; y++) {
            grid[y] = [];
            for (let x = 0; x < gw; x++) {
                grid[y][x] = rng();
            }
        }
        // Interpolate
        for (let y = 0; y < h; y++) {
            noise[y] = [];
            for (let x = 0; x < w; x++) {
                const gx = x / scale;
                const gy = y / scale;
                const ix = Math.floor(gx);
                const iy = Math.floor(gy);
                const fx = gx - ix;
                const fy = gy - iy;
                // Smoothstep
                const sx = fx * fx * (3 - 2 * fx);
                const sy = fy * fy * (3 - 2 * fy);
                const v00 = grid[iy]?.[ix] || 0;
                const v10 = grid[iy]?.[ix + 1] || 0;
                const v01 = grid[iy + 1]?.[ix] || 0;
                const v11 = grid[iy + 1]?.[ix + 1] || 0;
                const v0 = v00 + sx * (v10 - v00);
                const v1 = v01 + sx * (v11 - v01);
                noise[y][x] = v0 + sy * (v1 - v0);
            }
        }
        return noise;
    }

    function generate(seed = 42) {
        currentSeed = seed;
        const rng = seededRandom(seed);
        terrain = [];
        treeMap = [];
        stoneMap = [];
        decorations = [];

        // Generate elevation noise at different scales
        elevation = generateNoise(MAP_WIDTH, MAP_HEIGHT, 12, seededRandom(seed));
        const moisture = generateNoise(MAP_WIDTH, MAP_HEIGHT, 8, seededRandom(seed + 100));
        const detail = generateNoise(MAP_WIDTH, MAP_HEIGHT, 4, seededRandom(seed + 200));

        for (let y = 0; y < MAP_HEIGHT; y++) {
            terrain[y] = [];
            for (let x = 0; x < MAP_WIDTH; x++) {
                const e = elevation[y][x] + detail[y][x] * 0.3;
                const m = moisture[y][x];

                // Determine terrain type
                if (e < 0.25) {
                    terrain[y][x] = TERRAIN.WATER;
                } else if (e < 0.30) {
                    terrain[y][x] = TERRAIN.SAND;
                } else if (e > 0.85 && m < 0.5) {
                    terrain[y][x] = TERRAIN.STONE_DEPOSIT;
                } else if (m > 0.6 && e > 0.35 && e < 0.75) {
                    terrain[y][x] = TERRAIN.FOREST;
                } else if (e > 0.4 && e < 0.6 && m > 0.3 && m < 0.5 && rng() > 0.85) {
                    terrain[y][x] = TERRAIN.FLOWERS;
                } else {
                    // light and dark grass in natural patches instead of a per-tile checkerboard
                    terrain[y][x] = detail[y][x] + (rng() - 0.5) * 0.12 > 0.52 ? TERRAIN.GRASS_DARK : TERRAIN.GRASS;
                }
            }
        }

        // Ensure a clearing in the center for castle placement
        const cx = Math.floor(MAP_WIDTH / 2);
        const cy = Math.floor(MAP_HEIGHT / 2);
        for (let dy = -6; dy <= 6; dy++) {
            for (let dx = -6; dx <= 6; dx++) {
                const tx = cx + dx;
                const ty = cy + dy;
                if (tx >= 0 && tx < MAP_WIDTH && ty >= 0 && ty < MAP_HEIGHT) {
                    if (terrain[ty][tx] === TERRAIN.WATER || terrain[ty][tx] === TERRAIN.FOREST || terrain[ty][tx] === TERRAIN.STONE_DEPOSIT) {
                        terrain[ty][tx] = TERRAIN.GRASS;
                    }
                }
            }
        }

        // Ground variety (own noise, so water, forests and stone fields stay exactly where
        // they were and old saves keep working): sand only on shores, rocky ground on high
        // land and around stone fields, dry meadows where it is dry.
        const rocky = generateNoise(MAP_WIDTH, MAP_HEIGHT, 5, seededRandom(seed + 300));
        const dry = generateNoise(MAP_WIDTH, MAP_HEIGHT, 7, seededRandom(seed + 400));
        const near = (x, y, type, r) => {
            for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r + 1) continue;
                const xx = x + dx, yy = y + dy;
                if (xx >= 0 && yy >= 0 && xx < MAP_WIDTH && yy < MAP_HEIGHT && terrain[yy][xx] === type) return true;
            }
            return false;
        };
        const inClearing = (x, y) => Math.abs(x - cx) <= 6 && Math.abs(y - cy) <= 6;
        const orig = terrain.map(row => row.slice());
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                const t = orig[y][x];
                const isGrass = t === TERRAIN.GRASS || t === TERRAIN.GRASS_DARK;
                if (t === TERRAIN.SAND && !near(x, y, TERRAIN.WATER, 2)) {
                    terrain[y][x] = TERRAIN.GRASS;
                    continue;
                }
                if (!isGrass) continue;
                const e = elevation[y][x] + detail[y][x] * 0.3;
                if (!inClearing(x, y) && near(x, y, TERRAIN.WATER, 1) && rocky[y][x] > 0.3) { terrain[y][x] = TERRAIN.SAND; continue; }
                const nearStone = near(x, y, TERRAIN.STONE_DEPOSIT, 2);
                if ((nearStone && rocky[y][x] > 0.5) || (e > 0.78 && rocky[y][x] > 0.6) || rocky[y][x] > 0.8) { terrain[y][x] = TERRAIN.ROCKY; continue; }
                if (dry[y][x] > 0.62 && moisture[y][x] < 0.5) terrain[y][x] = TERRAIN.MEADOW;
            }
        }

        // Generate tree positions within forest tiles
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                if (terrain[y][x] === TERRAIN.FOREST) {
                    // 1-2 trees per forest tile
                    const numTrees = rng() > 0.4 ? 2 : 1;
                    for (let i = 0; i < numTrees; i++) {
                        treeMap.push({
                            x: x * TILE_SIZE + rng() * (TILE_SIZE - 8),
                            y: y * TILE_SIZE + rng() * (TILE_SIZE - 8),
                            type: rng() > 0.4 ? 'oak' : 'pine',
                            scale: 1.5 + rng() * 1,
                        });
                    }
                }
            }
        }
        // Sort trees by y for depth
        treeMap.sort((a, b) => a.y - b.y);

        // Generate stone pile positions
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                if (terrain[y][x] === TERRAIN.STONE_DEPOSIT) {
                    if (rng() > 0.3) {
                        stoneMap.push({
                            x: x * TILE_SIZE + rng() * (TILE_SIZE - 12),
                            y: y * TILE_SIZE + rng() * (TILE_SIZE - 6) + 6,
                        });
                    }
                }
            }
        }

        // Generate flower decorations
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                if (terrain[y][x] === TERRAIN.FLOWERS) {
                    decorations.push({
                        x: x,
                        y: y,
                        seed: Math.floor(rng() * 10000),
                    });
                }
            }
        }
    }

    // Tile range a pixel rect overlaps (any positive area), inclusive bounds.
    // Footprints are free (world pixels), terrain stays a tile grid.
    function rectTiles(x, y, w, h) {
        return {
            x0: Math.floor(x / TILE_SIZE), y0: Math.floor(y / TILE_SIZE),
            x1: Math.ceil((x + w) / TILE_SIZE) - 1, y1: Math.ceil((y + h) / TILE_SIZE) - 1,
        };
    }

    // Clear trees, stone piles and flowers under a building footprint (world pixels).
    // A terrain tile is cleared when its centre lies under the footprint, so an
    // off-grid building clears exactly as many tiles as one on the grid.
    // Returns true when terrain tiles changed (terrain cache must be rebuilt).
    function clearArea(x, y, w, h, opts = {}) {
        let changed = false;
        const x0 = x, y0 = y, x1 = x + w, y1 = y + h;
        const r = rectTiles(x, y, w, h);
        for (let ty = r.y0; ty <= r.y1; ty++) {
            for (let tx = r.x0; tx <= r.x1; tx++) {
                if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) continue;
                const cx = tx * TILE_SIZE + TILE_SIZE / 2, cy = ty * TILE_SIZE + TILE_SIZE / 2;
                if (cx < x0 || cx >= x1 || cy < y0 || cy >= y1) continue;
                const t = terrain[ty][tx];
                // a quarry keeps the stone field it stands on
                if (t === TERRAIN.FOREST || (t === TERRAIN.STONE_DEPOSIT && !opts.keepStone) || t === TERRAIN.FLOWERS) {
                    terrain[ty][tx] = TERRAIN.GRASS;
                    changed = true;
                }
            }
        }
        const nTrees = treeMap.length, nStones = stoneMap.length;
        treeMap = treeMap.filter(t => !(t.x >= x0 - 6 && t.x < x1 + 6 && t.y + 16 >= y0 && t.y + 16 < y1 + 10));
        stoneMap = stoneMap.filter(s => !(s.x + 32 > x0 + 4 && s.x < x1 - 4 && s.y + 24 > y0 + 4 && s.y < y1));
        const nDec = decorations.length;
        // decorations sit on tile coordinates: same centre rule as the terrain
        decorations = decorations.filter(d => {
            const cx = d.x * TILE_SIZE + TILE_SIZE / 2, cy = d.y * TILE_SIZE + TILE_SIZE / 2;
            return !(cx >= x0 && cx < x1 && cy >= y0 && cy < y1);
        });
        if (decorations.length !== nDec) changed = true;
        return changed || treeMap.length !== nTrees || stoneMap.length !== nStones;
    }

    function getTerrain(x, y) {
        if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return TERRAIN.WATER;
        return terrain[y][x];
    }

    function getTerrainGrid() { return terrain; }
    function getSeed() { return currentSeed; }

    // Deterministic tile texture variant for a coordinate
    function getVariant(x, y) {
        return ((x * 7 + y * 13 + (x * y) % 5) % Sprites.TILE_VARIANTS + Sprites.TILE_VARIANTS) % Sprites.TILE_VARIANTS;
    }
    function getTrees() { return treeMap; }
    // Smooth elevation (0..1) at a fractional tile coordinate
    function getElevation(fx, fy) {
        if (!elevation) return 0.5;
        fx = Math.max(0, Math.min(MAP_WIDTH - 1.001, fx)); fy = Math.max(0, Math.min(MAP_HEIGHT - 1.001, fy));
        const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const a = elevation[iy][ix], b = elevation[iy][ix + 1], c = elevation[iy + 1][ix], d = elevation[iy + 1][ix + 1];
        return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
    }
    function getStones() { return stoneMap; }
    function getDecorations() { return decorations; }

    // Does a footprint (world pixels) overlap a tile of one of these terrain types?
    function rectHasTerrain(x, y, w, h, types) {
        const r = rectTiles(x, y, w, h);
        for (let ty = r.y0; ty <= r.y1; ty++) {
            for (let tx = r.x0; tx <= r.x1; tx++) {
                if (types.includes(getTerrain(tx, ty))) return true;
            }
        }
        return false;
    }

    // Area (px²) of a footprint that lies on terrain of one type
    function terrainArea(x, y, w, h, type) {
        const r = rectTiles(x, y, w, h);
        let area = 0;
        for (let ty = r.y0; ty <= r.y1; ty++) {
            for (let tx = r.x0; tx <= r.x1; tx++) {
                if (getTerrain(tx, ty) !== type) continue;
                const ox = Math.min(x + w, (tx + 1) * TILE_SIZE) - Math.max(x, tx * TILE_SIZE);
                const oy = Math.min(y + h, (ty + 1) * TILE_SIZE) - Math.max(y, ty * TILE_SIZE);
                if (ox > 0 && oy > 0) area += ox * oy;
            }
        }
        return area;
    }

    // Building footprints that overlap a rect (touching edges is fine)
    function overlapsBuilding(x, y, w, h, placedBuildings) {
        for (const b of placedBuildings) {
            if (rectsOverlap(x, y, w, h, b.pixelX, b.pixelY, b.width, b.height)) return true;
        }
        return false;
    }

    // Check if a footprint (world pixels) is buildable: inside the map, no water or
    // sand under it, no other building overlapping it
    function isBuildable(x, y, w, h, placedBuildings) {
        if (rectHasTerrain(x, y, w, h, [TERRAIN.WATER, TERRAIN.SAND])) return false; // off-map reads as water
        return !overlapsBuilding(x, y, w, h, placedBuildings);
    }

    function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
        return !(x1 + w1 <= x2 || x2 + w2 <= x1 || y1 + h1 <= y2 || y2 + h2 <= y1);
    }

    // Check if there's a required resource near a footprint (within N tiles of
    // every tile it touches)
    function hasNearbyResource(x, y, w, h, terrainType, radius = 5) {
        const r = rectTiles(x, y, w, h);
        for (let ty = r.y0 - radius; ty <= r.y1 + radius; ty++) {
            for (let tx = r.x0 - radius; tx <= r.x1 + radius; tx++) {
                if (getTerrain(tx, ty) === TERRAIN[terrainType]) return true;
            }
        }
        return false;
    }

    return {
        generate,
        getTerrain,
        getTerrainGrid,
        getSeed,
        getVariant,
        getTrees,
        getElevation,
        getStones,
        getDecorations,
        isBuildable,
        rectTiles,
        rectHasTerrain,
        terrainArea,
        overlapsBuilding,
        clearArea,
        hasNearbyResource,
    };
})();
