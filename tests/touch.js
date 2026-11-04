// Touch gestures on a phone: pan the map, swipe the building menu, tap to place.
// Run: node tests/touch.js (GAME_URL=... to test another build)
const { chromium, devices } = require('playwright');
const { URL, assert, out, seedRandom } = require('./helpers');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.click('#start-btn');
  await page.evaluate(() => {
    Game.placeBuilding('castle', Math.floor(MAP_WIDTH / 2) - 2, Math.floor(MAP_HEIGHT / 2) - 2);
    Game.getState().resources.wood = 99; Game.getState().resources.stone = 99;
  });
  const cdp = await ctx.newCDPSession(page);

  async function touchDrag(x0, y0, x1, y1, steps = 8) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= steps; i++) {
      const x = x0 + (x1 - x0) * i / steps, y = y0 + (y1 - y0) * i / steps;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  const layout = await page.evaluate(() => {
    const m = document.getElementById('building-menu'); const r = m.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height, horizontal: r.width > r.height };
  });
  // a point on the map that no menu covers
  const mapX = layout.horizontal ? 200 : Math.min(200, layout.left - 30);
  const mapY = layout.horizontal ? Math.min(450, layout.top - 120) : 450;

  // 1) Pan the map with one finger
  const cam0 = await page.evaluate(() => Renderer.getCamera());
  await touchDrag(mapX, mapY, mapX - 90, mapY - 100);
  const cam1 = await page.evaluate(() => Renderer.getCamera());
  assert(Math.abs((cam1.x - cam0.x) - 90) <= 2 && Math.abs((cam1.y - cam0.y) - 100) <= 2,
    `one-finger drag pans the map (dx=${cam1.x - cam0.x}, dy=${cam1.y - cam0.y})`);
  const n1 = await page.evaluate(() => BuildingManager.getAll().length);
  assert(n1 === 1, `a drag does not place anything (buildings: ${n1})`);

  // 2) Swipe the building menu along its long axis (the old code blocked every touchmove)
  const before = await page.evaluate(() => { const m = document.getElementById('building-menu'); return { sl: m.scrollLeft, st: m.scrollTop }; });
  const cx = layout.left + layout.w / 2, cy = layout.top + layout.h / 2;
  if (layout.horizontal) await touchDrag(cx + 120, cy, cx - 120, cy, 12);
  else await touchDrag(cx, cy + 100, cx, cy - 100, 12);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => { const m = document.getElementById('building-menu'); return { sl: m.scrollLeft, st: m.scrollTop }; });
  assert(after.sl > before.sl + 50 || after.st > before.st + 50,
    `building menu scrolls by touch (scrollLeft ${before.sl}->${after.sl}, scrollTop ${before.st}->${after.st})`);

  // 3) Tap on the map with a building selected places it
  await page.evaluate(() => UI.selectBuilding('house'));
  const spot = await page.evaluate(() => {
    const cam = Renderer.getCamera(); const vp = Renderer.getViewport ? Renderer.getViewport() : { x: 0, y: 44, w: 170, h: 700 };
    for (let sy = vp.y + 40; sy < vp.y + vp.h - 40; sy += 16) for (let sx = vp.x + 40; sx < vp.x + vp.w - 40; sx += 16) {
      const tx = Math.round((sx + cam.x) / 32 - 1), ty = Math.round((sy + cam.y) / 32 - 1);
      if (Game.canPlace('house', tx, ty).ok) return { sx, sy };
    }
    return null;
  });
  if (spot) {
    await page.touchscreen.tap(spot.sx, spot.sy);
    await page.waitForTimeout(100);
    const afterTap = await page.evaluate(() => BuildingManager.countByType('house'));
    if (await page.$('#pb-confirm')) {
      assert(afterTap === 0, 'touch: a tap only positions the ghost');
      await page.waitForTimeout(400);
      await page.tap('#pb-confirm');
      const placed = await page.evaluate(() => BuildingManager.countByType('house'));
      assert(placed === 1, 'touch: Build confirms the house');
    } else console.log('info: (old version) tap placed houses:', afterTap);
  }

  console.log('page errors:', JSON.stringify(errors));
  await browser.close();
})();
