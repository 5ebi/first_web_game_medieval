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

// Iron mine, weapon smith and barracks next to the village
function buildMilitary() {
    const near = (type, cx, cy, r = 30) => {
        for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
            if (Game.canPlace(type, cx + dx, cy + dy).ok) return Game.placeBuilding(type, cx + dx, cy + dy);
        }
        return null;
    };
    const castle = BuildingManager.getAll().find(b => b.type === 'castle');
    const s = Game.getState();
    s.resources = { wood: 200, stone: 200, iron: 50, food: 200 };
    const out = {};
    ['iron_mine', 'weaponsmith', 'barracks'].forEach(t => { out[t] = !!near(t, castle.tileX, castle.tileY + 5); });
    return out;
}

// Centers a building and returns its screen position
async function focusBuilding(page, type) {
    const pos = await page.evaluate((type) => {
        const b = BuildingManager.getAll().find(x => x.type === type);
        Renderer.centerOn(b.pixelX + b.width / 2, b.pixelY + b.height / 2);
        return Renderer.worldToScreen(b.pixelX + b.width / 2, b.pixelY + b.height / 2 - 6);
    }, type);
    await page.waitForTimeout(200);
    return pos;
}

async function tapAt(page, touch, pos) {
    if (touch) await page.touchscreen.tap(pos.x, pos.y);
    else await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(400);
}

async function press(page, touch, selector) {
    const el = await page.$(selector);
    if (!el) return false;
    if (touch) await el.tap(); else await el.click();
    await page.waitForTimeout(300);
    return true;
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

    // ---- military: weapon smith -> swords -> barracks -> swordsman ----
    const mil = await page.evaluate(buildMilitary);
    check(mil.iron_mine && mil.weaponsmith && mil.barracks, `${name}: iron mine, weapon smith and barracks placed (${JSON.stringify(mil)})`);
    check(await page.evaluate(() => !BUILD_ORDER.includes('blacksmith') && !BUILDINGS.blacksmith), `${name}: no blacksmith left`);
    await page.waitForTimeout(2500);
    await page.evaluate(() => UI.hideInfo());
    await tapAt(page, touch, await focusBuilding(page, 'weaponsmith'));
    const nWeapons = await page.evaluate(() => Object.keys(WEAPONS).length);
    const smithBtns = await page.$$('#info-controls [data-product]');
    check(smithBtns.length === nWeapons, `${name}: weapon smith offers ${smithBtns.length} weapons`);
    await press(page, touch, '#info-controls [data-product="sword"]');
    check(await page.evaluate(() => BuildingManager.getAll().find(b => b.type === 'weaponsmith').product === 'sword'), `${name}: smith switched to swords`);
    const forged = await page.evaluate(() => {
        const i = Game.getState().resources.iron;
        Game.update(45000);
        return { swords: Game.getState().weapons.sword, ironUsed: i - Game.getState().resources.iron };
    });
    check(forged.swords >= 1, `${name}: smith forged a sword (${forged.swords}, iron used ${forged.ironUsed})`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${name}-smith.png`) });

    await tapAt(page, touch, await focusBuilding(page, 'barracks'));
    const before = await page.evaluate(() => ({ units: Units.getAll().length, swords: Game.getState().weapons.sword, used: Game.getState().populationUsed }));
    const archerOff = await page.evaluate(() => document.querySelector('#info-controls [data-recruit="archer"]')?.getAttribute('aria-disabled') === 'true');
    check(archerOff, `${name}: recruit archer disabled without bows`);
    await press(page, touch, '#info-controls [data-recruit="swordsman"]');
    const after = await page.evaluate(() => ({ units: Units.getAll().length, swords: Game.getState().weapons.sword, used: Game.getState().populationUsed, type: Units.getAll()[0]?.type }));
    check(after.units === before.units + 1 && after.type === 'swordsman', `${name}: swordsman recruited (${after.units} unit(s))`);
    check(after.swords === before.swords - 1 && after.used === before.used + 1, `${name}: recruit used a sword and a villager who now eats`);
    await page.screenshot({ path: path.join(OUT, `${name}-barracks.png`) });

    // click the soldier -> unit info
    const upos = await page.evaluate(() => {
        Renderer.setZoom(2);
        const u = Units.getAll()[0];
        Renderer.centerOn(u.x, u.y - 10);
        return Renderer.worldToScreen(u.x, u.y - 10);
    });
    await page.waitForTimeout(200);
    await tapAt(page, touch, upos);
    const utitle = await page.evaluate(() => document.getElementById('info-title')?.textContent || '');
    check(utitle === await page.evaluate(() => t('unit.swordsman')), `${name}: soldier info opens (${utitle})`);
    await page.screenshot({ path: path.join(OUT, `${name}-unit.png`) });
    await page.evaluate(() => Renderer.setZoom(1));

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
        const kept = await page.evaluate(() => ({ units: Units.getAll().map(u => u.type).join(','), product: BuildingManager.getAll().find(b => b.type === 'weaponsmith')?.product }));
        check(kept.units === 'swordsman' && kept.product === 'sword', `desktop: save keeps the soldier and the smith's choice (${JSON.stringify(kept)})`);

        // An old v3 save with a blacksmith must still load: it is dropped and refunded
        const old = await page.evaluate(() => {
            const data = JSON.parse(localStorage.getItem(SAVE_KEY));
            data.version = 3;
            // back to a pre-military village: no smith crew, no soldiers
            const newer = data.buildings.filter(b => b.type === 'weaponsmith' || b.type === 'barracks');
            data.state.populationUsed -= newer.reduce((a, b) => a + (b.workers || 0), 0) + (data.units || []).length;
            data.units = undefined;
            data.buildings = data.buildings.filter(b => !newer.includes(b));
            const c = data.buildings.find(b => b.type === 'castle');
            data.buildings.push({ id: 999, type: 'blacksmith', tileX: c.tileX - 3, tileY: c.tileY, workers: 1, active: true, dayPlaced: 1, grown: true, paid: { wood: 30, stone: 20, iron: 10 } });
            data.state.populationUsed += 1;
            data.state.milestones = (data.state.milestones || []).concat('smith');
            data.state.weapons = undefined;
            Game.getState().gameOver = true; // keeps the page from overwriting the crafted save on unload
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
            return { count: data.buildings.length - 1, used: data.state.populationUsed - 1 };
        });
        await page.reload();
        await page.waitForTimeout(500);
        if (await page.isVisible('#continue-btn')) await page.click('#continue-btn');
        await page.waitForTimeout(400);
        const loaded = await page.evaluate(() => ({
            started: Game.getState().started,
            count: BuildingManager.getAll().length,
            smith: BuildingManager.getAll().some(b => b.type === 'blacksmith'),
            used: Game.getState().populationUsed,
            sword: Game.getState().weapons && Game.getState().weapons.sword,
        }));
        check(loaded.started && !loaded.smith && loaded.count === old.count && loaded.used === old.used && loaded.sword === 0,
            `desktop: old save with a blacksmith loads without it (${JSON.stringify(loaded)})`);
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
