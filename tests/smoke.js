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

// Lumberjack price: 10 wood, free only with no lumberjack and not enough wood (issue #9)
function lumberjackPrice() {
    const near = (type, cx, cy, r = 25) => {
        for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
            if (Game.canPlace(type, cx + dx, cy + dy).ok) return { b: Game.placeBuilding(type, cx + dx, cy + dy), x: cx + dx, y: cy + dy };
        }
        return null;
    };
    const spot = (cx, cy, r = 25) => {
        for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
            if (GameMap.isBuildable(cx + dx, cy + dy, 2, 2, BuildingManager.getAll()) &&
                GameMap.hasNearbyResource(cx + dx, cy + dy, 2, 2, 'FOREST')) return [cx + dx, cy + dy];
        }
        return null;
    };
    const r = {};
    const cx = Math.floor(MAP_WIDTH / 2) - 2, cy = Math.floor(MAP_HEIGHT / 2) - 2;
    UI.deselectBuilding(true);
    near('castle', cx, cy);
    near('warehouse', cx + 5, cy + 1);
    const s = Game.getState();
    r.startWood = s.resources.wood;
    r.startCost = Game.getCost('lumberjack').wood;
    const card = () => { UI.updateBuildingButtons(); return document.querySelector('.cp-bld[data-type="lumberjack"] .b-cost').textContent.trim(); };
    r.cardStart = card();
    s.resources.wood = 0;
    const [x, y] = spot(cx, cy + 4);
    r.emergencyCost = Game.getCost('lumberjack').wood;
    r.emergencyOk = Game.canPlace('lumberjack', x, y).ok;
    r.cardEmergency = card();
    const first = Game.placeBuilding('lumberjack', x, y);
    r.woodAfterFirst = s.resources.wood;
    r.firstPaid = first && first.paid.wood;
    r.secondCost = Game.getCost('lumberjack').wood;
    r.cardSecond = card();
    const [x2, y2] = spot(cx, cy + 4);
    r.secondOk = Game.canPlace('lumberjack', x2, y2).ok;
    // an emergency lumberjack refunds nothing
    Game.demolishBuilding(first.id);
    r.woodAfterDemolish = s.resources.wood;
    // no lumberjack, but enough wood: normal price
    s.resources.wood = 40;
    r.richCost = Game.getCost('lumberjack').wood;
    // a lumberjack from an old save (no `paid`) loads as one that cost nothing
    const saved = BuildingManager.serialize().concat([{ id: 999, type: 'lumberjack', tileX: x, tileY: y, workers: 2, active: true }]);
    BuildingManager.deserialize(saved);
    r.oldSavePaid = BuildingManager.getById(999)?.paid?.wood;
    return r;
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

// A second soldier next to the first one (through the game API)
function recruitSecond() {
    const s = Game.getState();
    const bar = BuildingManager.getAll().find(b => b.type === 'barracks');
    s.weapons.sword += 1;
    if (Game.getFreeWorkers() < 1) s.populationCap += 2;
    const u = Game.recruit(bar.id, 'swordsman');
    return { ok: !!u, n: Units.getAll().length };
}

// Screen points around both soldiers (for a box drag) and on each soldier
function soldierScreen() {
    Renderer.setZoom(2);
    const us = Units.getAll();
    const cx = us.reduce((a, u) => a + u.x, 0) / us.length, cy = us.reduce((a, u) => a + u.y, 0) / us.length;
    Renderer.centerOn(cx, cy - 10);
    const xs = us.map(u => u.x), ys = us.map(u => u.y);
    return {
        a: Renderer.worldToScreen(Math.min(...xs) - 14, Math.min(...ys) - 30),
        b: Renderer.worldToScreen(Math.max(...xs) + 14, Math.max(...ys) + 8),
        on: us.map(u => Renderer.worldToScreen(u.x, u.y - 10)),
    };
}

// A target across the castle: the straight line is blocked, the path must go around
function targetBehindCastle() {
    Renderer.setZoom(1);
    const c = BuildingManager.getAll().find(b => b.type === 'castle');
    const us = Units.getAll();
    const below = us[0].y > c.pixelY + c.height / 2;
    const w = { x: c.pixelX + c.width / 2, y: below ? c.pixelY - 24 : c.pixelY + c.height + 24 };
    Renderer.centerOn(w.x, (w.y + us[0].y) / 2);
    window.__target = w;
    return Renderer.worldToScreen(w.x, w.y);
}

// Runs the soldiers for `sec` game seconds; reports whether one ever stood on water or a building
function walkUnits(sec) {
    let bad = 0;
    for (let tt = 0; tt < sec; tt += 0.1) {
        Units.update(0.1);
        Units.getAll().forEach(u => {
            const tx = Math.floor(u.x / TILE_SIZE), ty = Math.floor((u.y - 1) / TILE_SIZE);
            if (GameMap.getTerrain(tx, ty) === TERRAIN.WATER) bad++;
            const b = BuildingManager.getBuildingAt(tx, ty);
            if (b && b.type !== 'barracks') bad++; // they start at the barracks' edge
        });
    }
    const w = window.__target;
    return { bad, states: Units.getAll().map(u => u.state), far: Math.max(...Units.getAll().map(u => Math.hypot(u.x - w.x, u.y - w.y))) };
}

// Touch drag through CDP (Playwright's touchscreen can only tap)
async function touchDrag(cdp, page, from, to, holdMs = 0) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
    if (holdMs) await page.waitForTimeout(holdMs);
    for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8 }] });
        await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
}

async function soldierControl(page, ctx, name, touch) {
    const second = await page.evaluate(recruitSecond);
    check(second.ok && second.n === 2, `${name}: second soldier recruited (${second.n})`);
    await page.evaluate(() => UI.hideInfo());
    const nSel = () => page.evaluate(() => Units.getSelected().length);

    if (!touch) {
        // box select with a left drag
        let sp = await page.evaluate(soldierScreen);
        await page.waitForTimeout(150);
        await page.mouse.move(sp.a.x, sp.a.y);
        await page.mouse.down();
        await page.mouse.move((sp.a.x + sp.b.x) / 2, (sp.a.y + sp.b.y) / 2, { steps: 4 });
        await page.mouse.move(sp.b.x, sp.b.y, { steps: 4 });
        await page.screenshot({ path: path.join(OUT, `${name}-box.png`) });
        await page.mouse.up();
        await page.waitForTimeout(200);
        const boxed = await page.evaluate(() => ({ n: Units.getSelected().length, title: document.getElementById('info-title').textContent, btns: document.querySelectorAll('#info-controls [data-order]').length }));
        check(boxed.n === 2 && boxed.btns >= 4, `${name}: box selects both soldiers, selection bar with orders (${JSON.stringify(boxed)})`);

        // click one, shift-click the other, Escape, double click
        await page.mouse.click(sp.on[0].x, sp.on[0].y);
        await page.waitForTimeout(450);
        const one = await nSel();
        await page.keyboard.down('Shift');
        await page.mouse.click(sp.on[1].x, sp.on[1].y);
        await page.keyboard.up('Shift');
        await page.waitForTimeout(100);
        const two = await nSel();
        await page.keyboard.press('Escape');
        const none = await nSel();
        await page.mouse.dblclick(sp.on[0].x, sp.on[0].y);
        await page.waitForTimeout(100);
        const all = await nSel();
        check(one === 1 && two === 2 && none === 0 && all === 2, `${name}: click ${one}, shift-click ${two}, Esc ${none}, double click ${all}`);

        // right click behind the castle: they walk around it and arrive
        const tgt = await page.evaluate(targetBehindCastle);
        await page.waitForTimeout(150);
        await page.mouse.click(tgt.x, tgt.y, { button: 'right' });
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, `${name}-move.png`) });
        const moving = await page.evaluate(() => Units.getAll().map(u => u.state));
        const walked = await page.evaluate(walkUnits, 90);
        check(moving.every(st => st === 'move'), `${name}: right click sends the selection (${moving})`);
        check(walked.states.every(st => st === 'idle') && walked.far < 30 && walked.bad === 0,
            `${name}: soldiers walk around the castle and arrive (${JSON.stringify(walked)})`);

        // right drag still pans the map
        const cam0 = await page.evaluate(() => ({ ...Renderer.getCamera() }));
        await page.mouse.move(700, 400);
        await page.mouse.down({ button: 'right' });
        await page.mouse.move(600, 350, { steps: 5 });
        await page.mouse.up({ button: 'right' });
        const cam1 = await page.evaluate(() => ({ ...Renderer.getCamera() }));
        check(Math.abs(cam1.x - cam0.x) > 40 && (await nSel()) === 2, `${name}: right drag pans and keeps the selection (dx ${Math.round(cam1.x - cam0.x)})`);

        // patrol: P, then click a point; they turn around at the far end
        const ptgt = await page.evaluate(() => {
            const u = Units.getAll()[0];
            const w = { x: u.x + 96, y: u.y };
            Renderer.centerOn(u.x + 48, u.y);
            window.__target = w;
            return Renderer.worldToScreen(w.x, w.y);
        });
        await page.waitForTimeout(150);
        await page.keyboard.press('p');
        const mode = await page.evaluate(() => UI.getOrderMode());
        await page.mouse.click(ptgt.x, ptgt.y);
        await page.waitForTimeout(150);
        const pat = await page.evaluate(() => {
            const u = Units.getAll()[0];
            const st0 = Units.getAll().map(x => x.state);
            let turned = false;
            for (let i = 0; i < 400 && !turned; i++) { Units.update(0.1); if (u.patrol && u.patrol.i === 0) turned = true; }
            return { st0, turned, pts: u.patrol && u.patrol.pts.length };
        });
        check(mode === 'patrol' && pat.st0.every(st => st === 'patrol') && pat.turned && pat.pts === 2,
            `${name}: patrol between two points turns around (${JSON.stringify({ mode, ...pat })})`);
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, `${name}-patrol.png`) });
    } else {
        const cdp = await ctx.newCDPSession(page);
        // one-finger pan without a selection
        const cam0 = await page.evaluate(() => { Renderer.setZoom(1); return { ...Renderer.getCamera() }; });
        const vp = page.viewportSize();
        const mid = { x: vp.width / 2, y: vp.height * 0.35 };
        await touchDrag(cdp, page, mid, { x: mid.x - 60, y: mid.y - 30 });
        const cam1 = await page.evaluate(() => ({ ...Renderer.getCamera() }));
        check(Math.abs(cam1.x - cam0.x) > 30 && (await nSel()) === 0, `${name}: one-finger drag pans the map (dx ${Math.round(cam1.x - cam0.x)})`);

        // tap a soldier, then tap the map: he walks there
        let sp = await page.evaluate(soldierScreen);
        await page.waitForTimeout(150);
        await page.touchscreen.tap(sp.on[0].x, sp.on[0].y);
        await page.waitForTimeout(450);
        const one = await nSel();
        const panelOk = await page.evaluate(() => {
            const r = document.querySelector('#info-controls [data-order="move"]')?.getBoundingClientRect();
            return !!r && r.width > 0 && r.bottom <= window.innerHeight;
        });
        await page.screenshot({ path: path.join(OUT, `${name}-select.png`) });
        const dest = { x: sp.on[0].x - 70, y: sp.on[0].y - 10 };
        await page.touchscreen.tap(dest.x, dest.y);
        await page.waitForTimeout(150);
        const st = await page.evaluate(() => Units.getSelected().map(u => u.state));
        check(one === 1 && panelOk && st.length === 1 && st[0] === 'move', `${name}: tap selects (${one}), order buttons visible (${panelOk}), tap on the map moves (${st})`);
        // one-finger pan still works with a selection, without giving an order
        await page.evaluate(() => { for (let i = 0; i < 100; i++) Units.update(0.1); });
        const cam2 = await page.evaluate(() => ({ ...Renderer.getCamera() }));
        await touchDrag(cdp, page, mid, { x: mid.x + 120, y: mid.y });
        const after = await page.evaluate(() => ({ cam: { ...Renderer.getCamera() }, st: Units.getSelected().map(u => u.state) }));
        check(Math.abs(after.cam.x - cam2.x) > 30 && after.st[0] === 'idle', `${name}: drag with a selection pans, no order (${after.st})`);
        // Deselect button
        await press(page, true, '#info-controls [data-order="deselect"]');
        const none = await nSel();
        // long press + drag draws a box around both
        sp = await page.evaluate(soldierScreen);
        await page.waitForTimeout(150);
        await touchDrag(cdp, page, sp.a, sp.b, 550);
        const boxed = await nSel();
        check(none === 0 && boxed === 2, `${name}: Deselect clears (${none}), long press + drag box selects both (${boxed})`);
        await page.screenshot({ path: path.join(OUT, `${name}-boxed.png`) });
        // Patrol button, then tap
        await press(page, true, '#info-controls [data-order="patrol"]');
        const ptgt = await page.evaluate(() => { const u = Units.getAll()[0]; Renderer.centerOn(u.x + 30, u.y - 10); return Renderer.worldToScreen(u.x + 60, u.y); });
        await page.waitForTimeout(150);
        await page.touchscreen.tap(ptgt.x, ptgt.y);
        await page.waitForTimeout(150);
        const pst = await page.evaluate(() => Units.getAll().map(u => u.state));
        check(pst.every(x => x === 'patrol'), `${name}: Patrol button + tap starts a patrol (${pst})`);
        await page.evaluate(() => Renderer.setZoom(1));
    }
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

    if (name === 'desktop') {
        const p = await page.evaluate(lumberjackPrice);
        const free = await page.evaluate(() => t('free'));
        check(p.startWood >= 10 && p.startCost === 10 && p.cardStart !== free, `desktop: first lumberjack after the warehouse costs 10 wood (${p.startCost}, card "${p.cardStart}")`);
        check(p.emergencyCost === 0 && p.emergencyOk && p.cardEmergency === free, `desktop: no lumberjack and no wood -> free (cost ${p.emergencyCost}, ok ${p.emergencyOk}, card "${p.cardEmergency}")`);
        check(p.woodAfterFirst === 0 && p.firstPaid === 0, `desktop: emergency lumberjack takes no wood (wood ${p.woodAfterFirst}, paid ${p.firstPaid})`);
        check(p.secondCost === 10 && !p.secondOk && p.cardSecond !== free, `desktop: second lumberjack costs 10 wood and fails with 0 wood (cost ${p.secondCost}, ok ${p.secondOk})`);
        check(p.woodAfterDemolish === 0, `desktop: emergency lumberjack refunds nothing (wood ${p.woodAfterDemolish})`);
        check(p.richCost === 10, `desktop: no lumberjack but 40 wood -> costs 10 (${p.richCost})`);
        check(p.oldSavePaid === 0, `desktop: old-save lumberjack refunds nothing (paid ${p.oldSavePaid})`);
        await page.reload();
        await page.waitForTimeout(400);
        await page.click('#start-btn');
        await page.waitForTimeout(400);
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

    // ---- soldiers: select, move, patrol (issue #16) ----
    await soldierControl(page, ctx, name, touch);

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
        check(kept.units === 'swordsman,swordsman' && kept.product === 'sword', `desktop: save keeps the soldiers and the smith's choice (${JSON.stringify(kept)})`);
        const patrol = await page.evaluate(() => {
            const before = Units.getAll().map(u => u.patrol && u.patrol.pts.length);
            for (let i = 0; i < 20; i++) Units.update(0.1);
            return { states: Units.getAll().map(u => u.state), pts: before, moved: Units.getAll().every(u => u.path || u.state !== 'patrol') };
        });
        check(patrol.states.every(x => x === 'patrol') && patrol.pts.every(n => n === 2) && patrol.moved, `desktop: save keeps the patrol (${JSON.stringify(patrol)})`);

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
