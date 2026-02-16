// ============================================
// Pixel Art Sprite Rendering
// ============================================

const Sprites = (() => {
    // Cache for pre-rendered sprites
    const cache = {};

    function createCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        return c;
    }

    // Draw a single pixel (scaled)
    function px(ctx, x, y, color, scale = 1) {
        ctx.fillStyle = color;
        ctx.fillRect(x * scale, y * scale, scale, scale);
    }

    // ---- TREES ----
    function drawTree(scale = 2) {
        const key = `tree_${scale}`;
        if (cache[key]) return cache[key];
        const c = createCanvas(16 * scale, 24 * scale);
        const ctx = c.getContext('2d');

        // Trunk
        for (let y = 14; y < 24; y++) {
            for (let x = 6; x < 10; x++) {
                px(ctx, x, y, y % 3 === 0 ? '#5a3418' : '#6b4226', scale);
            }
        }
        // Leaves - round top
        const leafColors = ['#2d6b1e', '#3a8528', '#247a16', '#1d5b0e', '#35782a'];
        for (let y = 2; y < 15; y++) {
            for (let x = 2; x < 14; x++) {
                const dx = x - 8, dy = y - 8;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 6.5) {
                    const ci = (x * 3 + y * 7) % leafColors.length;
                    px(ctx, x, y, leafColors[ci], scale);
                }
            }
        }
        // Highlights
        px(ctx, 5, 5, '#4a9538', scale);
        px(ctx, 6, 4, '#4a9538', scale);

        cache[key] = c;
        return c;
    }

    // ---- PINE TREE ----
    function drawPineTree(scale = 2) {
        const key = `pine_${scale}`;
        if (cache[key]) return cache[key];
        const c = createCanvas(16 * scale, 28 * scale);
        const ctx = c.getContext('2d');

        // Trunk
        for (let y = 20; y < 28; y++) {
            for (let x = 7; x < 9; x++) {
                px(ctx, x, y, y % 2 === 0 ? '#5a3418' : '#6b4226', scale);
            }
        }
        // Layers of branches
        const layers = [
            { y: 2, w: 2 },
            { y: 5, w: 4 },
            { y: 8, w: 5 },
            { y: 11, w: 6 },
            { y: 14, w: 7 },
            { y: 17, w: 7 },
            { y: 20, w: 5 },
        ];
        const pineColors = ['#1d5b0e', '#2a6b18', '#1a5010', '#256b15'];
        layers.forEach(l => {
            for (let dy = 0; dy < 3; dy++) {
                const w = l.w - dy;
                for (let dx = -w; dx <= w; dx++) {
                    const ci = (Math.abs(dx) + dy + l.y) % pineColors.length;
                    px(ctx, 8 + dx, l.y + dy, pineColors[ci], scale);
                }
            }
        });

        cache[key] = c;
        return c;
    }

    // ---- STONE PILE ----
    function drawStonePile(scale = 2) {
        const key = `stone_${scale}`;
        if (cache[key]) return cache[key];
        const c = createCanvas(16 * scale, 12 * scale);
        const ctx = c.getContext('2d');

        const stones = [
            { x: 3, y: 6, w: 5, h: 5, color: '#9a9a9a' },
            { x: 8, y: 5, w: 6, h: 6, color: '#8a8a8a' },
            { x: 5, y: 3, w: 4, h: 4, color: '#aaa' },
            { x: 1, y: 8, w: 3, h: 3, color: '#7a7a7a' },
            { x: 12, y: 7, w: 3, h: 4, color: '#888' },
        ];
        stones.forEach(s => {
            ctx.fillStyle = s.color;
            ctx.fillRect(s.x * scale, s.y * scale, s.w * scale, s.h * scale);
            // Highlight
            ctx.fillStyle = '#bbb';
            ctx.fillRect(s.x * scale, s.y * scale, s.w * scale, 1 * scale);
            // Shadow
            ctx.fillStyle = '#666';
            ctx.fillRect(s.x * scale, (s.y + s.h - 1) * scale, s.w * scale, 1 * scale);
        });

        cache[key] = c;
        return c;
    }

    // ---- FLOWER PATCH ----
    function drawFlowers(scale = 2, seed = 0) {
        const key = `flowers_${scale}_${seed}`;
        if (cache[key]) return cache[key];
        const c = createCanvas(TILE_SIZE, TILE_SIZE);
        const ctx = c.getContext('2d');

        const flowerColors = ['#d44', '#dd4', '#d4d', '#f84', '#48f'];
        const rng = mulberry32(seed);
        for (let i = 0; i < 5; i++) {
            const fx = Math.floor(rng() * 28) + 2;
            const fy = Math.floor(rng() * 28) + 2;
            const fc = flowerColors[Math.floor(rng() * flowerColors.length)];
            ctx.fillStyle = fc;
            ctx.fillRect(fx, fy, 2, 2);
            ctx.fillStyle = '#2d6b1e';
            ctx.fillRect(fx, fy + 2, 1, 2);
        }

        cache[key] = c;
        return c;
    }

    // ---- BUILDINGS ----

    function drawCastle(scale = 2) {
        const key = `castle_${scale}`;
        if (cache[key]) return cache[key];
        const w = 4 * TILE_SIZE, h = 4 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');
        const s = 2; // pixel size

        // Base walls
        ctx.fillStyle = '#8a8070';
        ctx.fillRect(8, 24, w - 16, h - 32);

        // Wall texture
        for (let y = 24; y < h - 8; y += 8) {
            for (let x = 8; x < w - 8; x += 12) {
                const offset = (Math.floor(y / 8) % 2) * 6;
                ctx.fillStyle = '#706858';
                ctx.fillRect(x + offset, y, 1, 8);
                ctx.fillStyle = '#9a9080';
                ctx.fillRect(x + offset + 1, y, 11, 1);
            }
        }

        // Towers (4 corners)
        const towerW = 24, towerH = h - 8;
        const towers = [[0, 8], [w - towerW, 8]];
        towers.forEach(([tx, ty]) => {
            ctx.fillStyle = '#7a7060';
            ctx.fillRect(tx, ty, towerW, towerH);
            // Battlements
            for (let bx = tx; bx < tx + towerW; bx += 8) {
                ctx.fillStyle = '#8a8070';
                ctx.fillRect(bx, ty, 5, 6);
                ctx.fillStyle = '#5a5040';
                ctx.fillRect(bx + 5, ty, 3, 10);
            }
            // Tower texture
            for (let y2 = ty + 10; y2 < ty + towerH; y2 += 8) {
                ctx.fillStyle = '#605848';
                ctx.fillRect(tx, y2, towerW, 1);
            }
        });

        // Main keep (center tower)
        const keepW = 40, keepH = 60;
        const kx = (w - keepW) / 2, ky = 4;
        ctx.fillStyle = '#8a7c68';
        ctx.fillRect(kx, ky, keepW, keepH);
        // Keep battlements
        for (let bx = kx; bx < kx + keepW; bx += 8) {
            ctx.fillStyle = '#9a8c78';
            ctx.fillRect(bx, ky, 5, 5);
            ctx.fillStyle = '#5a5040';
            ctx.fillRect(bx + 5, ky, 3, 8);
        }
        // Keep windows
        ctx.fillStyle = '#3a3020';
        ctx.fillRect(kx + 10, ky + 16, 6, 10);
        ctx.fillRect(kx + keepW - 16, ky + 16, 6, 10);
        // Keep door
        ctx.fillStyle = '#4a3820';
        ctx.fillRect(kx + 14, ky + 34, 12, 20);
        ctx.fillStyle = '#3a2810';
        ctx.fillRect(kx + 16, ky + 36, 8, 18);

        // Gate
        ctx.fillStyle = '#4a3820';
        ctx.fillRect(w / 2 - 12, h - 12, 24, 12);
        ctx.fillStyle = '#3a2810';
        ctx.fillRect(w / 2 - 8, h - 10, 16, 10);
        // Portcullis lines
        ctx.fillStyle = '#2a1808';
        for (let gx = w / 2 - 6; gx < w / 2 + 8; gx += 4) {
            ctx.fillRect(gx, h - 10, 1, 10);
        }

        // Flag on keep
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(w / 2 - 1, ky - 12, 2, 16);
        ctx.fillStyle = '#c22';
        ctx.fillRect(w / 2 + 1, ky - 12, 10, 7);
        ctx.fillStyle = '#a11';
        ctx.fillRect(w / 2 + 1, ky - 9, 10, 1);

        cache[key] = c;
        return c;
    }

    function drawHouse(scale = 2) {
        const key = `house_${scale}`;
        if (cache[key]) return cache[key];
        const w = 2 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        // Walls
        ctx.fillStyle = '#c4a060';
        ctx.fillRect(8, 20, w - 16, h - 24);

        // Wall detail
        ctx.fillStyle = '#b89050';
        ctx.fillRect(8, 35, w - 16, 2);

        // Roof
        ctx.fillStyle = '#8B4513';
        ctx.beginPath();
        ctx.moveTo(4, 22);
        ctx.lineTo(w / 2, 4);
        ctx.lineTo(w - 4, 22);
        ctx.closePath();
        ctx.fill();
        // Roof highlight
        ctx.fillStyle = '#9B5523';
        ctx.beginPath();
        ctx.moveTo(6, 21);
        ctx.lineTo(w / 2, 6);
        ctx.lineTo(w / 2, 21);
        ctx.closePath();
        ctx.fill();

        // Door
        ctx.fillStyle = '#5a3a18';
        ctx.fillRect(w / 2 - 5, h - 18, 10, 14);
        ctx.fillStyle = '#4a2a08';
        ctx.fillRect(w / 2 - 3, h - 16, 6, 12);

        // Window
        ctx.fillStyle = '#8bc4e8';
        ctx.fillRect(12, 26, 8, 8);
        ctx.fillStyle = '#5a3a18';
        ctx.fillRect(15, 26, 2, 8);
        ctx.fillRect(12, 29, 8, 2);

        cache[key] = c;
        return c;
    }

    function drawWarehouse(scale = 2) {
        const key = `warehouse_${scale}`;
        if (cache[key]) return cache[key];
        const w = 3 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        // Main structure
        ctx.fillStyle = '#9a8060';
        ctx.fillRect(6, 16, w - 12, h - 20);

        // Roof
        ctx.fillStyle = '#6a5030';
        ctx.fillRect(2, 12, w - 4, 8);
        ctx.fillStyle = '#7a6040';
        ctx.fillRect(4, 8, w - 8, 6);

        // Door (large)
        ctx.fillStyle = '#5a3a18';
        ctx.fillRect(w / 2 - 12, h - 26, 24, 22);
        ctx.fillStyle = '#4a2a08';
        ctx.fillRect(w / 2 - 10, h - 24, 20, 20);

        // Crates inside
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(w / 2 - 8, h - 16, 7, 7);
        ctx.fillRect(w / 2 + 1, h - 14, 7, 7);
        ctx.fillStyle = '#6B4F10';
        ctx.fillRect(w / 2 - 4, h - 20, 7, 7);

        // Cross beams on door
        ctx.fillStyle = '#3a1a08';
        ctx.fillRect(w / 2 - 10, h - 14, 20, 2);

        cache[key] = c;
        return c;
    }

    function drawLumberjack(scale = 2) {
        const key = `lumberjack_${scale}`;
        if (cache[key]) return cache[key];
        const w = 2 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        // Small cabin
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(6, 22, w - 12, h - 26);

        // Log texture
        for (let y = 24; y < h - 6; y += 5) {
            ctx.fillStyle = '#7a5a10';
            ctx.fillRect(6, y, w - 12, 1);
        }

        // Roof
        ctx.fillStyle = '#5a3a18';
        ctx.beginPath();
        ctx.moveTo(2, 24);
        ctx.lineTo(w / 2, 8);
        ctx.lineTo(w - 2, 24);
        ctx.closePath();
        ctx.fill();

        // Door
        ctx.fillStyle = '#4a2a08';
        ctx.fillRect(w / 2 - 5, h - 16, 10, 12);

        // Axe on side
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(w - 14, 28, 2, 20);
        ctx.fillStyle = '#aaa';
        ctx.fillRect(w - 18, 26, 8, 5);

        // Log pile
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(4, h - 10, 10, 4);
        ctx.fillRect(6, h - 14, 8, 4);
        ctx.fillStyle = '#6B4F10';
        ctx.fillRect(5, h - 10, 2, 4);
        ctx.fillRect(9, h - 10, 2, 4);

        cache[key] = c;
        return c;
    }

    function drawQuarry(scale = 2) {
        const key = `quarry_${scale}`;
        if (cache[key]) return cache[key];
        const w = 2 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        // Tent/shelter
        ctx.fillStyle = '#8a7a6a';
        ctx.fillRect(4, 20, w - 8, h - 24);

        // Stone texture
        for (let y = 22; y < h - 6; y += 6) {
            for (let x = 4; x < w - 8; x += 8) {
                ctx.fillStyle = (x + y) % 12 < 6 ? '#7a6a5a' : '#9a8a7a';
                ctx.fillRect(x, y, 7, 5);
            }
        }

        // Small roof
        ctx.fillStyle = '#6a5a4a';
        ctx.fillRect(2, 16, w - 4, 6);

        // Pickaxe
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(12, 10, 2, 14);
        ctx.fillStyle = '#aaa';
        ctx.fillRect(8, 8, 10, 4);

        // Stone blocks
        ctx.fillStyle = '#999';
        ctx.fillRect(w - 16, h - 12, 10, 6);
        ctx.fillStyle = '#aaa';
        ctx.fillRect(w - 14, h - 16, 8, 5);

        cache[key] = c;
        return c;
    }

    function drawIronMine(scale = 2) {
        const key = `ironmine_${scale}`;
        if (cache[key]) return cache[key];
        const w = 2 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        // Mine entrance (dark cave)
        ctx.fillStyle = '#5a5040';
        ctx.fillRect(6, 18, w - 12, h - 22);

        // Dark interior
        ctx.fillStyle = '#2a2018';
        ctx.fillRect(12, 24, w - 24, h - 28);

        // Support beams
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(10, 18, 4, h - 22);
        ctx.fillRect(w - 14, 18, 4, h - 22);
        ctx.fillRect(10, 18, w - 20, 4);

        // Ore cart
        ctx.fillStyle = '#666';
        ctx.fillRect(w / 2 - 6, h - 14, 12, 8);
        ctx.fillStyle = '#888';
        ctx.fillRect(w / 2 - 4, h - 18, 8, 5);
        // Wheels
        ctx.fillStyle = '#444';
        ctx.fillRect(w / 2 - 5, h - 7, 3, 3);
        ctx.fillRect(w / 2 + 3, h - 7, 3, 3);

        // Iron ore chunks
        ctx.fillStyle = '#8090a0';
        ctx.fillRect(w / 2 - 3, h - 16, 3, 3);
        ctx.fillRect(w / 2 + 1, h - 17, 3, 2);

        // Rocks around entrance
        ctx.fillStyle = '#7a7a7a';
        ctx.fillRect(2, h - 8, 8, 6);
        ctx.fillRect(w - 10, h - 10, 8, 8);

        cache[key] = c;
        return c;
    }

    function drawChickenHut(scale = 2) {
        const key = `chickenhut_${scale}`;
        if (cache[key]) return cache[key];
        const w = 2 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        // Fence
        ctx.fillStyle = '#8B6914';
        // Bottom fence
        ctx.fillRect(2, h - 6, w - 4, 2);
        // Posts
        for (let x = 2; x < w - 2; x += 10) {
            ctx.fillRect(x, h - 14, 2, 10);
        }
        // Rails
        ctx.fillStyle = '#7a5a10';
        ctx.fillRect(2, h - 12, w - 4, 1);
        ctx.fillRect(2, h - 8, w - 4, 1);

        // Small coop
        ctx.fillStyle = '#c4a060';
        ctx.fillRect(6, 18, 24, 20);
        // Coop roof
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(4, 14, 28, 6);
        // Coop door
        ctx.fillStyle = '#4a2a08';
        ctx.fillRect(14, 28, 8, 10);

        // Chickens (simple pixel birds)
        const chickPos = [[38, 40], [44, 36], [40, 48], [50, 44]];
        chickPos.forEach(([cx, cy]) => {
            // Body
            ctx.fillStyle = '#fff';
            ctx.fillRect(cx, cy, 6, 4);
            // Head
            ctx.fillStyle = '#fff';
            ctx.fillRect(cx + 5, cy - 2, 3, 3);
            // Beak
            ctx.fillStyle = '#da3';
            ctx.fillRect(cx + 8, cy - 1, 2, 1);
            // Comb
            ctx.fillStyle = '#c22';
            ctx.fillRect(cx + 6, cy - 3, 2, 1);
            // Legs
            ctx.fillStyle = '#da3';
            ctx.fillRect(cx + 1, cy + 4, 1, 2);
            ctx.fillRect(cx + 4, cy + 4, 1, 2);
        });

        cache[key] = c;
        return c;
    }

    function drawAppleOrchard(scale = 2, grown = true) {
        const key = `orchard_${scale}_${grown}`;
        if (cache[key]) return cache[key];
        const w = 3 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        // Trees in a row
        const treePositions = [[16, 10], [48, 8], [80, 10]];
        treePositions.forEach(([tx, ty]) => {
            // Trunk
            ctx.fillStyle = '#6b4226';
            ctx.fillRect(tx - 2, ty + 16, 4, 16);

            if (grown) {
                // Full leafy crown
                const leafColors = ['#2d6b1e', '#3a8528', '#247a16'];
                for (let dy = -2; dy < 14; dy++) {
                    for (let dx = -10; dx < 10; dx++) {
                        const dist = Math.sqrt(dx * dx + (dy - 5) * (dy - 5));
                        if (dist < 10) {
                            const ci = (Math.abs(dx) + dy) % leafColors.length;
                            ctx.fillStyle = leafColors[ci];
                            ctx.fillRect(tx + dx, ty + dy, 1, 1);
                        }
                    }
                }
                // Apples
                ctx.fillStyle = '#c22';
                ctx.fillRect(tx - 5, ty + 6, 3, 3);
                ctx.fillRect(tx + 3, ty + 4, 3, 3);
                ctx.fillRect(tx - 2, ty + 10, 3, 3);
                ctx.fillRect(tx + 6, ty + 8, 3, 3);
            } else {
                // Sapling - small leaves
                ctx.fillStyle = '#4a8538';
                ctx.fillRect(tx - 4, ty + 8, 8, 8);
                ctx.fillRect(tx - 2, ty + 5, 4, 4);
            }
        });

        // Small fence at bottom
        ctx.fillStyle = '#8B6914';
        for (let x = 4; x < w - 4; x += 12) {
            ctx.fillRect(x, h - 8, 2, 6);
        }
        ctx.fillStyle = '#7a5a10';
        ctx.fillRect(4, h - 5, w - 8, 1);

        cache[key] = c;
        return c;
    }

    // Simple seeded random for deterministic flowers
    function mulberry32(a) {
        return function() {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // Get building sprite by type
    function getBuilding(type, extra) {
        switch (type) {
            case 'castle': return drawCastle();
            case 'house': return drawHouse();
            case 'warehouse': return drawWarehouse();
            case 'lumberjack': return drawLumberjack();
            case 'quarry': return drawQuarry();
            case 'iron_mine': return drawIronMine();
            case 'chicken_hut': return drawChickenHut();
            case 'apple_orchard': return drawAppleOrchard(2, extra?.grown !== false);
            default: return null;
        }
    }

    return {
        drawTree,
        drawPineTree,
        drawStonePile,
        drawFlowers,
        getBuilding,
        mulberry32,
    };
})();
