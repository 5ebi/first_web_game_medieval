// Browser smoke test: plays a short game on desktop, phone portrait and phone landscape.
// Fails on console errors, a missing info panel, a panel that hides the map, or a broken
// save/continue. Screenshots land in tests/out/ - look at them, the canvas can't be asserted.
//
//   GAME_URL=http://127.0.0.1:8123/index.html node tests/smoke.js
const { chromium, devices } = require('playwright');
const path = require('path');

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

async function run(browser, name, ctxOpts, touch) {
    console.log(`\n== ${name}`);
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(URL);
    await page.waitForTimeout(400);
    if (touch) await page.tap('#start-btn'); else await page.click('#start-btn');
    await page.waitForTimeout(400);

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

    // top bar: the meat balance per minute is always visible (no hover on phones)
    const meatRate = await page.evaluate(() => {
        UI.updateResources();
        const r = document.querySelector('#res-food .rate');
        if (!r) return { shown: false, text: '' };
        const box = r.getBoundingClientRect();
        return { shown: getComputedStyle(r).display !== 'none' && box.width > 0 && box.height > 0, text: r.textContent };
    });
    check(meatRate.shown, `${name}: meat rate visible in the top bar (${meatRate.text})`);

    // tapping / clicking the meat counter shows produced vs. eaten
    if (touch) await page.tap('#food-res'); else await page.click('#food-res');
    await page.waitForTimeout(150);
    const pop = await page.evaluate(() => {
        const p = document.getElementById('food-pop');
        return { open: !p.classList.contains('hidden') && p.offsetHeight > 0, rows: p.querySelectorAll('.fp-row .rate').length };
    });
    check(pop.open && pop.rows === 3, `${name}: meat breakdown opens on ${touch ? 'tap' : 'click'} (${pop.rows} rows)`);
    if (pop.open) await page.screenshot({ path: path.join(OUT, `${name}-meat.png`) });
    if (touch) await page.tap('#food-res'); else await page.click('#food-res');
    await page.waitForTimeout(100);
    check(await page.evaluate(() => document.getElementById('food-pop').classList.contains('hidden')), `${name}: meat breakdown closes again`);

    // worst case: every resource has four digits and a rate; the resources must stay on one row
    const bar = await page.evaluate(() => {
        const s = Game.getState();
        const keep = { ...s.resources };
        s.resources = { wood: 1888, stone: 1888, iron: 1888, food: 1888 };
        const origRates = Game.getRates;
        Game.getRates = () => ({ wood: 12.5, stone: 8.5, iron: 3.5, food: 0.5 });
        UI.updateResources();
        const items = Array.from(document.querySelectorAll('#resource-bar .resource'))
            .filter(el => el.offsetParent && !el.classList.contains('day'));
        // count rows by vertical centre (items differ in height: value + rate line)
        const mids = items.map(el => { const b = el.getBoundingClientRect(); return b.top + b.height / 2; });
        const tops = new Set(mids.map(m => Math.round((m - mids[0]) / 12)));
        const rb = document.getElementById('resource-bar');
        const res = { rows: tops.size, overflow: rb.scrollWidth > rb.clientWidth + 1 };
        s.resources = keep;
        Game.getRates = origRates;
        UI.updateResources();
        return res;
    });
    check(bar.rows === 1 && !bar.overflow, `${name}: resources fit in one row with rates (rows ${bar.rows}, overflow ${bar.overflow})`);

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
