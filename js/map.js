// ============================================
// Map Generation
// ============================================

const GameMap = (() => {
    let terrain = [];  // 2D array [y][x] of terrain types
    let treeMap = [];  // Positions of trees for rendering
    let stoneMap = []; // Positions of stone deposits
    let decorations = []; // Flowers, etc.

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
        const rng = seededRandom(seed);
        terrain = [];
        treeMap = [];
        stoneMap = [];
        decorations = [];

        // Generate elevation noise at different scales
        const elevation = generateNoise(MAP_WIDTH, MAP_HEIGHT, 12, seededRandom(seed));
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
                    terrain[y][x] = rng() > 0.5 ? TERRAIN.GRASS : TERRAIN.GRASS_DARK;
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

    function getTerrain(x, y) {
        if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return TERRAIN.WATER;
        return terrain[y][x];
    }

    function getTerrainGrid() { return terrain; }
    function getTrees() { return treeMap; }
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
        getTrees,
        getStones,
        getDecorations,
        isBuildable,
        hasNearbyResource,
    };
})();
