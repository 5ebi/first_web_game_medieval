// Point 4: placement clarity (touch flow + desktop tooltip). Run: node tests/placement.js
const { chromium, devices } = require('playwright');
const { URL, assert, out, seedRandom } = require('./helpers');

(async () => {
  const browser = await chromium.launch();

  // ---------- Phone ----------
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(seedRandom, 4242);
    await page.goto(URL);
    await page.tap('#start-btn');

    // Before the castle: tapping House explains instead of selecting
    await page.evaluate(() => document.getElementById('building-menu').scrollLeft = 0);
    await page.tap('.building-btn[data-type="house"]', { force: true });
    let st = await page.evaluate(() => ({ sel: !!UI.getPlacementPreview(), tip: document.getElementById('tooltip').textContent, tipHidden: document.getElementById('tooltip').classList.contains('hidden') }));
    assert(!st.sel && !st.tipHidden && st.tip === 'Build your Castle first', `locked card explains itself: "${st.tip}"`);

    // Castle: ghost appears on a valid spot immediately, Build enabled
    await page.tap('.building-btn[data-type="castle"]');
    st = await page.evaluate(() => ({ pv: UI.getPlacementPreview(), bar: !document.getElementById('placement-bar').classList.contains('hidden'), btn: !document.getElementById('pb-confirm').disabled }));
    assert(st.pv && st.pv.valid && st.bar && st.btn, 'touch: castle ghost auto-placed on a valid spot, Build enabled');
    await page.tap('#pb-confirm');
    st = await page.evaluate(() => ({ n: BuildingManager.countByType('castle'), bar: document.getElementById('placement-bar').classList.contains('hidden') }));
    assert(st.n === 1 && st.bar, 'Build places the castle and closes the bar (limit 1)');
    await page.evaluate(() => { const gs = Game.getState(); gs.resources.wood = 60; gs.resources.stone = 5; UI.updateResources(); });

    // Short resources are red on the card
    st = await page.evaluate(() => {
      const c = document.querySelector('.building-btn[data-type="house"] .cost[data-res="stone"]');
      return { short: c.classList.contains('short'), disabled: document.querySelector('.building-btn[data-type="house"]').classList.contains('disabled') };
    });
    assert(st.short && st.disabled, 'house card: missing stone shown red, card disabled');
    await page.tap('.building-btn[data-type="house"]', { force: true });
    st = await page.evaluate(() => document.getElementById('tooltip').textContent);
    assert(st === 'Need 5 more stone', `tap on disabled house: "${st}"`);

    // Lumberjack: range + tiles drawn, tap on water moves ghost and explains
    await page.tap('.building-btn[data-type="lumberjack"]');
    const lj = await page.evaluate(() => UI.getPlacementPreview());
    assert(lj && lj.valid, 'lumberjack ghost starts on a valid spot near trees');
    await page.waitForTimeout(150);
    await page.screenshot({ path: out(`phone-lumberjack.png`) });

    // find a water / forest tile on screen and tap it
    const targets = await page.evaluate(() => {
      const cam = Renderer.getCamera(); const vp = Renderer.getViewport(); const out = {};
      for (let sy = vp.y + 30; sy < vp.y + vp.h - 30 && !out.forest; sy += 8) for (let sx = vp.x + 30; sx < vp.x + vp.w - 30; sx += 8) {
        const a = Math.round((sx + cam.x) / 32 - 1), b = Math.round((sy + cam.y) / 32 - 1);
        if (Game.canPlace('lumberjack', a, b).reason === 'Trees are in the way') { out.forest = { sx, sy }; break; }
      }
      return out;
    });
    if (targets.forest) {
      const cam0 = await page.evaluate(() => Renderer.getCamera());
      await page.touchscreen.tap(targets.forest.sx, targets.forest.sy);
      st = await page.evaluate(() => ({ pv: UI.getPlacementPreview(), hint: document.getElementById('pb-hint').textContent, dis: document.getElementById('pb-confirm').disabled, n: BuildingManager.countByType('lumberjack'), cam: Renderer.getCamera() }));
      assert(st.pv && !st.pv.valid && st.hint === 'Trees are in the way' && st.dis && st.n === 0, `tap on forest moves ghost, explains "${st.hint}", Build disabled, nothing built`);
      assert(st.cam.x === cam0.x && st.cam.y === cam0.y, 'tap does not move the camera');
      await page.screenshot({ path: out(`phone-invalid.png`) });
    } else console.log('info: no forest on screen for this seed');

    // Drag the ghost (not the map)
    const g = await page.evaluate(() => { const pv = UI.getPlacementPreview(); const cam = Renderer.getCamera(); return { sx: pv.tileX * 32 + 32 - cam.x, sy: pv.tileY * 32 + 32 - cam.y, tx: pv.tileX, ty: pv.tileY, cam }; });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: g.sx, y: g.sy }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: g.sx + i * 8, y: g.sy + i * 8 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    st = await page.evaluate(() => ({ pv: UI.getPlacementPreview(), cam: Renderer.getCamera() }));
    assert(st.pv.tileX === g.tx + 2 && st.pv.tileY === g.ty + 2 && st.cam.x === g.cam.x && st.cam.y === g.cam.y,
      `dragging the ghost moves it by 2 tiles (${g.tx},${g.ty} -> ${st.pv.tileX},${st.pv.tileY}), map stays`);

    // Cancel
    const hit = await page.evaluate(() => { const r = document.getElementById('pb-cancel').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { r: [r.left, r.top, r.width, r.height], hit: el && (el.id || el.className) }; });
    await page.evaluate(() => { window.__ev = []; ['pointerdown','pointerup','click','touchstart','touchend','mousedown'].forEach(t => document.addEventListener(t, e => window.__ev.push(t + ':' + (e.target.id || e.target.tagName) + (e.pointerId !== undefined ? '#' + e.pointerId : '')), true)); });
    await page.waitForTimeout(800);
    await page.tap('#pb-cancel');
    st = await page.evaluate(() => ({ pv: UI.getPlacementPreview(), bar: document.getElementById('placement-bar').classList.contains('hidden') }));
    assert(!st.pv && st.bar, '✕ cancels placement');
    assert(errors.length === 0, 'phone: no page errors ' + JSON.stringify(errors));
    await ctx.close();
  }

  // ---------- Desktop ----------
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    await page.click('#start-btn');
    await page.evaluate(() => { Game.placeBuilding('castle', Math.floor(MAP_WIDTH / 2) - 2, Math.floor(MAP_HEIGHT / 2) - 2); });
    await page.click('.building-btn[data-type="quarry"]');
    const vp = await page.evaluate(() => Renderer.getViewport());
    // hover over the castle -> occupied
    const castle = await page.evaluate(() => { const b = BuildingManager.getAll()[0]; const cam = Renderer.getCamera(); return { x: b.pixelX + 64 - cam.x, y: b.pixelY + 64 - cam.y }; });
    await page.mouse.move(castle.x, castle.y);
    let st = await page.evaluate(() => ({ tip: document.getElementById('tooltip').textContent, hidden: document.getElementById('tooltip').classList.contains('hidden'), hint: document.getElementById('pb-hint').textContent, build: !document.getElementById('pb-confirm').classList.contains('hidden') }));
    assert(!st.hidden && st.tip === 'Another building is in the way', `desktop: reason follows the cursor: "${st.tip}"`);
    assert(!st.build, 'desktop: no Build button (click places directly)');
    // find a spot that is free but too far from stone
    const far = await page.evaluate(() => {
      const cam = Renderer.getCamera(); const vp = Renderer.getViewport();
      for (let sy = vp.y + 40; sy < vp.y + vp.h - 40; sy += 16) for (let sx = vp.x + 40; sx < vp.x + vp.w - 40; sx += 16) {
        const tx = Math.round((sx + cam.x) / 32 - 1), ty = Math.round((sy + cam.y) / 32 - 1);
        const r = Game.canPlace('quarry', tx, ty);
        if (!r.ok && r.reason.startsWith('Must be within')) return { sx, sy, reason: r.reason };
      }
      return null;
    });
    if (far) {
      await page.mouse.move(far.sx, far.sy);
      await page.waitForTimeout(100);
      st = await page.evaluate(() => document.getElementById('tooltip').textContent);
      assert(st === 'Must be within 5 tiles of stone deposits', `desktop: proximity reason "${st}"`);
      await page.screenshot({ path: out(`desktop-far.png`) });
    }
    assert(errors.length === 0, 'desktop: no page errors ' + JSON.stringify(errors));
  }
  await browser.close();
})();
