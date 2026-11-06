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

    // Clear trees, stone piles and flowers under a building footprint.
    // Returns true when terrain tiles changed (terrain cache must be rebuilt).
    function clearArea(tileX, tileY, w, h, opts = {}) {
        let changed = false;
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                const tx = tileX + dx, ty = tileY + dy;
                if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) continue;
                const t = terrain[ty][tx];
                // a quarry keeps the stone field it stands on
                if (t === TERRAIN.FOREST || (t === TERRAIN.STONE_DEPOSIT && !opts.keepStone) || t === TERRAIN.FLOWERS) {
                    terrain[ty][tx] = TERRAIN.GRASS;
                    changed = true;
                }
            }
        }
        const x0 = tileX * TILE_SIZE, y0 = tileY * TILE_SIZE;
        const x1 = x0 + w * TILE_SIZE, y1 = y0 + h * TILE_SIZE;
        const nTrees = treeMap.length, nStones = stoneMap.length;
        treeMap = treeMap.filter(t => !(t.x >= x0 - 6 && t.x < x1 + 6 && t.y + 16 >= y0 && t.y + 16 < y1 + 10));
        stoneMap = stoneMap.filter(s => !(s.x + 32 > x0 + 4 && s.x < x1 - 4 && s.y + 24 > y0 + 4 && s.y < y1));
        const nDec = decorations.length;
        decorations = decorations.filter(d => !(d.x >= tileX && d.x < tileX + w && d.y >= tileY && d.y < tileY + h));
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

    // Check if area is buildable (not water, not on existing buildings)
    function isBuildable(tileX, tileY, width, height, placedBuildings) {
        for (let dy = 0; dy < height; dy++) {
            for (let dx = 0; dx < width; dx++) {
                const tx = tileX + dx;
                const ty = tileY + dy;
                const t = getTerrain(tx, ty);
                if (t === TERRAIN.WATER || t === TERRAIN.SAND) return false;
            }
        }
        // Check overlap with existing buildings
        for (const b of placedBuildings) {
            if (rectsOverlap(tileX, tileY, width, height, b.tileX, b.tileY, b.def.width, b.def.height)) {
                return false;
            }
        }
        return true;
    }

    function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
        return !(x1 + w1 <= x2 || x2 + w2 <= x1 || y1 + h1 <= y2 || y2 + h2 <= y1);
    }

    // Check if there's a required resource nearby (within N tiles)
    function hasNearbyResource(tileX, tileY, width, height, terrainType, radius = 5) {
        for (let dy = -radius; dy < height + radius; dy++) {
            for (let dx = -radius; dx < width + radius; dx++) {
                const tx = tileX + dx;
                const ty = tileY + dy;
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
        clearArea,
        hasNearbyResource,
    };
})();
