// ============================================
// Effects - particles (smoke, dust) and floating texts
// ============================================

const Effects = (() => {
    let particles = [];
    let texts = [];

    function reset() {
        particles = [];
        texts = [];
    }

    function smoke(x, y) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 6 + 3,
            vy: -10 - Math.random() * 8,
            life: 1.6 + Math.random() * 0.8,
            age: 0,
            size: 3 + Math.random() * 2,
            grow: 2.5,
            color: '200,200,200',
            alpha: 0.45,
        });
    }

    function dust(x, y, w, h) {
        for (let i = 0; i < 14; i++) {
            particles.push({
                x: x + Math.random() * w,
                y: y + h - 4 + Math.random() * 6,
                vx: (Math.random() - 0.5) * 40,
                vy: -20 - Math.random() * 30,
                gravity: 60,
                life: 0.5 + Math.random() * 0.4,
                age: 0,
                size: 3 + Math.random() * 3,
                grow: 0,
                color: '190,170,130',
                alpha: 0.8,
            });
        }
    }

    function sparks(x, y) {
        for (let i = 0; i < 8; i++) {
            particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 30,
                vy: -30 - Math.random() * 30,
                gravity: 80,
                life: 0.4 + Math.random() * 0.3,
                age: 0,
                size: 2,
                grow: 0,
                color: '255,200,80',
                alpha: 1,
            });
        }
    }

    // Wood or stone chips flying off during construction
    function chips(x, y, color) {
        for (let i = 0; i < 3; i++) {
            particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 50,
                vy: -25 - Math.random() * 30,
                gravity: 140,
                life: 0.35 + Math.random() * 0.25,
                age: 0,
                size: 2,
                grow: 0,
                color,
                alpha: 1,
            });
        }
    }

    // Twinkling pixel stars when a building is finished
    function stars(x, y, w, h) {
        for (let i = 0; i < 9; i++) {
            particles.push({
                x: x + Math.random() * w,
                y: y + Math.random() * h * 0.7,
                vx: (Math.random() - 0.5) * 10,
                vy: -14 - Math.random() * 16,
                life: 0.8 + Math.random() * 0.6,
                age: 0,
                size: 1,
                grow: 0,
                color: Math.random() < 0.5 ? '255,246,190' : '255,255,255',
                alpha: 1,
                star: true,
                ph: Math.random() * 6,
            });
        }
    }

    // Expanding ring of dust around the footprint
    function ring(x, y, w, h) {
        const cx = x + w / 2, cy = y + h - 4;
        for (let i = 0; i < 22; i++) {
            const a = (i / 22) * Math.PI * 2;
            particles.push({
                x: cx + Math.cos(a) * w * 0.45,
                y: cy + Math.sin(a) * h * 0.18,
                vx: Math.cos(a) * 45,
                vy: Math.sin(a) * 16 - 6,
                life: 0.45 + Math.random() * 0.2,
                age: 0,
                size: 3 + Math.random() * 2,
                grow: 4,
                color: '205,185,145',
                alpha: 0.75,
            });
        }
    }

    function floatText(x, y, text, color = '#fff') {
        texts.push({ x, y, text, color, age: 0, life: 1.3 });
    }

    function update(dtSec) {
        if (dtSec <= 0) return;
        particles.forEach(p => {
            p.age += dtSec;
            p.x += p.vx * dtSec;
            p.y += p.vy * dtSec;
            if (p.gravity) p.vy += p.gravity * dtSec;
            p.size += (p.grow || 0) * dtSec;
        });
        particles = particles.filter(p => p.age < p.life);

        texts.forEach(t => { t.age += dtSec; t.y -= 18 * dtSec; });
        texts = texts.filter(t => t.age < t.life);
    }

    // ctx is already transformed to world coordinates
    function draw(ctx) {
        particles.forEach(p => {
            const k = 1 - p.age / p.life;
            if (p.star) {
                const tw = 0.5 + 0.5 * Math.sin(p.age * 18 + p.ph);
                ctx.fillStyle = `rgba(${p.color},${(k * tw).toFixed(3)})`;
                const x = Math.round(p.x), y = Math.round(p.y);
                ctx.fillRect(x - 1, y, 3, 1);
                ctx.fillRect(x, y - 1, 1, 3);
                if (tw > 0.7) { ctx.fillRect(x - 2, y, 1, 1); ctx.fillRect(x + 2, y, 1, 1); ctx.fillRect(x, y - 2, 1, 1); ctx.fillRect(x, y + 2, 1, 1); }
                return;
            }
            ctx.fillStyle = `rgba(${p.color},${(p.alpha * k).toFixed(3)})`;
            const s = Math.round(p.size);
            ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
        });
        if (texts.length) {
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            texts.forEach(t => {
                const k = 1 - t.age / t.life;
                ctx.globalAlpha = Math.min(1, k * 2);
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillText(t.text, Math.round(t.x) + 1, Math.round(t.y) + 1);
                ctx.fillStyle = t.color;
                ctx.fillText(t.text, Math.round(t.x), Math.round(t.y));
            });
            ctx.globalAlpha = 1;
            ctx.textAlign = 'left';
        }
    }

    return { reset, smoke, dust, sparks, chips, stars, ring, floatText, update, draw };
})();
