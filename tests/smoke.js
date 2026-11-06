// Browser smoke test: plays a short game on desktop, phone portrait and phone landscape.
// Fails on console errors, a missing info panel, a panel that hides the map, or a broken
// save/continue. Screenshots land in tests/out/ - look at them, the canvas can't be asserted.
//
//   GAME_URL=http://127.0.0.1:8123/index.html node tests/smoke.js
const { chromium, devices } = require('playwright');
const path = require('path');
const zlib = require('zlib');

const URL = process.env.GAME_URL || 'http://127.0.0.1:8123/index.html';
const OUT = path.join(__dirname, 'out');
let failures = 0;
function check(ok, msg) {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
    if (!ok) failures++;
}

// Places a small village through the game API (fast and independent of the menu layout)
function buildVillage() {
    const near = (type, cx, cy, r = 14) => {
        for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
            if (Game.canPlace(type, cx + dx, cy + dy).ok) return Game.placeBuilding(type, cx + dx, cy + dy);
        }
        return null;
    };
    const cx = Math.floor(MAP_WIDTH / 2) - 2, cy = Math.floor(MAP_HEIGHT / 2) - 2;
    UI.deselectBuilding(true);
    near('castle', cx, cy);
    near('warehouse', cx + 5, cy + 1);
    const s = Game.getState();
    s.resources = { wood: 200, stone: 200, iron: 50, food: 200 };
    s.maxStorage = Math.max(s.maxStorage, 400);
    ['lumberjack', 'hunter', 'quarry', 'house'].forEach(t => near(t, cx, cy + 4, 25));
    return BuildingManager.getAll().map(b => b.type);
}

// A solid-colour RGBA PNG, used to stand in for a custom icon in assets/icons/
function solidPng(size, [r, g, b]) {
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = buf => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => {
        const td = Buffer.concat([Buffer.from(type), data]);
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
        return Buffer.concat([len, td, c]);
    };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
    const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(size).fill([r, g, b, 255]).flat())]);
    const raw = Buffer.concat(Array(size).fill(row));
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Menu icons and build-card thumbnails must have at least one device pixel per CSS pixel
function iconSharpness() {
    const dpr = window.devicePixelRatio || 1;
    const els = [...document.querySelectorAll('#resource-bar .resource-icon canvas, .cp-cat .cat-ic, .bld-pic img')]
        .filter(e => e.getBoundingClientRect().width > 0);
    const blurry = els.filter(e => (e.naturalWidth || e.width) + 1 < e.getBoundingClientRect().width * dpr)
        .map(e => `${e.className || e.parentNode.id}:${e.naturalWidth || e.width}px<${Math.round(e.getBoundingClientRect().width * dpr)}`);
    return { count: els.length, blurry };
}

async function run(browser, name, ctxOpts, touch) {
    console.log(`\n== ${name}`);
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    if (name === 'desktop') {
        // custom art: a plain red assets/icons/wood.png must replace the built-in wood icon
        await page.route('**/assets/manifest.json', r => r.fulfill({ contentType: 'application/json', body: '["icons/wood.png"]' }));
        await page.route('**/assets/icons/wood.png', r => r.fulfill({ contentType: 'image/png', body: solidPng(32, [255, 0, 0]) }));
    }
    await page.goto(URL);
    await page.waitForTimeout(400);
    if (touch) await page.tap('#start-btn'); else await page.click('#start-btn');
    await page.waitForTimeout(400);

    const sharp = await page.evaluate(iconSharpness);
    check(sharp.count >= 5 && sharp.blurry.length === 0, `${name}: ${sharp.count} menu icons rendered at screen resolution${sharp.blurry.length ? ': ' + sharp.blurry.join(', ') : ''}`);
    if (name === 'desktop') {
        const px = await page.evaluate(() => {
            const c = document.querySelector('#icon-wood canvas');
            return [...c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data];
        });
        check(px[0] === 255 && px[1] === 0 && px[2] === 0, `desktop: custom icons/wood.png replaces the wood icon (centre pixel ${px.join(',')})`);
    }

    const types = await page.evaluate(buildVillage);
    check(types.includes('castle') && types.includes('warehouse'), `${name}: castle and warehouse placed (${types.join(', ')})`);
    check(await page.evaluate(() => Game.isClockRunning()), `${name}: clock runs after the warehouse`);

    // let the construction finish and the villagers appear
    await page.waitForTimeout(3500);
    await page.evaluate(() => Game.update(20000));
    check(await page.evaluate(() => Villagers.getAll().length > 0), `${name}: villagers are out working`);

    // the map must stay visible above the menus
    const vp = page.viewportSize();
    const mapVisible = await page.evaluate(([w, h]) => document.elementFromPoint(w / 2, h * 0.4)?.id === 'game-canvas', [vp.width, vp.height]);
    check(mapVisible, `${name}: map visible in the middle of the screen`);

    // click / tap the warehouse -> info panel
    const pos = await page.evaluate(() => {
        const b = BuildingManager.getAll().find(x => x.type === 'warehouse');
        Renderer.centerOn(b.pixelX + b.width / 2, b.pixelY + b.height / 2);
        return Renderer.worldToScreen(b.pixelX + b.width / 2, b.pixelY + b.height / 2);
    });
    await page.waitForTimeout(200);
    if (touch) await page.touchscreen.tap(pos.x, pos.y);
    else await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => {
        const p = document.getElementById('info-panel');
        return { open: p && !p.classList.contains('hidden'), title: document.getElementById('info-title')?.textContent || '' };
    });
    check(info.open && info.title.length > 0, `${name}: building info opens (${info.title})`);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });

    if (name === 'desktop') {
        await page.evaluate(() => Game.save());
        const before = await page.evaluate(() => BuildingManager.getAll().length);
        await page.reload();
        await page.waitForTimeout(500);
        const cont = await page.isVisible('#continue-btn');
        check(cont, 'desktop: Continue offered after reload');
        if (cont) await page.click('#continue-btn');
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => BuildingManager.getAll().length);
        check(after === before, `desktop: save restores ${before} buildings (got ${after})`);
    }

    check(errors.length === 0, `${name}: no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();
}

(async () => {
    require('fs').mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch();
    try {
        await run(browser, 'desktop', { viewport: { width: 1440, height: 900 } }, false);
        await run(browser, 'phone-portrait', { ...devices['iPhone 15'] }, true);
        await run(browser, 'phone-landscape', { ...devices['iPhone 15 landscape'] }, true);
    } catch (e) {
        console.log('FAIL crashed: ' + e.message);
        failures++;
    }
    await browser.close();
    console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
    process.exit(failures ? 1 : 0);
})();
