// ============================================
// Atmosphere - weather, clouds, fog and ambient life
// Everything is rendered on a coarse pixel grid to keep the pixel-art look.
// ============================================

const Atmosphere = (() => {
    const CLOUD_CELL = 4;   // world px per cloud pixel
    let FOG_CELL = 4;       // world px per fog pixel (8 when zoomed far out, to save work)
    const NOISE_N = 128;    // tileable noise texture size
    const CLOUD_MARGIN = 360;
    const SHADOW_OFFSET = { x: 70, y: 150 };
    const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const WEATHERS = {
        clear:  { cover: 0.18, fog: 0.0, rain: 0, wind: 0.3,  weight: 0.45, days: [3, 7] },
        cloudy: { cover: 0.75, fog: 0.1, rain: 0, wind: 0.65, weight: 0.3,  days: [2, 5] },
        rain:   { cover: 1.0,  fog: 0.3, rain: 1, wind: 0.9,  weight: 0.15, days: [2, 4] },
        fog:    { cover: 0.35, fog: 1.0, rain: 0, wind: 0.1,  weight: 0.1,  days: [1.5, 3] },
    };

    const FOG_ALPHA = [0, 38, 70, 105, 140]; // alpha per fog band (0-255)

    let enabled = Settings.get('fxOn') !== false;
    let weather = 'clear';
    let weatherUntil = 4;
    let lastGameDay = 0;
    const p = { cover: 0.18, fog: 0, rain: 0, wind: 0.3 };
    let night = 0, dusk = 0;
    let windX = 0, fogU = 0, fogV = 0;
    let flash = 0;
    let onWeatherChange = null;

    let cloudShapes = [];
    let clouds = [];
    let birds = [], birdTimer = 6;
    let butterflies = [], fireflies = [], leaves = [];
    let drops = [], splashes = [];

    let noise = null, mask = null;
    let fogCanvas = null, fogCtx = null, fogImg = null, fogRect = null, fogFrame = 0;
    let glowSprite = null, fireflySprite = null;
    let vignette = null, vigKey = '';

    // ---------- helpers ----------
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const rand = (a, b) => a + Math.random() * (b - a);
    const snap = (v, s) => Math.round(v / s) * s;

    function makeCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        return c;
    }

    // ---------- clouds ----------
    function makeCloudShape() {
        const w = 26 + Math.floor(Math.random() * 30);
        const h = 12 + Math.floor(Math.random() * 7);
        const blobs = 4 + Math.floor(Math.random() * 4);
        const circles = [];
        for (let i = 0; i < blobs; i++) {
            const k = blobs === 1 ? 0.5 : i / (blobs - 1);
            const cx = 4 + (w - 8) * k + rand(-2, 2);
            const r = h * 0.28 + h * 0.3 * (1 - Math.abs(2 * k - 1)) + rand(0, 1.5);
            const cy = h - 2 - r * 0.65;
            circles.push([cx, cy, r]);
        }
        const inside = (x, y) => {
            if (x < 0 || y < 0 || x >= w || y > h - 2) return false;
            return circles.some(([cx, cy, r]) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < r * r);
        };
        const sprite = makeCanvas(w, h);
        const shadow = makeCanvas(w, h);
        const sc = sprite.getContext('2d');
        const shc = shadow.getContext('2d');
        shc.fillStyle = '#000';
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (!inside(x, y)) continue;
                let col = '#eef2f8';
                if (!inside(x, y - 1) || !inside(x - 1, y - 1)) col = '#ffffff';
                else if (y > h * 0.66 || !inside(x + 1, y + 1)) col = '#cfd7e4';
                sc.fillStyle = col;
                sc.fillRect(x, y, 1, 1);
                shc.fillRect(x, y, 1, 1);
            }
        }
        return { sprite, shadow, w, h };
    }

    function initClouds() {
        cloudShapes = Array.from({ length: 7 }, makeCloudShape);
        const spanX = MAP_PIXEL_W + CLOUD_MARGIN * 2;
        const spanY = MAP_PIXEL_H + CLOUD_MARGIN * 2;
        clouds = Array.from({ length: 18 }, (_, i) => ({
            shape: cloudShapes[i % cloudShapes.length],
            x0: Math.random() * spanX,
            y0: Math.random() * spanY,
            thr: Math.random(),
            sm: rand(0.8, 1.25),
        }));
    }

    function cloudPos(c) {
        const w = c.shape.w * CLOUD_CELL;
        const spanX = MAP_PIXEL_W + CLOUD_MARGIN * 2 + w;
        const spanY = MAP_PIXEL_H + CLOUD_MARGIN * 2;
        const x = ((c.x0 + windX * c.sm) % spanX + spanX) % spanX - CLOUD_MARGIN - w;
        const y = ((c.y0 + windX * 0.18 * c.sm) % spanY + spanY) % spanY - CLOUD_MARGIN;
        return { x: snap(x, CLOUD_CELL), y: snap(y, CLOUD_CELL) };
    }

    function cloudVis(c) {
        return clamp((p.cover - c.thr) / 0.15, 0, 1);
    }

    // ---------- fog ----------
    function makeNoise() {
        const N = NOISE_N;
        const out = new Float32Array(N * N);
        const octave = (G, amp) => {
            const g = new Float32Array(G * G).map(() => Math.random());
            for (let y = 0; y < N; y++) {
                const gy = y / N * G, iy = Math.floor(gy), fy0 = gy - iy, fy = fy0 * fy0 * (3 - 2 * fy0);
                for (let x = 0; x < N; x++) {
                    const gx = x / N * G, ix = Math.floor(gx), fx0 = gx - ix, fx = fx0 * fx0 * (3 - 2 * fx0);
                    const x1 = (ix + 1) % G, y1 = (iy + 1) % G;
                    const a = g[iy * G + ix], b = g[iy * G + x1], c = g[y1 * G + ix], d = g[y1 * G + x1];
                    out[y * N + x] += amp * ((a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy);
                }
            }
        };
        octave(8, 0.65);
        octave(16, 0.35);
        return out;
    }

    function sampleNoise(u, v) {
        const N = NOISE_N;
        u = ((u % N) + N) % N; v = ((v % N) + N) % N;
        const ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
        const x1 = (ix + 1) % N, y1 = (iy + 1) % N;
        const a = noise[iy * N + ix], b = noise[iy * N + x1], c = noise[y1 * N + ix], d = noise[y1 * N + x1];
        const top = a + (b - a) * fx, bot = c + (d - c) * fx;
        return top + (bot - top) * fy;
    }

    function buildMask() {
        const W = MAP_WIDTH, H = MAP_HEIGHT;
        let m = new Float32Array(W * H);
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const t = GameMap.getTerrain(x, y);
                m[y * W + x] = t === TERRAIN.WATER ? 1 : t === TERRAIN.SAND ? 0.75 : t === TERRAIN.FOREST ? 0.7 : t === TERRAIN.GRASS_DARK ? 0.45 : 0.35;
            }
        }
        const blur = (src) => {
            const dst = new Float32Array(W * H);
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    let s = 0, n = 0;
                    for (let dy = -2; dy <= 2; dy++) {
                        for (let dx = -2; dx <= 2; dx++) {
                            const xx = x + dx, yy = y + dy;
                            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                            s += src[yy * W + xx]; n++;
                        }
                    }
                    dst[y * W + x] = s / n;
                }
            }
            return dst;
        };
        mask = blur(blur(m));
    }

    function sampleMask(wx, wy) {
        if (!mask) return 0.35;
        const W = MAP_WIDTH, H = MAP_HEIGHT;
        const fx = clamp(wx / TILE_SIZE - 0.5, 0, W - 1), fy = clamp(wy / TILE_SIZE - 0.5, 0, H - 1);
        const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const x1 = Math.min(W - 1, ix + 1), y1 = Math.min(H - 1, iy + 1);
        const a = mask[iy * W + ix], b = mask[iy * W + x1], c = mask[y1 * W + ix], d = mask[y1 * W + x1];
        const top = a + (b - a) * tx, bot = c + (d - c) * tx;
        return top + (bot - top) * ty;
    }

    function fogLevel() {
        return clamp(p.fog * 0.9 + night * 0.22 + dusk * 0.16, 0, 1);
    }

    function renderFog(view) {
        const level = fogLevel();
        FOG_CELL = view.zoom >= 0.9 ? 4 : 8;
        const nScale = 0.22 * FOG_CELL / 8; // keep blob size constant in world space
        const cx0 = Math.max(0, Math.floor(view.x0 / FOG_CELL) - 1);
        const cy0 = Math.max(0, Math.floor(view.y0 / FOG_CELL) - 1);
        const cx1 = Math.min(MAP_PIXEL_W / FOG_CELL, Math.ceil(view.x1 / FOG_CELL) + 1);
        const cy1 = Math.min(MAP_PIXEL_H / FOG_CELL, Math.ceil(view.y1 / FOG_CELL) + 1);
        const cw = cx1 - cx0, ch = cy1 - cy0;
        if (cw <= 0 || ch <= 0) { fogRect = null; return; }

        if (!fogCanvas || fogCanvas.width !== cw || fogCanvas.height !== ch) {
            fogCanvas = makeCanvas(cw, ch);
            fogCtx = fogCanvas.getContext('2d');
            fogImg = fogCtx.createImageData(cw, ch);
        }
        const data = fogImg.data;
        const r = Math.round(232 - 62 * night), g = Math.round(236 - 51 * night), b = Math.round(242 - 17 * night);
        for (let y = 0; y < ch; y++) {
            const cy = cy0 + y;
            const wy = (cy + 0.5) * FOG_CELL;
            for (let x = 0; x < cw; x++) {
                const cx = cx0 + x;
                const n = sampleNoise(cx * nScale + fogU, cy * nScale + fogV);
                const shaped = clamp((n - 0.38) / 0.4, 0, 1);
                const d = level * sampleMask((cx + 0.5) * FOG_CELL, wy) * shaped * 2.0;
                // Posterised into 4 flat bands: clean stepped fog banks instead of grainy dithering
                const q = clamp(Math.floor(d * 4), 0, 4);
                const i = (y * cw + x) * 4;
                data[i] = r; data[i + 1] = g; data[i + 2] = b;
                data[i + 3] = FOG_ALPHA[q];
            }
        }
        fogCtx.putImageData(fogImg, 0, 0);
        fogRect = { x: cx0 * FOG_CELL, y: cy0 * FOG_CELL, w: cw * FOG_CELL, h: ch * FOG_CELL };
    }

    // ---------- glow sprites ----------
    function makeGlow(cells, cellPx, rgb, levels) {
        const c = makeCanvas(cells * cellPx, cells * cellPx);
        const ctx = c.getContext('2d');
        const mid = cells / 2;
        for (let y = 0; y < cells; y++) {
            for (let x = 0; x < cells; x++) {
                const d = Math.hypot(x + 0.5 - mid, y + 0.5 - mid) / mid;
                const lv = levels.find(([lim]) => d < lim);
                if (!lv) continue;
                ctx.fillStyle = `rgba(${rgb},${lv[1]})`;
                ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
            }
        }
        return c;
    }

    function makeVignette(w, h) {
        const s = 6;
        const vw = Math.ceil(w / s), vh = Math.ceil(h / s);
        const c = makeCanvas(vw, vh);
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(vw, vh);
        for (let y = 0; y < vh; y++) {
            for (let x = 0; x < vw; x++) {
                const nx = (x + 0.5) / vw * 2 - 1, ny = (y + 0.5) / vh * 2 - 1;
                const r = Math.sqrt(nx * nx * 0.9 + ny * ny * 1.1);
                const d = clamp((r - 0.78) / 0.5, 0, 1);
                img.data[(y * vw + x) * 4 + 3] = [0, 16, 30, 46][clamp(Math.floor(d * 4), 0, 3)];
            }
        }
        ctx.putImageData(img, 0, 0);
        return c;
    }

    // ---------- weather ----------
    function pickWeather(gameDay) {
        const prev = weather;
        let next = prev;
        for (let i = 0; i < 2 && next === prev; i++) {
            let r = Math.random(), acc = 0;
            for (const [k, w] of Object.entries(WEATHERS)) {
                acc += w.weight;
                if (r <= acc) { next = k; break; }
            }
        }
        weather = next;
        const [a, b] = WEATHERS[next].days;
        weatherUntil = gameDay + rand(a, b);
        if (onWeatherChange && next !== prev) onWeatherChange(next, prev);
    }

    function setWeather(name, instant) {
        if (!WEATHERS[name]) return;
        const prev = weather;
        weather = name;
        if (instant) Object.assign(p, { cover: WEATHERS[name].cover, fog: WEATHERS[name].fog, rain: WEATHERS[name].rain, wind: WEATHERS[name].wind });
        if (onWeatherChange && name !== prev) onWeatherChange(name, prev);
    }

    // ---------- update ----------
    function update(dt, gs, nightAmt) {
        if (!clouds.length) initClouds();
        if (!noise) noise = makeNoise();

        night = nightAmt;
        const running = gs.started && !gs.paused && !gs.gameOver;
        const sm = running ? 0.3 + Math.min(gs.speed, 3) * 0.7 : 0.35;

        // Dusk / dawn glow: strongest around the edges of night
        if (Game.hasCastle()) {
            const t = (gs.day + gs.dayProgress) / DAY_NIGHT_CYCLE_DAYS;
            dusk = clamp(1 - Math.abs(Math.cos(t * Math.PI * 2)) * 3.2, 0, 1);
        } else {
            dusk = 0;
        }

        // Weather schedule (in game days)
        const gd = gs.day + gs.dayProgress;
        if (gd < lastGameDay - 0.5) { weather = 'clear'; weatherUntil = gd + 4; } // new game
        lastGameDay = gd;
        if (enabled && Game.hasCastle() && gd >= weatherUntil) pickWeather(gd);

        const target = enabled ? WEATHERS[weather] : { cover: 0, fog: 0, rain: 0, wind: 0.3 };
        const k = 1 - Math.exp(-dt * 0.35);
        p.cover += (target.cover - p.cover) * k;
        p.fog += (target.fog - p.fog) * k;
        p.rain += (target.rain - p.rain) * k;
        p.wind += (target.wind - p.wind) * k;

        windX += dt * sm * (6 + p.wind * 18);
        fogU += dt * sm * (0.25 + p.wind * 0.6) * 0.6;
        fogV += dt * sm * 0.08;

        if (typeof AudioSys !== 'undefined' && AudioSys.setAtmosphere) {
            AudioSys.setAtmosphere(enabled ? p.rain : 0, p.wind, night);
        }

        if (!enabled) return;

        // Thunder during heavy rain
        flash = Math.max(0, flash - dt * 3);
        if (p.rain > 0.8 && running && Math.random() < dt * 0.03) {
            if (!reducedMotion) flash = 1;
            const delay = rand(300, 1400);
            setTimeout(() => AudioSys.thunder && AudioSys.thunder(), delay);
        }

        updateLife(dt, sm);
    }

    // ---------- ambient life ----------
    let lastView = null;
    function inView(x, y, m = 0) {
        const v = lastView;
        return v && x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;
    }

    function updateLife(dt, sm) {
        const v = lastView;
        if (!v) return;
        const day = night < 0.3 && p.rain < 0.3;

        // Birds
        birdTimer -= dt;
        if (birdTimer <= 0) {
            birdTimer = rand(12, 30);
            if (day) spawnFlock(v);
        }
        birds.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; b.t += dt; });
        birds = birds.filter(b => inView(b.x, b.y, 900));

        // Butterflies near flowers
        if (day && butterflies.length < 8 && Math.random() < dt * 1.5) {
            const decos = GameMap.getDecorations().filter(d => inView(d.x * TILE_SIZE, d.y * TILE_SIZE, 40));
            if (decos.length) {
                const d = decos[Math.floor(Math.random() * decos.length)];
                butterflies.push({
                    ax: d.x * TILE_SIZE + 16, ay: d.y * TILE_SIZE + 16, t: 0, ph: rand(0, 6), life: rand(8, 15),
                    color: ['#f4f0e0', '#f0c040', '#f08a4a', '#8ab4ff', '#e070d0'][Math.floor(Math.random() * 5)],
                });
            }
        }
        butterflies.forEach(b => { b.t += dt; });
        butterflies = butterflies.filter(b => b.t < b.life && (day || b.t < b.life - 1));

        // Fireflies at night near forests and water
        if (night > 0.35 && fireflies.length < 26 && Math.random() < dt * 8) {
            for (let i = 0; i < 12; i++) {
                const tx = Math.floor(rand(v.x0, v.x1) / TILE_SIZE), ty = Math.floor(rand(v.y0, v.y1) / TILE_SIZE);
                const t = GameMap.getTerrain(tx, ty);
                if (t === TERRAIN.FOREST || t === TERRAIN.FLOWERS || (t === TERRAIN.GRASS_DARK && Math.random() < 0.3)) {
                    fireflies.push({ x: tx * TILE_SIZE + rand(0, 32), y: ty * TILE_SIZE + rand(0, 32), vx: 0, vy: 0, t: 0, ph: rand(0, 6), life: rand(4, 9) });
                    break;
                }
            }
        }
        fireflies.forEach(f => {
            f.t += dt;
            f.vx = clamp(f.vx + (Math.random() - 0.5) * dt * 30, -8, 8);
            f.vy = clamp(f.vy + (Math.random() - 0.5) * dt * 30, -6, 6);
            f.x += f.vx * dt; f.y += f.vy * dt;
        });
        fireflies = fireflies.filter(f => f.t < f.life);

        // Falling leaves when it is windy
        if (p.wind > 0.45 && night < 0.7 && Math.random() < dt * p.wind * 4) {
            const trees = GameMap.getTrees();
            for (let i = 0; i < 20 && trees.length; i++) {
                const tr = trees[Math.floor(Math.random() * trees.length)];
                if (!inView(tr.x, tr.y, 20)) continue;
                leaves.push({
                    x: tr.x + rand(-10, 10), y: tr.y - rand(10, 34), t: 0, life: rand(2.5, 4), ph: rand(0, 6),
                    color: ['#3a8528', '#5aa538', '#c49a3a', '#b8632a'][Math.floor(Math.random() * 4)],
                });
                break;
            }
        }
        leaves.forEach(l => {
            l.t += dt;
            l.x += (10 + p.wind * 22) * dt * sm + Math.sin(l.t * 3 + l.ph) * 0.4;
            l.y += 11 * dt;
        });
        leaves = leaves.filter(l => l.t < l.life);
    }

    function spawnFlock(v) {
        const n = 3 + Math.floor(Math.random() * 4);
        const fromLeft = Math.random() < 0.5;
        const speed = rand(45, 70);
        const vx = fromLeft ? speed : -speed;
        const vy = rand(-12, 12);
        const sx = fromLeft ? v.x0 - 60 : v.x1 + 60;
        const sy = rand(v.y0 + 40, v.y1 - 40);
        for (let i = 0; i < n; i++) {
            const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
            birds.push({ x: sx - Math.abs(k) * 12 * Math.sign(vx), y: sy + k * 9, vx, vy, t: rand(0, 1) });
        }
    }

    // ---------- drawing ----------
    function cloudAlphaForZoom(zoom) {
        return clamp((1.6 - zoom) / 1.1, 0.1, 1);
    }

    // Under the sky: fog, cloud shadows, butterflies, leaves (world transform)
    function drawGround(ctx, view) {
        lastView = view;
        if (!enabled) return;

        // Fog (recomputed every second frame, drawn every frame)
        if (fogLevel() > 0.02) {
            fogFrame = (fogFrame + 1) % 2;
            if (fogFrame === 0 || !fogRect) renderFog(view);
            if (fogRect && fogCanvas) ctx.drawImage(fogCanvas, fogRect.x, fogRect.y, fogRect.w, fogRect.h);
        }

        // Cloud shadows
        const shadowStrength = 0.13 * (1 - night * 0.8);
        if (shadowStrength > 0.01) {
            clouds.forEach(c => {
                const vis = cloudVis(c);
                if (vis <= 0) return;
                const pos = cloudPos(c);
                const x = pos.x + SHADOW_OFFSET.x, y = pos.y + SHADOW_OFFSET.y;
                const w = c.shape.w * CLOUD_CELL, h = c.shape.h * CLOUD_CELL;
                if (x + w < view.x0 || x > view.x1 || y + h < view.y0 || y > view.y1) return;
                ctx.globalAlpha = shadowStrength * vis;
                ctx.drawImage(c.shape.shadow, x, y, w, h);
            });
            ctx.globalAlpha = 1;
        }

        // Butterflies
        butterflies.forEach(b => {
            const fade = Math.min(1, b.t, b.life - b.t);
            const x = Math.round(b.ax + Math.sin(b.t * 0.7 + b.ph) * 14 + Math.sin(b.t * 2.3) * 4);
            const y = Math.round(b.ay + Math.cos(b.t * 0.9 + b.ph) * 8 - 8);
            ctx.globalAlpha = clamp(fade, 0, 1);
            ctx.fillStyle = b.color;
            if (Math.floor(b.t * 9) % 2 === 0) {
                ctx.fillRect(x - 3, y, 2, 2);
                ctx.fillRect(x + 1, y, 2, 2);
            } else {
                ctx.fillRect(x - 1, y, 1, 2);
                ctx.fillRect(x + 1, y, 1, 2);
            }
            ctx.fillStyle = '#2a1a08';
            ctx.fillRect(x, y, 1, 2);
        });

        // Leaves
        leaves.forEach(l => {
            ctx.globalAlpha = clamp(Math.min(l.t * 3, l.life - l.t), 0, 1);
            ctx.fillStyle = l.color;
            const flip = Math.floor(l.t * 6) % 2;
            ctx.fillRect(Math.round(l.x), Math.round(l.y), flip ? 2 : 1, flip ? 1 : 2);
        });
        ctx.globalAlpha = 1;
    }

    const BIRD_FRAMES = [
        [[0, 0], [6, 0], [1, 1], [2, 1], [4, 1], [5, 1], [3, 2]],         // wings up
        [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [0, 2], [3, 2], [6, 2]], // wings down
    ];

    function drawBird(ctx, x, y, frame, color) {
        ctx.fillStyle = color;
        BIRD_FRAMES[frame].forEach(([cx, cy]) => ctx.fillRect(Math.round(x) + cx * 2 - 7, Math.round(y) + cy * 2, 2, 2));
    }

    // Above everything in the world: birds and clouds (world transform)
    function drawSky(ctx, view) {
        if (!enabled) return;

        birds.forEach(b => {
            const frame = Math.floor(b.t * 5) % 2;
            ctx.globalAlpha = 0.18;
            drawBird(ctx, b.x + 40, b.y + 90, frame, '#000');
            ctx.globalAlpha = 1;
            drawBird(ctx, b.x, b.y, frame, '#2b2622');
        });

        const za = cloudAlphaForZoom(view.zoom);
        clouds.forEach(c => {
            const vis = cloudVis(c);
            if (vis <= 0) return;
            const pos = cloudPos(c);
            const w = c.shape.w * CLOUD_CELL, h = c.shape.h * CLOUD_CELL;
            if (pos.x + w < view.x0 || pos.x > view.x1 || pos.y + h < view.y0 || pos.y > view.y1) return;
            ctx.globalAlpha = 0.75 * vis * za * (p.rain > 0.5 ? 0.85 : 1);
            ctx.drawImage(c.shape.sprite, pos.x, pos.y, w, h);
        });
        ctx.globalAlpha = 1;
    }

    // Screen-space pass after the night tint: dusk, rain, glows, flash, vignette
    function drawScreen(ctx, view) {
        if (!glowSprite) {
            glowSprite = makeGlow(12, 3, '255,170,70', [[0.35, 0.5], [0.62, 0.28], [0.88, 0.12]]);
            fireflySprite = makeGlow(5, 2, '210,255,110', [[0.3, 1], [0.75, 0.35], [1.01, 0.12]]);
        }
        const W = view.w, H = view.h;

        if (enabled) {
            // Warm dusk / dawn light
            if (dusk > 0.02) {
                ctx.fillStyle = `rgba(255, 140, 60, ${(dusk * 0.09).toFixed(3)})`;
                ctx.fillRect(0, 0, W, H);
            }
            // Overcast / rain dimming
            const dim = p.rain * 0.16 + Math.max(0, p.cover - 0.5) * 0.08;
            if (dim > 0.01) {
                ctx.fillStyle = `rgba(40, 55, 80, ${dim.toFixed(3)})`;
                ctx.fillRect(0, 0, W, H);
            }
        }

        // Warm light halos around lit windows and the forge (world space, additive)
        view.setWorld();
        ctx.globalCompositeOperation = 'lighter';
        const lightK = clamp((night - 0.15) * 2, 0, 1);
        BuildingManager.getAll().forEach(b => {
            const forge = b.type === 'blacksmith' && b.active;
            if (!(lightK > 0 && b.def.lights) && !forge) return;
            if (b.pixelX + b.width + 40 < view.x0 || b.pixelX - 40 > view.x1 || b.pixelY + b.height + 40 < view.y0 || b.pixelY - 60 > view.y1) return;
            const spr = Sprites.getBuilding(b.type, { grown: b.grown });
            const ox = b.pixelX + Math.round((b.width - spr.width) / 2);
            const oy = b.pixelY + b.height - spr.height;
            if (lightK > 0 && b.def.lights) {
                ctx.globalAlpha = lightK * 0.9;
                b.def.lights.forEach(([lx, ly, lw, lh]) => {
                    ctx.drawImage(glowSprite, snap(ox + lx + lw / 2 - 18, 3), snap(oy + ly + lh / 2 - 18, 3));
                });
            }
            if (forge) {
                const flick = 0.85 + Math.sin(performance.now() / 90) * 0.08 + Math.random() * 0.07;
                ctx.globalAlpha = (0.2 + lightK * 0.7) * flick;
                ctx.drawImage(glowSprite, snap(ox + 32 - 18, 3), snap(oy + 38 - 18, 3));
            }
        });

        // Fireflies
        if (enabled) {
            fireflies.forEach(f => {
                const fade = clamp(Math.min(f.t, f.life - f.t), 0, 1);
                const pulse = 0.4 + 0.6 * Math.max(0, Math.sin(f.t * 3 + f.ph));
                ctx.globalAlpha = fade * pulse * clamp((night - 0.35) * 3, 0, 1);
                ctx.drawImage(fireflySprite, Math.round(f.x) - 5, Math.round(f.y) - 5);
            });
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        view.setScreen();

        if (enabled) {
            drawRain(ctx, view);
            if (flash > 0.01) {
                ctx.fillStyle = `rgba(230, 235, 255, ${(flash * 0.35).toFixed(3)})`;
                ctx.fillRect(0, 0, W, H);
            }
        }

        // Pixel vignette
        const key = `${W}x${H}`;
        if (vigKey !== key) { vignette = makeVignette(W, H); vigKey = key; }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(vignette, 0, 0, vignette.width * 6, vignette.height * 6);
    }

    let lastRainT = performance.now();
    function drawRain(ctx, view) {
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastRainT) / 1000);
        lastRainT = now;
        const W = view.w, H = view.h;
        const want = Math.floor(p.rain * 240 * (W * H) / (1280 * 800));
        while (drops.length < want) drops.push({ x: rand(-40, W), y: rand(-H, 0), vy: rand(460, 600), gy: rand(H * 0.1, H) });
        if (drops.length > want) drops.length = want;
        if (!drops.length && !splashes.length) return;

        const vx = 60 + p.wind * 80;
        ctx.fillStyle = 'rgba(175, 195, 235, 0.55)';
        drops.forEach(d => {
            d.y += d.vy * dt;
            d.x += vx * dt;
            if (d.y >= d.gy) {
                splashes.push({ x: Math.round(d.x), y: Math.round(d.gy), t: 0 });
                d.x = rand(-60, W); d.y = rand(-60, -10); d.gy = rand(H * 0.1, H);
            }
            const s = vx / d.vy * 4;
            for (let k = 0; k < 3; k++) ctx.fillRect(Math.round(d.x + k * s), Math.round(d.y + k * 4), 2, 4);
        });
        splashes.forEach(s => { s.t += dt; });
        splashes = splashes.filter(s => s.t < 0.18);
        splashes.forEach(s => {
            ctx.fillStyle = `rgba(200, 215, 245, ${(0.6 * (1 - s.t / 0.18)).toFixed(3)})`;
            ctx.fillRect(s.x - 4, s.y, 2, 1);
            ctx.fillRect(s.x + 2, s.y, 2, 1);
            ctx.fillRect(s.x - 1, s.y - 2, 2, 1);
        });
    }

    // ---------- public ----------
    function onMapChanged() {
        buildMask();
        fogCanvas = null;
        fogRect = null;
        butterflies = []; fireflies = []; leaves = []; birds = [];
    }

    function setEnabled(on) {
        enabled = on;
        Settings.set('fxOn', on);
        if (!on) {
            birds = []; butterflies = []; fireflies = []; leaves = []; drops = []; splashes = [];
            flash = 0;
        }
    }

    function getSkyIcon() {
        if (enabled && weather === 'rain') return 'rain';
        if (enabled && weather === 'fog') return 'fog';
        if (night > 0.55) return 'moon';
        if (enabled && weather === 'cloudy') return 'cloud';
        return 'day';
    }

    function getWeather() { return enabled ? weather : 'clear'; }
    function isEnabled() { return enabled; }
    function setWeatherListener(fn) { onWeatherChange = fn; }

    return {
        update,
        drawGround,
        drawSky,
        drawScreen,
        onMapChanged,
        setEnabled,
        isEnabled,
        getSkyIcon,
        getWeather,
        setWeather,
        setWeatherListener,
    };
})();
