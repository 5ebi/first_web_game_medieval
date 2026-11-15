// ============================================
// UI materials: pixel textures for the HUD, drawn once at startup
// ============================================
// The interface is built from "materials" (oak boards, parchment) instead of
// translucent boxes. The textures are tiny seeded canvases exposed as CSS
// variables (--tex-*), the same way Sprites exposes the icons.

const Theme = (() => {
    const SCALE = 2; // one texture pixel = 2 CSS px, like the sprites

    function rng(seed) {
        let a = seed;
        return () => {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function texture(w, h, draw) {
        const c = document.createElement('canvas');
        c.width = w * SCALE;
        c.height = h * SCALE;
        const ctx = c.getContext('2d');
        const rect = (x, y, rw, rh, color) => {
            ctx.fillStyle = color;
            // wrap horizontally so the tile repeats without a seam
            const x0 = ((x % w) + w) % w;
            ctx.fillRect(x0 * SCALE, y * SCALE, rw * SCALE, rh * SCALE);
            if (x0 + rw > w) ctx.fillRect((x0 - w) * SCALE, y * SCALE, rw * SCALE, rh * SCALE);
        };
        draw(rect);
        return c.toDataURL();
    }

    // Oak boards: rows of planks with seams, butt joints and grain streaks.
    // rowHeight 0 = one solid beam (grain only), for bars that carry small text.
    function wood(seed, c, rowHeight) {
        const W = 64, H = 48, ROW = rowHeight || H;
        const rand = rng(seed);
        return texture(W, H, rect => {
            for (let row = 0; row < H / ROW; row++) {
                const y = row * ROW;
                rect(0, y, W, ROW, c.base[row % c.base.length]);
                for (let i = 0; i < ROW * 1.4; i++) {
                    const gy = y + 1 + Math.floor(rand() * (ROW - 3));
                    const len = 3 + Math.floor(rand() * 12);
                    rect(Math.floor(rand() * W), gy, len, 1, rand() < 0.6 ? c.grainDark : c.grainLight);
                }
                if (!rowHeight) continue;
                rect(0, y, W, 1, c.light);            // top edge catches the light
                rect(0, y + ROW - 1, W, 1, c.seam);   // gap to the next board
                const joint = Math.floor(rand() * W); // where two boards meet
                rect(joint, y + 1, 1, ROW - 2, c.seam);
                rect(joint + 1, y + 1, 1, ROW - 2, c.light);
                rect(joint - 2, y + 3, 1, 1, c.nail);
                rect(joint + 3, y + ROW - 5, 1, 1, c.nail);
            }
        });
    }

    // Parchment: uneven cream with a few fibres and stains
    function parchment(seed) {
        const W = 48, H = 48;
        const rand = rng(seed);
        return texture(W, H, rect => {
            rect(0, 0, W, H, '#e2d1a3');
            for (let i = 0; i < 150; i++) {
                const x = Math.floor(rand() * W), y = Math.floor(rand() * H);
                const r = rand();
                if (r < 0.45) rect(x, y, 1 + Math.floor(rand() * 2), 1, '#e9dab0');
                else if (r < 0.85) rect(x, y, 1 + Math.floor(rand() * 3), 1, '#d9c794');
                else rect(x, y, 1, 1, '#cdb984');
            }
        });
    }

    function install() {
        const root = document.documentElement.style;
        root.setProperty('--tex-wood', `url("${wood(11, {
            base: ['#4f321c', '#4a2e19', '#52341d'],
            grainDark: '#442a16', grainLight: '#593a21',
            light: '#5b3b20', seam: '#352011', nail: '#2a180b',
        }, 24)}")`);
        root.setProperty('--tex-wood-dark', `url("${wood(23, {
            base: ['#35210f'],
            grainDark: '#2c1a0b', grainLight: '#3e2813',
        }, 0)}")`);
        root.setProperty('--tex-parchment', `url("${parchment(7)}")`);
    }

    return { install };
})();
