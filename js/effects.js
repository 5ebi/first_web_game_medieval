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

    return { reset, smoke, dust, sparks, floatText, update, draw };
})();
