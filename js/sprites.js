// ============================================
// Pixel Art Sprite Rendering
// All art is procedurally generated - no external assets.
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

    // Simple seeded random for deterministic details
    function mulberry32(a) {
        return function() {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // ============================================
    // TERRAIN TILES (32x32, 1px detail, several variants per type)
    // ============================================
    const TILE_VARIANTS = 4;

    function drawTile(type, variant) {
        const key = `tile_${type}_${variant}`;
        if (cache[key]) return cache[key];
        const T = TILE_SIZE;
        const c = createCanvas(T, T);
        const ctx = c.getContext('2d');
        const rng = mulberry32(type * 1000 + variant * 7 + 13);
        const pick = (arr) => arr[Math.floor(rng() * arr.length)];
        const fill = (col) => { ctx.fillStyle = col; ctx.fillRect(0, 0, T, T); };
        const patches = (n, colors, size) => {
            for (let i = 0; i < n; i++) {
                ctx.fillStyle = pick(colors);
                ctx.fillRect(Math.floor(rng() * T), Math.floor(rng() * T), 1 + Math.floor(rng() * size), 1 + Math.floor(rng() * size * 0.6));
            }
        };
        const dots = (n, colors) => {
            for (let i = 0; i < n; i++) {
                ctx.fillStyle = pick(colors);
                ctx.fillRect(Math.floor(rng() * T), Math.floor(rng() * T), 1, 1);
            }
        };
        // little grass blades: dark root pixel, light tip, sometimes a bent second tip
        const blades = (n, light, dark) => {
            for (let i = 0; i < n; i++) {
                const x = Math.floor(rng() * T), y = 2 + Math.floor(rng() * (T - 2));
                ctx.fillStyle = dark; ctx.fillRect(x, y, 1, 1);
                ctx.fillStyle = light; ctx.fillRect(x, y - 1, 1, 1);
                if (rng() < 0.5) ctx.fillRect(x + (rng() < 0.5 ? -1 : 1), y - 2, 1, 1);
            }
        };
        const pebble = (x, y, w, h, base, top, bottom) => {
            ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
            ctx.fillStyle = top; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
            ctx.fillStyle = bottom; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
        };

        switch (type) {
            case TERRAIN.GRASS:
            case TERRAIN.FLOWERS:
                fill('#5a8f3c');
                patches(7, ['#62973f', '#54873a', '#5e9440'], 5);
                dots(70, ['#6aa548', '#4f8636', '#66a044', '#548a38']);
                blades(16, '#78b452', '#4a7f30');
                break;
            case TERRAIN.GRASS_DARK:
                fill('#4e8330');
                patches(7, ['#558a36', '#487a2c', '#4a7f2c'], 5);
                dots(70, ['#5e9a3e', '#43722a', '#58923a', '#4b7e2e']);
                blades(16, '#6aa648', '#3f7026');
                break;
            case TERRAIN.FOREST:
                fill('#3f7127');
                patches(8, ['#467a2c', '#386522', '#3a6a24'], 5);
                dots(60, ['#4f8a34', '#2f5a1c', '#35641f', '#44782a']);
                dots(10, ['#6b5a32', '#5a4a2a', '#7a6438']);   // fallen needles and twigs
                blades(9, '#58933c', '#2f5a1c');
                break;
            case TERRAIN.WATER:
                fill('#3a7ecf');
                patches(6, ['#3576c4', '#3f86d6'], 7);
                dots(28, ['#4a8edc', '#3270bc', '#4388d8']);
                for (let i = 0; i < 3; i++) {
                    const x = Math.floor(rng() * (T - 6)), y = 2 + Math.floor(rng() * (T - 4)), w = 3 + Math.floor(rng() * 3);
                    ctx.fillStyle = '#5c9ce2'; ctx.fillRect(x, y, w, 1);
                    ctx.fillStyle = '#2f6cb4'; ctx.fillRect(x + 1, y + 1, w - 1, 1);
                }
                break;
            case TERRAIN.SAND:
                fill('#d8bd7c');
                patches(5, ['#d2b574', '#dec584'], 6);
                dots(100, ['#cfb270', '#e0c68a', '#c9ad6c', '#e8d29e']);
                for (let i = 0; i < 3; i++) pebble(Math.floor(rng() * 29), Math.floor(rng() * 30), 2, 1, '#b89e64', '#c8ae74', '#a08a58');
                break;
            case TERRAIN.DIRT:
                fill('#8a7050');
                patches(6, ['#82684a', '#927858'], 5);
                dots(90, ['#7f6648', '#947a58', '#6f5a40', '#9c8262']);
                for (let i = 0; i < 4; i++) pebble(Math.floor(rng() * 28), Math.floor(rng() * 29), 2 + Math.floor(rng() * 2), 2, '#9a8a72', '#b0a088', '#6a5a44');
                break;
            case TERRAIN.STONE_DEPOSIT:
                fill('#6f7a62');
                patches(7, ['#66705a', '#78836a', '#5f6a54'], 5);
                dots(60, ['#7c8770', '#5a6450', '#838e76']);
                for (let i = 0; i < 6; i++) {
                    const w = 3 + Math.floor(rng() * 4), h = 2 + Math.floor(rng() * 3);
                    const x = Math.floor(rng() * (T - w)), y = Math.floor(rng() * (T - h - 1));
                    ctx.fillStyle = '#545c4c'; ctx.fillRect(x + 1, y + h, w, 1);      // little shadow
                    pebble(x, y, w, h, '#8f8f85', '#b6b6ae', '#5a5a52');
                    if (w > 4) { ctx.fillStyle = '#76766e'; ctx.fillRect(x + 2, y + 1, 1, h - 2); } // crack
                }
                break;
            default:
                fill('#5a8f3c');
        }
        cache[key] = c;
        return c;
    }

    // Foam / shoreline edge for water tiles next to land. dir: 'n','s','e','w'
    function drawShore(dir) {
        const key = `shore_${dir}`;
        if (cache[key]) return cache[key];
        const T = TILE_SIZE;
        const c = createCanvas(T, T);
        const ctx = c.getContext('2d');
        const rng = mulberry32(dir.charCodeAt(0) * 31);
        for (let i = 0; i < T; i++) {
            const len = 1 + Math.floor(rng() * 3);
            for (let k = 0; k < len; k++) {
                ctx.fillStyle = k === 0 ? 'rgba(255,255,255,0.75)' : 'rgba(220,240,255,0.45)';
                if (dir === 'n') ctx.fillRect(i, k, 1, 1);
                if (dir === 's') ctx.fillRect(i, T - 1 - k, 1, 1);
                if (dir === 'w') ctx.fillRect(k, i, 1, 1);
                if (dir === 'e') ctx.fillRect(T - 1 - k, i, 1, 1);
            }
            // a few loose foam bubbles further out
            if (rng() < 0.15) {
                ctx.fillStyle = 'rgba(230,245,255,0.5)';
                const d = 4 + Math.floor(rng() * 3);
                if (dir === 'n') ctx.fillRect(i, d, 1, 1);
                if (dir === 's') ctx.fillRect(i, T - 1 - d, 1, 1);
                if (dir === 'w') ctx.fillRect(d, i, 1, 1);
                if (dir === 'e') ctx.fillRect(T - 1 - d, i, 1, 1);
            }
        }
        cache[key] = c;
        return c;
    }

    // Small wave highlight (animated by the renderer)
    function drawWave(frame) {
        const key = `wave_${frame}`;
        if (cache[key]) return cache[key];
        const c = createCanvas(16, 4);
        const ctx = c.getContext('2d');
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        const shapes = [
            [[2, 2], [3, 1], [4, 1], [5, 1], [6, 2], [10, 2], [11, 1], [12, 2]],
            [[1, 2], [2, 2], [3, 1], [4, 1], [5, 2], [9, 1], [10, 1], [11, 2], [12, 2]],
            [[3, 1], [4, 0], [5, 0], [6, 1], [8, 2], [9, 2], [10, 1], [11, 1], [12, 2]],
        ];
        shapes[frame % 3].forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
        ctx.fillStyle = 'rgba(40,90,170,0.35)';
        shapes[frame % 3].forEach(([x, y]) => ctx.fillRect(x, y + 1, 1, 1));
        cache[key] = c;
        return c;
    }

    // ============================================
    // TREES (1px detail, 3 variants each)
    // ============================================
    const LEAF_GREEN = ['#163f0e', '#1f5616', '#2a6c20', '#38822a', '#4f9c38', '#6cb84a'];

    // Fills a union of circles with lit-from-top-left shading and a leafy texture
    function shadeBlob(ctx, circles, palette, outline, seed) {
        const w = ctx.canvas.width, h = ctx.canvas.height;
        const inside = (x, y) => circles.some(([cx, cy, r]) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < r * r);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (!inside(x, y)) continue;
                let best = circles[0], bd = 1e9;
                for (const cc of circles) {
                    const d = ((x + 0.5 - cc[0]) ** 2 + (y + 0.5 - cc[1]) ** 2) / (cc[2] * cc[2]);
                    if (d < bd) { bd = d; best = cc; }
                }
                const nx = (x + 0.5 - best[0]) / best[2], ny = (y + 0.5 - best[1]) / best[2];
                let light = -(nx * 0.55 + ny * 0.8) * 0.9 + (hash2(x, y, seed) - 0.5) * 0.7;
                let idx = Math.round((light + 1) / 2 * (palette.length - 1));
                idx = Math.max(0, Math.min(palette.length - 1, idx));
                const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
                ctx.fillStyle = (edge && outline && (nx > -0.3 || ny > 0.2)) ? outline : palette[idx];
                ctx.fillRect(x, y, 1, 1);
            }
        }
    }

    function drawTrunk(ctx, x0, y0, w, y1, seed) {
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x < x0 + w; x++) {
                const col = x === x0 ? '#86562e' : x === x0 + w - 1 ? '#4e2e16' : (hash2(x, y, seed) < 0.18 ? '#5a3418' : '#6b4226');
                ctx.fillStyle = col;
                ctx.fillRect(x, y, 1, 1);
            }
        }
        // root flare
        ctx.fillStyle = '#5a3418';
        ctx.fillRect(x0 - 2, y1, 2, 1); ctx.fillRect(x0 + w, y1, 2, 1);
        ctx.fillRect(x0 - 1, y1 - 1, 1, 1); ctx.fillRect(x0 + w, y1 - 1, 1, 1);
    }

    function drawOakLeafy(variant) {
        const c = createCanvas(32, 48);
        const ctx = c.getContext('2d');
        const r = mulberry32(variant * 97 + 5);
        drawTrunk(ctx, 14, 26, 5, 47, variant);
        // a couple of visible boughs
        ctx.fillStyle = '#5a3418';
        ctx.fillRect(12, 27, 2, 1); ctx.fillRect(19, 26, 2, 1);
        const j = () => (r() - 0.5) * 3;
        const circles = [
            [16 + j(), 15 + j(), 10], [9 + j(), 19 + j(), 7], [23 + j(), 19 + j(), 7],
            [12 + j(), 10 + j(), 7], [21 + j(), 10 + j(), 7], [16 + j(), 23, 6.5],
        ];
        shadeBlob(ctx, circles, LEAF_GREEN, '#123a0c', variant * 13 + 1);
        // a few bright leaf glints on the sunny side
        for (let i = 0; i < 7; i++) {
            const x = 7 + Math.floor(r() * 12), y = 5 + Math.floor(r() * 12);
            if (ctx.getImageData(x, y, 1, 1).data[3] > 0) { ctx.fillStyle = '#86cc5c'; ctx.fillRect(x, y, 1, 1); }
        }
        return c;
    }

    // Draws a 1px branch with a given thickness, returns the tip
    function branchLine(ctx, x0, y0, x1, y1, thick, color, pts) {
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
        for (let i = 0; i <= steps; i++) {
            const x = Math.round(x0 + (x1 - x0) * i / steps), y = Math.round(y0 + (y1 - y0) * i / steps);
            ctx.fillStyle = color;
            ctx.fillRect(x, y, thick, 1);
            if (pts) pts.push([x, y]);
        }
    }

    // Leafless oak; returns the canvas plus the branch tips and pixels for decoration
    function drawBareOakShape(variant) {
        const c = createCanvas(32, 48);
        const ctx = c.getContext('2d');
        const r = mulberry32(variant * 131 + 17);
        drawTrunk(ctx, 14, 22, 4, 47, variant);
        const tips = [], pts = [];
        const grow = (x, y, ang, len, thick, depth) => {
            const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
            branchLine(ctx, x, y, x1, y1, thick, thick > 1 ? '#5a3418' : '#6e4a2a', pts);
            if (depth <= 0 || len < 3) { tips.push([Math.round(x1), Math.round(y1)]); return; }
            const n = 2 + (r() < 0.35 ? 1 : 0);
            for (let i = 0; i < n; i++) {
                const a = ang + (i - (n - 1) / 2) * (0.55 + r() * 0.3) + (r() - 0.5) * 0.3;
                grow(x1, y1, a, len * (0.62 + r() * 0.15), Math.max(1, thick - 1), depth - 1);
            }
        };
        grow(16, 23, -Math.PI / 2 - 0.55 + (r() - 0.5) * 0.2, 8, 2, 3);
        grow(16, 22, -Math.PI / 2 + (r() - 0.5) * 0.2, 9, 2, 3);
        grow(17, 23, -Math.PI / 2 + 0.55 + (r() - 0.5) * 0.2, 8, 2, 3);
        return { c, ctx, tips, pts, r };
    }

    // Autumn: mostly bare branches, a little foliage left on top, some green and brown leaves
    function drawAutumnOak(variant) {
        const { c, ctx, tips, r } = drawBareOakShape(variant);
        const colors = ['#c8781e', '#d89a2a', '#b8521e', '#8a5a22', '#7a4a1c', '#e0b040', '#4f8a34', '#3a7a28'];
        tips.forEach(([x, y]) => {
            if (y > 24 || r() < 0.15) return;           // foliage only on the upper branches
            const n = 3 + Math.floor(r() * 6);
            for (let i = 0; i < n; i++) {
                const lx = x + Math.round((r() - 0.5) * 4), ly = y + Math.round((r() - 0.6) * 3);
                if (lx < 0 || ly < 0 || lx > 31 || ly > 47) continue;
                ctx.fillStyle = colors[Math.floor(r() * colors.length)];
                ctx.fillRect(lx, ly, 1, 1);
                if (r() < 0.3) ctx.fillRect(lx + 1, ly, 1, 1);
            }
        });
        // a few leaves still clinging lower down
        for (let i = 0; i < 6; i++) {
            const t = tips[Math.floor(r() * tips.length)];
            if (!t) break;
            ctx.fillStyle = colors[3 + Math.floor(r() * 3)];
            ctx.fillRect(t[0] + Math.round((r() - 0.5) * 2), t[1] + 2 + Math.floor(r() * 3), 1, 1);
        }
        return c;
    }

    function drawWinterOak(variant) {
        const { c, ctx, pts, r } = drawBareOakShape(variant);
        const data = ctx.getImageData(0, 0, 32, 48).data;
        const solid = (x, y) => x >= 0 && y >= 0 && x < 32 && y < 48 && data[(y * 32 + x) * 4 + 3] > 0;
        pts.forEach(([x, y]) => {
            if (y < 40 && !solid(x, y - 1) && r() < 0.65) {
                ctx.fillStyle = r() < 0.7 ? '#f2f6fb' : '#d6e0ec';
                ctx.fillRect(x, y - 1, 1, 1);
            }
        });
        return c;
    }

    function drawPine(variant, snowy) {
        const c = createCanvas(32, 56);
        const ctx = c.getContext('2d');
        const r = mulberry32(variant * 71 + 3);
        drawTrunk(ctx, 15, 44, 3, 55, variant + 7);
        const pal = ['#0c3410', '#134416', '#1b561e', '#246a26', '#317e30', '#47963e'];
        const tiers = 6;
        const solidMap = new Set();
        for (let i = 0; i < tiers; i++) {
            const top = 1 + i * 7, bottom = top + 11;
            const maxW = 3 + i * 2.1 + (r() - 0.5);
            for (let y = top; y <= bottom; y++) {
                const k = (y - top) / (bottom - top);
                const hw = 0.8 + k * maxW;
                for (let x = Math.floor(16 - hw); x <= Math.ceil(16 + hw); x++) {
                    if (Math.abs(x + 0.5 - 16) > hw) continue;
                    if (y === bottom && hash2(x, y, variant + i) < 0.45) continue; // ragged hem
                    const side = (x + 0.5 - 16) / hw;
                    let light = -side * 0.7 - (1 - k) * 0.25 + (hash2(x, y, variant * 5 + 1) - 0.5) * 0.6;
                    let idx = Math.max(0, Math.min(pal.length - 1, Math.round((light + 1) / 2 * (pal.length - 1))));
                    if (side > 0.85 || y === bottom) idx = 0;   // dark rim on the shadow side / hem
                    ctx.fillStyle = pal[idx];
                    ctx.fillRect(x, y, 1, 1);
                    solidMap.add(x + ',' + y);
                }
            }
        }
        if (snowy) {
            for (const key of solidMap) {
                const [x, y] = key.split(',').map(Number);
                const open = !solidMap.has(x + ',' + (y - 1));
                if (open && hash2(x, y, variant + 99) < 0.85) {
                    ctx.fillStyle = '#f2f6fb'; ctx.fillRect(x, y, 1, 1);
                    if (solidMap.has(x + ',' + (y + 1)) && hash2(x, y, 7) < 0.6) { ctx.fillStyle = '#d6e0ec'; ctx.fillRect(x, y + 1, 1, 1); }
                } else if (x < 16 && hash2(x, y, variant + 5) < 0.06) {
                    ctx.fillStyle = '#e8eef5'; ctx.fillRect(x, y, 1, 1);
                }
            }
        }
        return c;
    }

    // Tree sprite for a kind ('oak' | 'pine'), season and variant (0-2); custom tree art wins
    function getTree(kind, season = 'spring', variant = 0) {
        const baseKey = kind === 'pine' ? 'pine_2' : 'tree_2';
        if (customArt.has(baseKey)) return cache[baseKey];
        const s = (season === 'summer') ? 'spring' : (kind === 'pine' && season === 'autumn' ? 'spring' : season);
        const key = `tree_${kind}_${s}_${variant}`;
        if (cache[key]) return cache[key];
        let c;
        if (kind === 'pine') c = drawPine(variant, s === 'winter');
        else if (s === 'autumn') c = drawAutumnOak(variant);
        else if (s === 'winter') c = drawWinterOak(variant);
        else c = drawOakLeafy(variant);
        cache[key] = c;
        return c;
    }

    function drawTree() { return getTree('oak', 'spring', 0); }
    function drawPineTree() { return getTree('pine', 'spring', 0); }

    // ---- Stone piles (1px boulders) ----
    function drawStonePileVariant(variant) {
        const c = createCanvas(32, 24);
        const ctx = c.getContext('2d');
        const r = mulberry32(variant * 53 + 11);
        const pal = ['#4a4a46', '#62625c', '#7c7c76', '#96968e', '#b2b2aa', '#cacac2'];
        const rocks = [
            [10, 16, 6.5, 5], [20, 15, 7, 6], [14, 10, 5, 4], [26, 19, 4, 3], [5, 20, 3.5, 2.5],
        ].map(([x, y, rx, ry]) => [x + (r() - 0.5) * 2, y + (r() - 0.5) * 1.5, rx * (0.85 + r() * 0.3), ry]);
        // shadow on the ground first
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(4, 21, 26, 2);
        rocks.sort((a, b) => a[1] - b[1]).forEach(([cx, cy, rx, ry], i) => {
            for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
                for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
                    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
                    const d = nx * nx + ny * ny;
                    if (d > 1) continue;
                    let light = -(nx * 0.5 + ny * 0.85) + (hash2(x, y, variant * 3 + i) - 0.5) * 0.35;
                    let idx = Math.max(0, Math.min(pal.length - 1, Math.round((light + 1) / 2 * (pal.length - 1))));
                    if (d > 0.78 && (nx > 0 || ny > 0)) idx = 0;      // outline on the shadow side
                    ctx.fillStyle = pal[idx];
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        });
        return c;
    }

    function drawStonePile(scale, variant = 0) {
        if (customArt.has('stone_2')) return cache.stone_2;
        const key = `stone_v${variant}`;
        if (!cache[key]) cache[key] = drawStonePileVariant(variant);
        return cache[key];
    }

    function drawFlowers(scale = 2, seed = 0) {
        const key = `flowers_${seed}`;
        if (cache[key]) return cache[key];
        const c = createCanvas(TILE_SIZE, TILE_SIZE);
        const ctx = c.getContext('2d');
        const petals = ['#e04848', '#eedd44', '#d64fd6', '#ff8844', '#5a8cff', '#ffffff', '#ff9ac8'];
        const rng = mulberry32(seed);
        const n = 5 + Math.floor(rng() * 5);
        for (let i = 0; i < n; i++) {
            const fx = 2 + Math.floor(rng() * 27), fy = 3 + Math.floor(rng() * 24);
            const col = petals[Math.floor(rng() * petals.length)];
            ctx.fillStyle = '#3a7a28';
            ctx.fillRect(fx, fy + 1, 1, 3);
            ctx.fillRect(fx + (rng() < 0.5 ? -1 : 1), fy + 3, 1, 1);    // leaf
            if (rng() < 0.6) {
                // small cross-shaped blossom with a yellow heart
                ctx.fillStyle = col;
                ctx.fillRect(fx - 1, fy, 1, 1); ctx.fillRect(fx + 1, fy, 1, 1);
                ctx.fillRect(fx, fy - 1, 1, 1); ctx.fillRect(fx, fy + 1, 1, 1);
                ctx.fillStyle = col === '#eedd44' ? '#ffffff' : '#ffd84a';
                ctx.fillRect(fx, fy, 1, 1);
            } else {
                ctx.fillStyle = col;
                ctx.fillRect(fx, fy, 1, 1);
            }
        }
        cache[key] = c;
        return c;
    }

    // ============================================
    // VILLAGERS (16x24, 1px detail, 2 walk frames, tools by trade)
    // ============================================
    const TUNIC_COLORS = [
        ['#b04040', '#8a2c2c', '#c85a5a'], ['#3c6fb0', '#2a5288', '#5a8acc'], ['#4f8a3c', '#3a6a2c', '#68a452'],
        ['#b08a30', '#8a6a22', '#caa448'], ['#7a4fa0', '#5c3a7c', '#9468b8'], ['#8a6a4a', '#6a5038', '#a08060'],
    ];
    const HAIR_COLORS = ['#4a2a10', '#2a1a08', '#8a5a2a', '#c8a050', '#3a2418', '#6a3a1a'];

    function drawVillager(frame, palette, flip, tool) {
        const key = `villager_${frame}_${palette}_${flip ? 1 : 0}_${tool || ''}`;
        if (cache[key]) return cache[key];
        const c = createCanvas(16, 24);
        const ctx = c.getContext('2d');
        const [tunic, tunicDark, tunicLight] = TUNIC_COLORS[palette % TUNIC_COLORS.length];
        const hair = HAIR_COLORS[(palette * 5 + 1) % HAIR_COLORS.length];
        const skin = '#e8b890', skinDark = '#c8946c';
        const R = (x, y, w, h, col) => {
            ctx.fillStyle = col;
            for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) ctx.fillRect(flip ? 15 - xx : xx, yy, 1, 1);
        };
        // head
        R(5, 2, 6, 6, skin);
        R(10, 3, 1, 5, skinDark);
        R(5, 1, 6, 2, hair); R(4, 2, 1, 3, hair); R(5, 3, 1, 1, hair);
        R(8, 5, 1, 1, '#2a1a10');                 // eye (looking in walking direction)
        R(10, 5, 1, 1, '#2a1a10');
        R(9, 7, 1, 1, skinDark);                  // mouth shadow
        R(7, 8, 3, 1, skinDark);                  // neck
        // body
        R(4, 9, 8, 6, tunic);
        R(4, 9, 8, 1, tunicLight);
        R(10, 10, 2, 5, tunicDark);
        R(4, 14, 8, 1, '#5a3a1a');                // belt
        R(7, 14, 1, 1, '#d0a020');                // buckle
        R(4, 15, 8, 1, tunicDark);                // tunic hem
        // arms
        R(3, 10, 1, 4, tunicDark); R(3, 14, 1, 1, skin);
        R(12, 10, 1, 3, tunic); R(12, 13, 1, 1, skin);
        // legs + boots (walk cycle)
        if (frame === 0) {
            R(5, 16, 2, 5, '#4a3828'); R(9, 16, 2, 5, '#4a3828');
            R(6, 16, 1, 5, '#3a2a1c'); R(10, 16, 1, 5, '#3a2a1c');
            R(5, 21, 3, 1, '#2a1a0c'); R(9, 21, 3, 1, '#2a1a0c');
        } else {
            R(4, 16, 2, 4, '#4a3828'); R(10, 16, 2, 4, '#4a3828');
            R(5, 16, 1, 4, '#3a2a1c'); R(11, 16, 1, 4, '#3a2a1c');
            R(3, 20, 3, 1, '#2a1a0c'); R(10, 20, 3, 1, '#2a1a0c');
        }
        // tool in the front hand
        const handle = '#7a5230';
        if (tool === 'axe') {
            R(13, 7, 1, 8, handle);
            R(14, 7, 2, 3, '#a8a8b0'); R(15, 7, 1, 3, '#e0e0e8');
        } else if (tool === 'pick') {
            R(13, 8, 1, 8, handle);
            R(11, 7, 5, 1, '#9a9aa4'); R(11, 8, 1, 1, '#9a9aa4'); R(15, 8, 1, 1, '#9a9aa4');
        } else if (tool === 'bow') {
            R(14, 6, 1, 1, '#8a5a2a'); R(15, 7, 1, 8, '#8a5a2a'); R(14, 15, 1, 1, '#8a5a2a');
            R(13, 7, 1, 8, '#e8e0c8');
        } else if (tool === 'hammer') {
            R(13, 9, 1, 6, handle);
            R(12, 7, 3, 2, '#86868e'); R(12, 7, 3, 1, '#a8a8b0');
        }
        cache[key] = c;
        return c;
    }

    // ============================================
    // RESOURCE ICONS (16x16, scale 2 -> 32x32 shown at 20px)
    // ============================================
    function drawIcon(name) {
        const key = `icon_${name}`;
        if (cache[key]) return cache[key];
        const s = 2;
        const c = createCanvas(16 * s, 16 * s);
        const ctx = c.getContext('2d');
        const P = (x, y, col) => px(ctx, x, y, col, s);
        const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x * s, y * s, w * s, h * s); };

        switch (name) {
            case 'wood':
                // a log seen from the side with rings on the end
                R(3, 5, 10, 6, '#8a5a2a');
                R(3, 5, 10, 1, '#a0703a');
                R(3, 10, 10, 1, '#5a3418');
                R(10, 4, 4, 8, '#c49a5c');
                R(11, 6, 2, 4, '#8a5a2a');
                P(12, 7, '#c49a5c');
                R(2, 5, 1, 6, '#5a3418');
                break;
            case 'stone':
                R(3, 7, 10, 6, '#8a8a8a');
                R(5, 4, 7, 4, '#9c9c9c');
                R(5, 4, 7, 1, '#bdbdbd');
                R(3, 7, 2, 1, '#bdbdbd');
                R(3, 12, 10, 1, '#5c5c5c');
                P(11, 9, '#6c6c6c'); P(7, 10, '#6c6c6c');
                break;
            case 'iron':
                // ingot
                R(2, 8, 12, 5, '#8c96ad');
                R(4, 5, 8, 4, '#aab3c8');
                R(4, 5, 8, 1, '#d0d6e4');
                R(2, 12, 12, 1, '#55607a');
                R(13, 8, 1, 5, '#6a7490');
                break;
            case 'food':
                // meat leg: browned meat with a bone sticking out
                R(4, 4, 7, 7, '#b84a2c');
                R(3, 5, 1, 5, '#b84a2c'); R(11, 5, 1, 5, '#b84a2c'); R(5, 3, 5, 1, '#b84a2c');
                R(5, 4, 3, 2, '#d8704a'); P(5, 6, '#e8906a');
                R(9, 8, 2, 3, '#8a2e1a'); R(6, 11, 4, 1, '#8a2e1a');
                R(10, 10, 2, 2, '#f2e8d4'); R(12, 12, 2, 2, '#f2e8d4');
                P(14, 12, '#f2e8d4'); P(12, 14, '#f2e8d4'); P(14, 14, '#d8ccb4'); P(13, 13, '#d8ccb4');
                break;
            case 'pop':
                // villager bust
                R(6, 2, 4, 4, '#e8b890');
                R(6, 2, 4, 1, '#4a2a10');
                R(4, 6, 8, 6, '#3c6fb0');
                R(3, 7, 1, 3, '#e8b890'); R(12, 7, 1, 3, '#e8b890');
                R(4, 12, 8, 1, '#2a4f80');
                break;
            case 'spring':
                R(7, 9, 2, 6, '#4f8a3c'); R(9, 11, 3, 2, '#4f8a3c');
                R(6, 2, 4, 3, '#f28ab4'); R(6, 8, 4, 2, '#f28ab4');
                R(3, 4, 3, 4, '#f28ab4'); R(10, 4, 3, 4, '#f28ab4');
                R(6, 5, 4, 3, '#ffd84a'); P(7, 5, '#fff2a0');
                P(4, 4, '#ffc0d8'); P(7, 2, '#ffc0d8');
                break;
            case 'autumn':
                R(6, 3, 4, 2, '#e0902a'); R(4, 5, 8, 2, '#d8742a'); R(3, 7, 10, 2, '#c85a22');
                R(4, 9, 8, 2, '#b8481e'); R(6, 11, 4, 1, '#a83e1a');
                R(8, 4, 1, 8, '#7a2e10'); R(8, 12, 1, 3, '#6b4226');
                P(6, 7, '#7a2e10'); P(10, 6, '#7a2e10'); P(5, 9, '#7a2e10'); P(11, 9, '#7a2e10');
                P(5, 5, '#f0c060');
                break;
            case 'winter':
                R(7, 1, 2, 14, '#e8f2ff'); R(1, 7, 14, 2, '#e8f2ff');
                for (let i = 0; i < 4; i++) { P(3 + i, 3 + i, '#bcd8f4'); P(12 - i, 3 + i, '#bcd8f4'); P(3 + i, 12 - i, '#bcd8f4'); P(12 - i, 12 - i, '#bcd8f4'); }
                P(6, 2, '#bcd8f4'); P(9, 2, '#bcd8f4'); P(6, 13, '#bcd8f4'); P(9, 13, '#bcd8f4');
                P(2, 6, '#bcd8f4'); P(2, 9, '#bcd8f4'); P(13, 6, '#bcd8f4'); P(13, 9, '#bcd8f4');
                R(7, 7, 2, 2, '#ffffff');
                break;
            case 'snow':
                R(3, 4, 10, 4, '#d8e0ec');
                R(5, 2, 4, 2, '#d8e0ec'); R(8, 2, 3, 2, '#e8eef6');
                R(3, 7, 10, 1, '#a8b4c8');
                P(4, 10, '#ffffff'); P(8, 9, '#ffffff'); P(11, 11, '#ffffff'); P(6, 13, '#ffffff'); P(10, 14, '#ffffff');
                P(3, 13, '#dfe9f8'); P(12, 13, '#dfe9f8');
                break;
            case 'summer':
            case 'day':
                // sun
                R(5, 5, 6, 6, '#f6c431');
                R(6, 4, 4, 1, '#f6c431'); R(6, 11, 4, 1, '#f6c431');
                R(4, 6, 1, 4, '#f6c431'); R(11, 6, 1, 4, '#f6c431');
                R(6, 6, 2, 2, '#ffe58a');
                P(7, 1, '#f6c431'); P(8, 1, '#f6c431');
                P(7, 14, '#f6c431'); P(8, 14, '#f6c431');
                P(1, 7, '#f6c431'); P(1, 8, '#f6c431');
                P(14, 7, '#f6c431'); P(14, 8, '#f6c431');
                P(3, 3, '#f6c431'); P(12, 3, '#f6c431'); P(3, 12, '#f6c431'); P(12, 12, '#f6c431');
                break;
            case 'cloud':
                R(3, 7, 10, 5, '#e8edf5');
                R(5, 5, 4, 2, '#e8edf5'); R(8, 4, 3, 3, '#e8edf5');
                R(5, 5, 4, 1, '#ffffff'); R(8, 4, 3, 1, '#ffffff');
                R(3, 11, 10, 1, '#a8b4c8');
                R(2, 8, 1, 3, '#e8edf5'); R(13, 8, 1, 3, '#e8edf5');
                break;
            case 'rain':
                R(3, 4, 10, 4, '#a8b4c8');
                R(5, 2, 4, 2, '#a8b4c8'); R(8, 2, 3, 2, '#b8c4d8');
                R(3, 7, 10, 1, '#7a869a');
                P(4, 10, '#7ab0ff'); P(4, 11, '#7ab0ff'); P(8, 9, '#7ab0ff'); P(8, 10, '#7ab0ff');
                P(11, 11, '#7ab0ff'); P(11, 12, '#7ab0ff'); P(6, 13, '#7ab0ff'); P(6, 14, '#7ab0ff');
                break;
            case 'fog':
                R(2, 4, 9, 2, '#c8d0dc'); R(5, 8, 9, 2, '#e0e6ee'); R(2, 12, 10, 2, '#b0b8c6');
                break;
            case 'moon':
                R(5, 3, 6, 10, '#f2e6a8');
                R(4, 5, 1, 6, '#f2e6a8'); R(11, 5, 1, 6, '#f2e6a8');
                R(8, 3, 4, 7, 'rgba(0,0,0,0)');
                ctx.clearRect(8 * s, 2 * s, 5 * s, 9 * s);
                R(6, 5, 1, 1, '#d8c880'); R(6, 9, 2, 1, '#d8c880');
                P(13, 3, '#fff8d0'); P(2, 2, '#fff8d0'); P(13, 12, '#fff8d0');
                break;
            case 'sound':
                R(2, 6, 3, 4, '#e8d5a3');
                R(5, 4, 2, 8, '#e8d5a3');
                R(7, 3, 1, 1, '#e8d5a3'); R(7, 12, 1, 1, '#e8d5a3');
                R(9, 5, 1, 6, '#e8d5a3');
                R(11, 3, 1, 10, '#e8d5a3');
                break;
            case 'mute':
                R(2, 6, 3, 4, '#9a8a68');
                R(5, 4, 2, 8, '#9a8a68');
                R(7, 3, 1, 1, '#9a8a68'); R(7, 12, 1, 1, '#9a8a68');
                for (let i = 0; i < 5; i++) { P(9 + i, 5 + i, '#d44'); P(13 - i, 5 + i, '#d44'); }
                break;
            case 'music':
                R(5, 3, 1, 9, '#e8d5a3');
                R(5, 3, 6, 1, '#e8d5a3');
                R(10, 3, 1, 7, '#e8d5a3');
                R(3, 11, 3, 2, '#e8d5a3');
                R(8, 9, 3, 2, '#e8d5a3');
                break;
            case 'storage':
                R(3, 6, 10, 7, '#a07840');
                R(3, 6, 10, 1, '#c49a5c');
                R(3, 9, 10, 1, '#6b4f10');
                R(7, 7, 2, 5, '#6b4f10');
                break;
        }

        cache[key] = c;
        return c;
    }

    // ============================================
    // BUILDINGS
    // ============================================
    function drawCastle() {
        const key = 'castle';
        if (cache[key]) return cache[key];
        const w = 4 * TILE_SIZE, h = 4 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

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
        // Wall top walkway battlements
        for (let bx = 24; bx < w - 24; bx += 8) {
            ctx.fillStyle = '#9a9080';
            ctx.fillRect(bx, 20, 5, 6);
            ctx.fillStyle = '#5a5040';
            ctx.fillRect(bx + 5, 22, 3, 4);
        }

        // Towers (2 front corners)
        const towerW = 24, towerH = h - 8;
        const towers = [[0, 8], [w - towerW, 8]];
        towers.forEach(([tx, ty]) => {
            ctx.fillStyle = '#7a7060';
            ctx.fillRect(tx, ty, towerW, towerH);
            // right side shading
            ctx.fillStyle = '#6a6050';
            ctx.fillRect(tx + towerW - 5, ty, 5, towerH);
            for (let bx = tx; bx < tx + towerW; bx += 8) {
                ctx.fillStyle = '#8a8070';
                ctx.fillRect(bx, ty, 5, 6);
                ctx.fillStyle = '#5a5040';
                ctx.fillRect(bx + 5, ty, 3, 10);
            }
            for (let y2 = ty + 10; y2 < ty + towerH; y2 += 8) {
                ctx.fillStyle = '#605848';
                ctx.fillRect(tx, y2, towerW, 1);
            }
            // arrow slit
            ctx.fillStyle = '#2a2418';
            ctx.fillRect(tx + 10, ty + 30, 3, 10);
            ctx.fillRect(tx + 10, ty + 60, 3, 10);
        });

        // Main keep
        const keepW = 40, keepH = 60;
        const kx = (w - keepW) / 2, ky = 4;
        ctx.fillStyle = '#8a7c68';
        ctx.fillRect(kx, ky, keepW, keepH);
        ctx.fillStyle = '#786a58';
        ctx.fillRect(kx + keepW - 6, ky, 6, keepH);
        for (let bx = kx; bx < kx + keepW; bx += 8) {
            ctx.fillStyle = '#9a8c78';
            ctx.fillRect(bx, ky, 5, 5);
            ctx.fillStyle = '#5a5040';
            ctx.fillRect(bx + 5, ky, 3, 8);
        }
        ctx.fillStyle = '#3a3020';
        ctx.fillRect(kx + 10, ky + 16, 6, 10);
        ctx.fillRect(kx + keepW - 16, ky + 16, 6, 10);
        ctx.fillStyle = '#4a3820';
        ctx.fillRect(kx + 14, ky + 34, 12, 20);
        ctx.fillStyle = '#3a2810';
        ctx.fillRect(kx + 16, ky + 36, 8, 18);

        // Gate
        ctx.fillStyle = '#4a3820';
        ctx.fillRect(w / 2 - 12, h - 14, 24, 14);
        ctx.fillStyle = '#2a1c0c';
        ctx.fillRect(w / 2 - 8, h - 12, 16, 12);
        ctx.fillStyle = '#5a4830';
        for (let gx = w / 2 - 6; gx < w / 2 + 8; gx += 4) {
            ctx.fillRect(gx, h - 12, 1, 12);
        }
        ctx.fillRect(w / 2 - 8, h - 8, 16, 1);

        // Flag on keep
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(w / 2 - 1, ky - 12, 2, 16);
        ctx.fillStyle = '#c22';
        ctx.fillRect(w / 2 + 1, ky - 12, 10, 7);
        ctx.fillStyle = '#a11';
        ctx.fillRect(w / 2 + 1, ky - 9, 10, 1);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(w / 2 + 4, ky - 10, 3, 3);

        cache[key] = c;
        return c;
    }

    function drawHouse() {
        const key = 'house';
        if (cache[key]) return cache[key];
        const w = 2 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        // Walls (timber frame)
        ctx.fillStyle = '#d8c090';
        ctx.fillRect(8, 20, w - 16, h - 24);
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(8, 20, w - 16, 2);
        ctx.fillRect(8, 20, 2, h - 24);
        ctx.fillRect(w - 10, 20, 2, h - 24);
        ctx.fillRect(8, 38, w - 16, 2);
        ctx.fillRect(w / 2 + 8, 22, 2, 16);
        // side shading
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(w - 16, 22, 6, h - 26);

        // Chimney
        ctx.fillStyle = '#7a7060';
        ctx.fillRect(44, 8, 6, 14);
        ctx.fillStyle = '#5a5040';
        ctx.fillRect(43, 7, 8, 2);

        // Roof
        ctx.fillStyle = '#8B4513';
        ctx.beginPath();
        ctx.moveTo(4, 22);
        ctx.lineTo(w / 2, 4);
        ctx.lineTo(w - 4, 22);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#9B5523';
        ctx.beginPath();
        ctx.moveTo(6, 21);
        ctx.lineTo(w / 2, 6);
        ctx.lineTo(w / 2, 21);
        ctx.closePath();
        ctx.fill();
        // roof shingle lines
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        for (let y = 10; y < 22; y += 4) {
            const hw = Math.floor((y - 4) / 18 * (w / 2 - 4)) - 1;
            ctx.fillRect(w / 2 - hw, y, hw * 2, 1);
        }
        // roof edge
        ctx.fillStyle = '#5a2e0c';
        ctx.fillRect(4, 21, w - 8, 2);

        // Door
        ctx.fillStyle = '#5a3a18';
        ctx.fillRect(w / 2 - 5, h - 18, 10, 14);
        ctx.fillStyle = '#4a2a08';
        ctx.fillRect(w / 2 - 3, h - 16, 6, 12);
        ctx.fillStyle = '#d0a020';
        ctx.fillRect(w / 2 + 1, h - 10, 1, 1);

        // Window
        ctx.fillStyle = '#8bc4e8';
        ctx.fillRect(12, 26, 8, 8);
        ctx.fillStyle = '#5a3a18';
        ctx.fillRect(15, 26, 2, 8);
        ctx.fillRect(12, 29, 8, 2);

        cache[key] = c;
        return c;
    }

    function drawTavern() {
        const key = 'tavern';
        if (cache[key]) return cache[key];
        const w = 2 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        // Two-storey timber building
        ctx.fillStyle = '#c9b07e';
        ctx.fillRect(4, 16, w - 8, h - 20);
        ctx.fillStyle = '#5a3a18';
        ctx.fillRect(4, 16, w - 8, 2);
        ctx.fillRect(4, 34, w - 8, 2);
        ctx.fillRect(4, 16, 2, h - 20);
        ctx.fillRect(w - 6, 16, 2, h - 20);
        ctx.fillRect(w / 2 - 1, 18, 2, 16);
        // diagonal braces
        for (let i = 0; i < 8; i++) {
            ctx.fillRect(8 + i, 26 + i, 2, 2);
            ctx.fillRect(w - 10 - i, 26 + i, 2, 2);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(w - 12, 18, 6, h - 22);

        // Chimney
        ctx.fillStyle = '#7a7060';
        ctx.fillRect(12, 6, 6, 12);
        ctx.fillStyle = '#5a5040';
        ctx.fillRect(11, 5, 8, 2);

        // Roof (flat-ish thatch)
        ctx.fillStyle = '#a8842a';
        ctx.fillRect(2, 10, w - 4, 8);
        ctx.fillStyle = '#c49a3a';
        ctx.fillRect(4, 8, w - 8, 3);
        ctx.fillStyle = '#7a5a10';
        for (let x = 4; x < w - 4; x += 6) ctx.fillRect(x, 12, 1, 5);

        // Windows (lit)
        ctx.fillStyle = '#f0c040';
        ctx.fillRect(26, 28, 8, 8);
        ctx.fillRect(42, 28, 8, 8);
        ctx.fillStyle = '#5a3a18';
        ctx.fillRect(29, 28, 2, 8); ctx.fillRect(45, 28, 2, 8);
        ctx.fillRect(26, 31, 8, 2); ctx.fillRect(42, 31, 8, 2);

        // Door
        ctx.fillStyle = '#4a2a08';
        ctx.fillRect(10, h - 18, 10, 14);
        // Hanging sign (mug)
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(w - 14, 20, 10, 1);
        ctx.fillStyle = '#e8d5a3';
        ctx.fillRect(w - 12, 21, 6, 7);
        ctx.fillStyle = '#c49a1c';
        ctx.fillRect(w - 11, 22, 4, 5);

        // Barrels outside
        ctx.fillStyle = '#8a5a2a';
        ctx.fillRect(w - 14, h - 12, 7, 9);
        ctx.fillStyle = '#5a3418';
        ctx.fillRect(w - 14, h - 9, 7, 1);
        ctx.fillRect(w - 14, h - 5, 7, 1);

        cache[key] = c;
        return c;
    }

    function drawWarehouse() {
        const key = 'warehouse';
        if (cache[key]) return cache[key];
        const w = 3 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        ctx.fillStyle = '#9a8060';
        ctx.fillRect(6, 16, w - 12, h - 20);
        // plank texture
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        for (let y = 20; y < h - 4; y += 6) ctx.fillRect(6, y, w - 12, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(w - 14, 18, 8, h - 22);

        // Roof
        ctx.fillStyle = '#6a5030';
        ctx.fillRect(2, 12, w - 4, 8);
        ctx.fillStyle = '#7a6040';
        ctx.fillRect(4, 8, w - 8, 6);
        ctx.fillStyle = '#8a7050';
        ctx.fillRect(6, 6, w - 12, 3);

        // Door (large)
        ctx.fillStyle = '#5a3a18';
        ctx.fillRect(w / 2 - 12, h - 26, 24, 22);
        ctx.fillStyle = '#4a2a08';
        ctx.fillRect(w / 2 - 10, h - 24, 20, 20);
        // Crates
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(w / 2 - 8, h - 16, 7, 7);
        ctx.fillRect(w / 2 + 1, h - 14, 7, 7);
        ctx.fillStyle = '#6B4F10';
        ctx.fillRect(w / 2 - 4, h - 20, 7, 7);
        ctx.fillStyle = '#3a1a08';
        ctx.fillRect(w / 2 - 10, h - 14, 20, 2);

        // Sacks outside
        ctx.fillStyle = '#c4a060';
        ctx.fillRect(8, h - 12, 8, 8);
        ctx.fillRect(18, h - 10, 7, 6);
        ctx.fillStyle = '#8a6a30';
        ctx.fillRect(10, h - 13, 4, 2);

        cache[key] = c;
        return c;
    }

    function drawLumberjack() {
        const key = 'lumberjack';
        if (cache[key]) return cache[key];
        const w = 2 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        ctx.fillStyle = '#8B6914';
        ctx.fillRect(6, 22, w - 12, h - 26);
        for (let y = 24; y < h - 6; y += 5) {
            ctx.fillStyle = '#7a5a10';
            ctx.fillRect(6, y, w - 12, 1);
            ctx.fillStyle = '#9c7a1c';
            ctx.fillRect(6, y + 1, w - 12, 1);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(w - 12, 24, 6, h - 28);

        ctx.fillStyle = '#5a3a18';
        ctx.beginPath();
        ctx.moveTo(2, 24);
        ctx.lineTo(w / 2, 8);
        ctx.lineTo(w - 2, 24);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#6a4a28';
        ctx.beginPath();
        ctx.moveTo(4, 23);
        ctx.lineTo(w / 2, 10);
        ctx.lineTo(w / 2, 23);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#4a2a08';
        ctx.fillRect(w / 2 - 5, h - 16, 10, 12);

        // Axe in a stump
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(w - 16, h - 12, 10, 8);
        ctx.fillStyle = '#8a5a2a';
        ctx.fillRect(w - 16, h - 12, 10, 2);
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(w - 10, h - 24, 2, 12);
        ctx.fillStyle = '#c0c0c0';
        ctx.fillRect(w - 14, h - 26, 8, 5);
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(w - 14, h - 26, 8, 1);

        // Log pile
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(4, h - 10, 10, 4);
        ctx.fillRect(6, h - 14, 8, 4);
        ctx.fillStyle = '#c49a5c';
        ctx.fillRect(4, h - 10, 2, 4);
        ctx.fillRect(10, h - 10, 2, 4);
        ctx.fillRect(6, h - 14, 2, 4);

        cache[key] = c;
        return c;
    }

    function drawQuarry() {
        const key = 'quarry';
        if (cache[key]) return cache[key];
        const w = 2 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        // Dug-out pit
        ctx.fillStyle = '#6a6a5a';
        ctx.fillRect(4, 22, w - 8, h - 26);
        ctx.fillStyle = '#4a4a3a';
        ctx.fillRect(8, 26, w - 16, h - 34);
        for (let y = 22; y < h - 6; y += 6) {
            for (let x = 4; x < w - 8; x += 8) {
                ctx.fillStyle = (x + y) % 12 < 6 ? '#7a7a6a' : '#8a8a7a';
                ctx.fillRect(x, y, 7, 2);
            }
        }

        // Wooden crane / frame
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(10, 6, 3, 22);
        ctx.fillRect(10, 6, 20, 3);
        ctx.fillRect(28, 9, 1, 10);
        ctx.fillStyle = '#8a8a8a';
        ctx.fillRect(25, 19, 7, 6);

        // Pickaxe
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(44, 12, 2, 14);
        ctx.fillStyle = '#c0c0c0';
        ctx.fillRect(40, 10, 10, 3);

        // Stone blocks
        ctx.fillStyle = '#a0a0a0';
        ctx.fillRect(w - 18, h - 12, 12, 7);
        ctx.fillStyle = '#b4b4b4';
        ctx.fillRect(w - 16, h - 18, 10, 6);
        ctx.fillStyle = '#707070';
        ctx.fillRect(w - 18, h - 6, 12, 1);
        ctx.fillRect(w - 16, h - 13, 10, 1);

        cache[key] = c;
        return c;
    }

    function drawIronMine() {
        const key = 'iron_mine';
        if (cache[key]) return cache[key];
        const w = 2 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        // Rock mound
        ctx.fillStyle = '#6a6050';
        ctx.fillRect(4, 14, w - 8, h - 18);
        ctx.fillStyle = '#7a7060';
        ctx.fillRect(8, 10, w - 16, 6);
        ctx.fillStyle = '#5a5040';
        ctx.fillRect(4, h - 8, w - 8, 4);

        // Dark entrance
        ctx.fillStyle = '#1a1410';
        ctx.fillRect(14, 24, w - 28, h - 30);
        ctx.fillStyle = '#2a2018';
        ctx.fillRect(16, 22, w - 32, 4);

        // Support beams
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(10, 20, 4, h - 24);
        ctx.fillRect(w - 14, 20, 4, h - 24);
        ctx.fillRect(10, 18, w - 20, 4);

        // Rails
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(w / 2 - 6, h - 6, 1, 6);
        ctx.fillRect(w / 2 + 5, h - 6, 1, 6);

        // Ore cart
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(w / 2 - 7, h - 14, 14, 8);
        ctx.fillStyle = '#7a7a7a';
        ctx.fillRect(w / 2 - 7, h - 14, 14, 1);
        ctx.fillStyle = '#444';
        ctx.fillRect(w / 2 - 5, h - 6, 3, 3);
        ctx.fillRect(w / 2 + 2, h - 6, 3, 3);
        // Ore chunks
        ctx.fillStyle = '#8090a0';
        ctx.fillRect(w / 2 - 4, h - 17, 4, 3);
        ctx.fillRect(w / 2 + 1, h - 18, 4, 4);
        ctx.fillStyle = '#b0bccc';
        ctx.fillRect(w / 2 - 3, h - 17, 2, 1);

        // Ore veins in rock
        ctx.fillStyle = '#8090a0';
        ctx.fillRect(6, 18, 3, 2); ctx.fillRect(w - 10, 24, 3, 2); ctx.fillRect(w - 8, 14, 2, 2);

        cache[key] = c;
        return c;
    }

    function drawBlacksmith() {
        const key = 'blacksmith';
        if (cache[key]) return cache[key];
        const w = 2 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        // Stone building
        ctx.fillStyle = '#8a8070';
        ctx.fillRect(6, 18, w - 12, h - 22);
        for (let y = 20; y < h - 6; y += 6) {
            for (let x = 6; x < w - 8; x += 10) {
                const off = (Math.floor(y / 6) % 2) * 5;
                ctx.fillStyle = '#706858';
                ctx.fillRect(x + off, y, 1, 6);
                ctx.fillStyle = '#9a9080';
                ctx.fillRect(x + off + 1, y, 9, 1);
            }
        }
        // Chimney (tall)
        ctx.fillStyle = '#5a5040';
        ctx.fillRect(46, 2, 8, 20);
        ctx.fillStyle = '#4a4030';
        ctx.fillRect(45, 1, 10, 2);

        // Roof (dark slate)
        ctx.fillStyle = '#3a3a48';
        ctx.fillRect(2, 14, w - 4, 6);
        ctx.fillStyle = '#4a4a5a';
        ctx.fillRect(4, 10, w - 8, 5);
        ctx.fillStyle = '#5a5a6a';
        ctx.fillRect(6, 8, w - 12, 3);

        // Open forge front with glowing fire
        ctx.fillStyle = '#2a2018';
        ctx.fillRect(22, 28, 20, 16);
        ctx.fillStyle = '#ff6a1a';
        ctx.fillRect(26, 34, 12, 8);
        ctx.fillStyle = '#ffd040';
        ctx.fillRect(29, 36, 6, 5);
        ctx.fillStyle = '#ff9a2a';
        ctx.fillRect(30, 33, 4, 2);

        // Anvil outside
        ctx.fillStyle = '#404048';
        ctx.fillRect(8, h - 12, 12, 4);
        ctx.fillRect(11, h - 8, 6, 5);
        ctx.fillStyle = '#6a6a78';
        ctx.fillRect(8, h - 12, 12, 1);
        // Hammer
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(w - 14, h - 16, 2, 12);
        ctx.fillStyle = '#8a8a9a';
        ctx.fillRect(w - 17, h - 18, 8, 4);

        cache[key] = c;
        return c;
    }

    function drawChickenHut() {
        const key = 'chicken_hut';
        if (cache[key]) return cache[key];
        const w = 2 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        // Dirt yard
        ctx.fillStyle = '#9a8a5a';
        ctx.fillRect(2, 30, w - 4, h - 34);
        ctx.fillStyle = '#8a7a4a';
        for (let i = 0; i < 10; i++) ctx.fillRect(4 + (i * 11) % (w - 8), 32 + (i * 7) % (h - 38), 2, 1);

        // Fence
        ctx.fillStyle = '#8B6914';
        ctx.fillRect(2, h - 6, w - 4, 2);
        for (let x = 2; x < w - 2; x += 10) ctx.fillRect(x, h - 14, 2, 10);
        ctx.fillStyle = '#7a5a10';
        ctx.fillRect(2, h - 12, w - 4, 1);
        ctx.fillRect(2, h - 8, w - 4, 1);

        // Coop
        ctx.fillStyle = '#c4a060';
        ctx.fillRect(6, 18, 24, 20);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(24, 20, 6, 18);
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(4, 14, 28, 6);
        ctx.fillStyle = '#9B5523';
        ctx.fillRect(6, 12, 24, 3);
        ctx.fillStyle = '#4a2a08';
        ctx.fillRect(14, 28, 8, 10);
        // Ramp
        ctx.fillStyle = '#a08040';
        ctx.fillRect(22, 36, 10, 2);

        // Chickens
        const chickPos = [[38, 40], [44, 34], [40, 48], [50, 44]];
        chickPos.forEach(([cx, cy], i) => {
            ctx.fillStyle = i === 1 ? '#e8c060' : '#fff';
            ctx.fillRect(cx, cy, 6, 4);
            ctx.fillRect(cx + 5, cy - 2, 3, 3);
            ctx.fillStyle = '#da3';
            ctx.fillRect(cx + 8, cy - 1, 2, 1);
            ctx.fillStyle = '#c22';
            ctx.fillRect(cx + 6, cy - 3, 2, 1);
            ctx.fillStyle = '#da3';
            ctx.fillRect(cx + 1, cy + 4, 1, 2);
            ctx.fillRect(cx + 4, cy + 4, 1, 2);
            ctx.fillStyle = '#000';
            ctx.fillRect(cx + 6, cy - 1, 1, 1);
        });

        cache[key] = c;
        return c;
    }

    function drawAppleOrchard(grown = true) {
        const key = `apple_orchard_${grown}`;
        if (cache[key]) return cache[key];
        const w = 3 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        // Tilled ground
        ctx.fillStyle = 'rgba(90, 60, 30, 0.25)';
        ctx.fillRect(2, 4, w - 4, h - 8);

        const treePositions = [[16, 10], [48, 8], [80, 10]];
        treePositions.forEach(([tx, ty]) => {
            ctx.fillStyle = '#6b4226';
            ctx.fillRect(tx - 2, ty + 16, 4, 16);
            if (grown) {
                const leafColors = ['#2d6b1e', '#3a8528', '#247a16'];
                for (let dy = -2; dy < 14; dy++) {
                    for (let dx = -10; dx < 10; dx++) {
                        const dist = Math.sqrt(dx * dx + (dy - 5) * (dy - 5));
                        if (dist < 10) {
                            const ci = (Math.abs(dx) + dy) % leafColors.length;
                            ctx.fillStyle = (dx + dy > 9) ? '#1d5b0e' : leafColors[ci];
                            ctx.fillRect(tx + dx, ty + dy, 1, 1);
                        }
                    }
                }
                ctx.fillStyle = '#d8382c';
                ctx.fillRect(tx - 5, ty + 6, 3, 3);
                ctx.fillRect(tx + 3, ty + 4, 3, 3);
                ctx.fillRect(tx - 2, ty + 10, 3, 3);
                ctx.fillRect(tx + 6, ty + 8, 3, 3);
                ctx.fillStyle = '#ff8a7a';
                ctx.fillRect(tx - 5, ty + 6, 1, 1);
                ctx.fillRect(tx + 3, ty + 4, 1, 1);
            } else {
                ctx.fillStyle = '#4a8538';
                ctx.fillRect(tx - 4, ty + 8, 8, 8);
                ctx.fillRect(tx - 2, ty + 5, 4, 4);
                ctx.fillStyle = '#6aa548';
                ctx.fillRect(tx - 3, ty + 9, 2, 2);
                // support stake
                ctx.fillStyle = '#a08040';
                ctx.fillRect(tx + 3, ty + 12, 1, 20);
            }
        });

        ctx.fillStyle = '#8B6914';
        for (let x = 4; x < w - 4; x += 12) ctx.fillRect(x, h - 8, 2, 6);
        ctx.fillStyle = '#7a5a10';
        ctx.fillRect(4, h - 5, w - 8, 1);

        cache[key] = c;
        return c;
    }

    function drawFarm(grown = true) {
        const key = `farm_${grown}`;
        if (cache[key]) return cache[key];
        const w = 3 * TILE_SIZE, h = 3 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');

        // Field with furrows
        ctx.fillStyle = '#8a6a3a';
        ctx.fillRect(2, 2, w - 4, h - 4);
        for (let y = 6; y < h - 4; y += 6) {
            ctx.fillStyle = '#75592c';
            ctx.fillRect(4, y, w - 8, 2);
        }
        // Crops
        for (let y = 6; y < h - 6; y += 6) {
            for (let x = 6; x < w - 6; x += 5) {
                if (grown) {
                    ctx.fillStyle = (x + y) % 10 < 5 ? '#e0b830' : '#d4a420';
                    ctx.fillRect(x, y - 3, 2, 5);
                    ctx.fillStyle = '#f0d060';
                    ctx.fillRect(x, y - 4, 2, 2);
                } else {
                    ctx.fillStyle = '#6aa548';
                    ctx.fillRect(x, y, 1, 2);
                    ctx.fillRect(x + 1, y - 1, 1, 2);
                }
            }
        }
        // Scarecrow
        ctx.fillStyle = '#6b4226';
        ctx.fillRect(w - 16, 20, 2, 26);
        ctx.fillRect(w - 24, 26, 18, 2);
        ctx.fillStyle = '#c4a060';
        ctx.fillRect(w - 18, 14, 6, 6);
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(w - 20, 12, 10, 3);
        ctx.fillStyle = '#b04040';
        ctx.fillRect(w - 19, 28, 8, 8);

        // Fence
        ctx.fillStyle = '#8B6914';
        for (let x = 2; x < w - 2; x += 10) ctx.fillRect(x, h - 8, 2, 7);
        ctx.fillStyle = '#7a5a10';
        ctx.fillRect(2, h - 5, w - 4, 1);

        cache[key] = c;
        return c;
    }

    function drawHunter() {
        const key = 'hunter';
        if (cache[key]) return cache[key];
        const w = 2 * TILE_SIZE, h = 2 * TILE_SIZE;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');
        const R = (x, y, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, ww, hh); };

        // trampled ground in front
        R(6, 54, 52, 8, 'rgba(110, 82, 50, 0.45)');
        // stone chimney (smoke comes out at [16, 6])
        R(13, 6, 7, 18, '#7a7468'); R(13, 6, 7, 1, '#9a9488'); R(19, 7, 1, 17, '#5a5448');
        for (let y = 9; y < 24; y += 3) R(13 + (y % 2), y, 6, 1, '#68625a');
        // log walls
        for (let y = 28; y < 56; y += 4) {
            R(8, y, 44, 4, (y / 4) % 2 ? '#7a5230' : '#6a4626');
            R(8, y, 44, 1, '#94683e');
            R(8, y + 3, 44, 1, '#4e3018');
            R(6, y, 3, 4, '#a07a4a'); R(7, y + 1, 1, 2, '#6a4626');      // log ends
            R(51, y, 3, 4, '#a07a4a'); R(52, y + 1, 1, 2, '#6a4626');
        }
        // bark roof
        for (let y = 14; y < 30; y++) {
            const k = (y - 14) / 16, hw = 6 + k * 26;
            R(Math.round(31 - hw), y, Math.round(hw * 2), 1, y % 3 === 0 ? '#3e3020' : '#4a3a26');
        }
        R(4, 29, 56, 2, '#2e2416');
        for (let x = 10; x < 54; x += 5) R(x, 18 + Math.abs(x - 31) / 3 | 0, 1, 10, 'rgba(0,0,0,0.18)');
        // door with antlers above it
        R(27, 42, 10, 14, '#3a2410'); R(28, 43, 8, 13, '#2a1808'); R(35, 49, 1, 1, '#c8a040');
        const ant = '#ece0c4';
        R(31, 38, 2, 2, ant); R(29, 35, 1, 3, ant); R(34, 35, 1, 3, ant);
        R(28, 33, 1, 2, ant); R(35, 33, 1, 2, ant); R(30, 34, 1, 1, ant); R(33, 34, 1, 1, ant);
        // small window
        R(14, 38, 6, 5, '#2a1a0a'); R(15, 39, 4, 3, '#e8c060'); R(17, 39, 1, 3, '#3a2410');
        // drying rack with a stretched hide
        R(53, 34, 1, 24, '#5a3a1a'); R(61, 34, 1, 24, '#5a3a1a'); R(52, 35, 11, 1, '#6a4626');
        R(54, 37, 7, 11, '#b07a48'); R(55, 38, 5, 9, '#c48c58'); R(54, 37, 7, 1, '#8a5a32'); R(54, 47, 7, 1, '#8a5a32');
        // meat hanging under the eave
        R(44, 31, 1, 3, '#5a3a1a'); R(43, 34, 3, 5, '#a83a2a'); R(43, 34, 1, 5, '#c85a42'); R(45, 38, 1, 1, '#7a2418');
        // chopping block and a bundle of arrows
        R(10, 56, 7, 5, '#7a5230'); R(10, 56, 7, 1, '#b8905c'); R(15, 52, 1, 5, '#5a3a1a'); R(13, 51, 4, 2, '#a8a8b0');
        R(20, 52, 1, 8, '#8a6a3a'); R(22, 51, 1, 9, '#8a6a3a'); R(19, 51, 2, 1, '#d8d0c0'); R(21, 50, 2, 1, '#d8d0c0');

        cache[key] = c;
        return c;
    }

    // Adds 1px detail to a flat building sprite: material grain, a light rim on the
    // top-left edges and a dark outline on the bottom-right edges of the silhouette.
    function detailPass(src, seed) {
        const w = src.width, h = src.height;
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');
        ctx.drawImage(src, 0, 0);
        let img;
        try { img = ctx.getImageData(0, 0, w, h); } catch (e) { return src; }
        const d = img.data;
        const src8 = new Uint8ClampedArray(d);
        const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : src8[(y * w + x) * 4 + 3];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                if (src8[i + 3] < 200) continue;
                let f = 1 + (hash2(x, y, seed) - 0.5) * 0.12;
                if (a(x + 1, y) < 100 || a(x, y + 1) < 100) f *= 0.6;
                else if (a(x - 1, y) < 100 || a(x, y - 1) < 100) f *= 1.2;
                d[i] = src8[i] * f; d[i + 1] = src8[i + 1] * f; d[i + 2] = src8[i + 2] * f;
            }
        }
        ctx.putImageData(img, 0, 0);
        return c;
    }

    // Get building sprite by type
    function getBuildingRaw(type, extra) {
        const grown = extra?.grown !== false;
        switch (type) {
            case 'castle': return drawCastle();
            case 'house': return drawHouse();
            case 'tavern': return drawTavern();
            case 'warehouse': return drawWarehouse();
            case 'lumberjack': return drawLumberjack();
            case 'quarry': return drawQuarry();
            case 'iron_mine': return drawIronMine();
            case 'blacksmith': return drawBlacksmith();
            case 'hunter': return drawHunter();
            case 'chicken_hut': return drawChickenHut();
            case 'apple_orchard': return drawAppleOrchard(grown);
            case 'farm': return drawFarm(grown);
            default: return null;
        }
    }

    // Building sprite with the 1px detail pass (custom art from assets/ is used as is)
    function getBuilding(type, extra) {
        const raw = getBuildingRaw(type, extra);
        if (!raw) return null;
        const rawKey = buildingCacheKey(type, extra?.grown !== false);
        if (customArt.has(rawKey)) return raw;
        const key = 'd_' + rawKey;
        if (!cache[key]) cache[key] = detailPass(raw, rawKey.length * 31 + 7);
        return cache[key];
    }

    // ============================================
    // SEASONS
    // ============================================
    const customArt = new Set(); // cache keys replaced by files in assets/

    function hash2(x, y, s) {
        let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177)) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }

    // Terrain tile for a season, derived from the base tile (so custom tiles get seasons too)
    function getSeasonalTile(type, variant, season) {
        if (!season || season === 'spring') return drawTile(type, variant);
        const key = `stile_${type}_${variant}_${season}`;
        if (cache[key]) return cache[key];
        const T = TILE_SIZE;
        const c = createCanvas(T, T);
        const ctx = c.getContext('2d');
        ctx.drawImage(drawTile(type, variant), 0, 0);
        const green = type === TERRAIN.GRASS || type === TERRAIN.GRASS_DARK || type === TERRAIN.FOREST || type === TERRAIN.FLOWERS;

        if (season === 'summer' && green) {
            ctx.fillStyle = 'rgba(255, 225, 110, 0.10)';
            ctx.fillRect(0, 0, T, T);
        } else if (season === 'autumn' && green) {
            ctx.fillStyle = 'rgba(190, 120, 30, 0.28)';
            ctx.fillRect(0, 0, T, T);
            const leaf = ['#c8781e', '#b8521e', '#e0b040', '#a8441a', '#8a5a22'];
            for (let i = 0; i < 14; i++) {
                const x = Math.floor(hash2(i, variant, type + 3) * (T - 2));
                const y = Math.floor(hash2(variant, i, type + 5) * (T - 1));
                ctx.fillStyle = leaf[i % leaf.length];
                ctx.fillRect(x, y, 1, 1);
                if (i % 3 === 0) ctx.fillRect(x + 1, y, 1, 1);
            }
        } else if (season === 'winter') {
            if (type === TERRAIN.WATER) {
                // Frozen lake: pale ice with highlights and cracks
                ctx.fillStyle = '#a9cbe6';
                ctx.fillRect(0, 0, T, T);
                for (let i = 0; i < 5; i++) {
                    const x = Math.floor(hash2(i, variant, 41) * (T - 6)), y = Math.floor(hash2(variant, i, 43) * (T - 2));
                    ctx.fillStyle = '#d6e9f7';
                    ctx.fillRect(x, y, 5, 1);
                }
                for (let i = 0; i < 3; i++) {
                    let x = Math.floor(hash2(i, variant, 47) * (T - 4)), y = Math.floor(hash2(variant, i, 53) * (T - 6));
                    ctx.fillStyle = '#86aed0';
                    for (let k = 0; k < 4; k++) { ctx.fillRect(x, y, 1, 2); x += hash2(k, i, variant) > 0.5 ? 1 : -1; y += 2; }
                }
            } else {
                // Snow blanket in 1px detail; only a few small patches of ground peek through
                const patches = { [TERRAIN.STONE_DEPOSIT]: 4, [TERRAIN.SAND]: 2, [TERRAIN.DIRT]: 2, [TERRAIN.FOREST]: 3 }[type] ?? 2;
                const holes = [];
                for (let i = 0; i < patches; i++) {
                    if (hash2(i, variant, type + 61) < 0.35 && type !== TERRAIN.STONE_DEPOSIT) continue;
                    const big = type === TERRAIN.STONE_DEPOSIT;
                    holes.push({
                        x: Math.floor(hash2(i, variant, type + 71) * 27), y: Math.floor(hash2(variant, i, type + 73) * 29),
                        w: big ? 6 : 2 + Math.floor(hash2(i, i, type) * 2), h: big ? 3 : 1 + Math.floor(hash2(variant, i, 9) * 2),
                    });
                }
                for (let y = 0; y < T; y++) {
                    for (let x = 0; x < T; x++) {
                        if (holes.some(o => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h)) continue;
                        const m = hash2(x, y, 11 + variant + type * 3);
                        ctx.fillStyle = m < 0.05 ? '#d3dce8' : m > 0.94 ? '#f9fbfd' : m > 0.8 ? '#eef3f8' : '#e6edf5';
                        ctx.fillRect(x, y, 1, 1);
                    }
                }
                // soft blue shadow at the lower edge of each hole (depth)
                ctx.fillStyle = '#c9d4e2';
                holes.forEach(o => ctx.fillRect(o.x, o.y + o.h, o.w, 1));
            }
        }
        cache[key] = c;
        return c;
    }

    // Puts a 2px layer of snow on every upward-facing edge of a sprite
    function snowCap(src) {
        const c = createCanvas(src.width, src.height);
        const ctx = c.getContext('2d');
        ctx.drawImage(src, 0, 0);
        let data;
        try {
            data = ctx.getImageData(0, 0, c.width, c.height).data;
        } catch (e) {
            return src; // tainted canvas (custom art opened via file://): skip the snow
        }
        const w = c.width, h = c.height;
        const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 40;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (!solid(x, y) || solid(x, y - 1)) continue;
                // up to 3px of snow on every upward-facing edge, shaded at the bottom
                const depth = (solid(x - 1, y) && solid(x + 1, y)) ? 3 : 2;
                for (let k = 0; k < depth && solid(x, y + k); k++) {
                    ctx.fillStyle = k === depth - 1 ? '#cdd8e6' : (k === 0 ? '#ffffff' : '#eef3f9');
                    ctx.fillRect(x, y + k, 1, 1);
                }
            }
        }
        return c;
    }

    function getStonePile(season, variant = 0) {
        if (season !== 'winter') return drawStonePile(1, variant);
        const key = `stone_winter_${variant}`;
        if (!cache[key]) cache[key] = snowCap(drawStonePile(1, variant));
        return cache[key];
    }

    // Building sprite for a season: snow on the roofs in winter
    function getBuildingSeasonal(type, extra, season) {
        if (season !== 'winter') return getBuilding(type, extra);
        // fields and orchards rest in winter: show stubble / bare saplings under the snow
        const dormant = GROWTH_TYPES.includes(type);
        const grown = dormant ? false : extra?.grown !== false;
        const key = `sbld_${type}_${grown}_winter`;
        if (!cache[key]) cache[key] = snowCap(getBuilding(type, { grown }));
        return cache[key];
    }

    // Black silhouette of a building sprite, used as a soft drop shadow
    function getBuildingShadow(type, extra) {
        const grown = extra?.grown !== false;
        const key = `shadow_${type}_${grown}`;
        if (cache[key]) return cache[key];
        const sprite = getBuilding(type, extra);
        if (!sprite) return null;
        const c = createCanvas(sprite.width, sprite.height);
        const ctx = c.getContext('2d');
        ctx.drawImage(sprite, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, c.width, c.height);
        cache[key] = c;
        return c;
    }

    // ============================================
    // OPTIONAL EXTERNAL ART
    // Drop PNG files into assets/ to replace the procedural art.
    // Missing files are simply ignored (see assets/README.md for the layout).
    // ============================================
    const ASSET_BASE = 'assets/';
    const TERRAIN_ROWS = [
        TERRAIN.GRASS, TERRAIN.GRASS_DARK, TERRAIN.WATER, TERRAIN.SAND,
        TERRAIN.DIRT, TERRAIN.FOREST, TERRAIN.STONE_DEPOSIT, TERRAIN.FLOWERS,
    ];
    const GROWTH_TYPES = ['apple_orchard', 'farm'];

    function buildingCacheKey(type, grown) {
        return GROWTH_TYPES.includes(type) ? `${type}_${grown}` : type;
    }

    function loadImage(src) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }

    function imageToCanvas(img, sx, sy, w, h) {
        const c = createCanvas(w, h);
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
        return c;
    }

    // Optional manifest: assets/manifest.json = ["tiles.png", "buildings/house.png", ...]
    // With a manifest only the listed files are requested (no 404 noise); without one
    // (or when fetch is unavailable, e.g. file://) every known slot is probed.
    async function readManifest() {
        if (location.protocol === 'file:') return null;
        try {
            const res = await fetch(ASSET_BASE + 'manifest.json', { cache: 'no-cache' });
            if (!res.ok) return null;
            const list = await res.json();
            return Array.isArray(list) ? new Set(list.map(String)) : null;
        } catch (e) {
            return null;
        }
    }

    // Returns a promise resolving to the list of replaced asset names
    async function loadAssets() {
        const replaced = [];
        const jobs = [];
        const manifest = await readManifest();
        const wanted = (rel) => !manifest || manifest.has(rel);
        const load = (rel) => wanted(rel) ? loadImage(ASSET_BASE + rel) : Promise.resolve(null);

        // Terrain tile sheet: one row per terrain type, up to 4 variant columns, 32x32 each
        jobs.push(load('tiles.png').then(img => {
            if (!img) return;
            const cols = Math.max(1, Math.floor(img.width / TILE_SIZE));
            TERRAIN_ROWS.forEach((type, row) => {
                if ((row + 1) * TILE_SIZE > img.height) return;
                for (let v = 0; v < TILE_VARIANTS; v++) {
                    const col = v % cols;
                    cache[`tile_${type}_${v}`] = imageToCanvas(img, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            });
            replaced.push('tiles');
        }));

        // Buildings: assets/buildings/<type>.png (+ <type>_young.png for growing ones)
        Object.keys(BUILDINGS).forEach(type => {
            jobs.push(load(`buildings/${type}.png`).then(img => {
                if (!img) return;
                cache[buildingCacheKey(type, true)] = imageToCanvas(img, 0, 0, img.width, img.height);
                customArt.add(buildingCacheKey(type, true));
                replaced.push(type);
            }));
            if (GROWTH_TYPES.includes(type)) {
                jobs.push(load(`buildings/${type}_young.png`).then(img => {
                    if (!img) return;
                    cache[buildingCacheKey(type, false)] = imageToCanvas(img, 0, 0, img.width, img.height);
                    customArt.add(buildingCacheKey(type, false));
                    replaced.push(type + '_young');
                }));
            }
        });

        // Nature
        const nature = { 'tree_oak': 'tree_2', 'tree_pine': 'pine_2', 'stone_pile': 'stone_2' };
        Object.entries(nature).forEach(([file, key]) => {
            jobs.push(load(`nature/${file}.png`).then(img => {
                if (!img) return;
                cache[key] = imageToCanvas(img, 0, 0, img.width, img.height);
                customArt.add(key);
                replaced.push(file);
            }));
        });

        // Resource icons: assets/icons/<name>.png (32x32)
        ['wood', 'stone', 'iron', 'food', 'pop', 'day', 'storage'].forEach(name => {
            jobs.push(load(`icons/${name}.png`).then(img => {
                if (!img) return;
                cache[`icon_${name}`] = imageToCanvas(img, 0, 0, img.width, img.height);
                replaced.push('icon_' + name);
            }));
        });

        await Promise.all(jobs);
        // Derived caches must be rebuilt from the new art
        Object.keys(cache).forEach(k => {
            if (/^(thumb_|shadow_|stile_|stree_|sbld_|stone_winter|d_|tree_(oak|pine)_)/.test(k)) delete cache[k];
        });
        return replaced;
    }

    // Thumbnail of a building for the menu (fits into size x size)
    function getBuildingThumb(type, size = 40) {
        const key = `thumb_${type}_${size}`;
        if (cache[key]) return cache[key];
        const sprite = getBuilding(type);
        const c = createCanvas(size, size);
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        if (sprite) {
            const scale = Math.min(size / sprite.width, size / sprite.height);
            const dw = Math.floor(sprite.width * scale);
            const dh = Math.floor(sprite.height * scale);
            ctx.drawImage(sprite, Math.floor((size - dw) / 2), Math.floor((size - dh) / 2), dw, dh);
        }
        cache[key] = c;
        return c;
    }

    return {
        TILE_VARIANTS,
        drawTile,
        drawShore,
        drawWave,
        drawTree,
        drawPineTree,
        drawStonePile,
        drawFlowers,
        drawVillager,
        drawIcon,
        getBuilding,
        getBuildingShadow,
        getBuildingSeasonal,
        getSeasonalTile,
        getTree,
        getStonePile,
        getBuildingThumb,
        loadAssets,
        mulberry32,
    };
})();
