const { chromium } = require('playwright');
const { URL, assert, out, seedRandom } = require('./helpers');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(seedRandom, 2024);
  await page.goto(URL);
  await page.click('#start-btn');
  await page.click('.building-btn[data-type="castle"]');
  // hover shows a ghost, click places
  const vp = await page.evaluate(() => Renderer.getViewport());
  const cx = vp.x + vp.w / 2, cy = vp.y + vp.h / 2;
  await page.mouse.move(cx, cy);
  const pv = await page.evaluate(() => UI.getPlacementPreview());
  assert(pv && pv.type === 'castle', 'hover shows castle ghost ' + JSON.stringify(pv));
  await page.mouse.click(cx, cy);
  const st = await page.evaluate(() => ({ n: BuildingManager.countByType('castle'), started: Game.getState().started, sel: !!UI.getPlacementPreview() }));
  assert(st.n === 1 && st.started, 'click placed castle and started the day timer');
  assert(!st.sel, 'castle (limit 1) deselects after placing');
  // space toggles pause and keeps speed
  await page.click('#speed-3x');
  await page.keyboard.press(' ');
  let gs = await page.evaluate(() => ({ p: Game.getState().paused, s: Game.getState().speed }));
  assert(gs.p && gs.s === 3, 'space pauses, speed 3x kept');
  await page.keyboard.press(' ');
  gs = await page.evaluate(() => ({ p: Game.getState().paused, s: Game.getState().speed, active: document.querySelector('.speed-btn.active').id }));
  assert(!gs.p && gs.s === 3 && gs.active === 'speed-3x', 'space resumes at 3x ' + JSON.stringify(gs));
  // wheel pans
  const c0 = await page.evaluate(() => Renderer.getCamera());
  await page.mouse.move(cx, cy); await page.mouse.wheel(0, 120); await page.waitForTimeout(100);
  const c1 = await page.evaluate(() => Renderer.getCamera());
  assert(c1.y - c0.y === 120, 'wheel scrolls the map ' + JSON.stringify({c0, c1}));
  assert(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  await browser.close();
})();
