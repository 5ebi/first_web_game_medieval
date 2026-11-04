// End-to-end on a phone, using only taps (plus fast-forwarding game time).
const { chromium, devices } = require('playwright');
const { URL, assert, out, seedRandom } = require('./helpers');
const settle = (page) => page.waitForTimeout(450);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(seedRandom, 31337);
  await page.goto(URL);
  await page.tap('#start-btn'); await settle(page);

  // Castle
  await page.tap('.building-btn[data-type="castle"]'); await settle(page);
  await page.tap('#pb-confirm'); await settle(page);
  // Orchard (cheap food) and a lumberjack
  for (const type of ['apple_orchard', 'lumberjack']) {
    await page.evaluate(t => document.querySelector(`.building-btn[data-type="${t}"]`).scrollIntoView({ inline: 'center' }), type);
    await settle(page);
    await page.tap(`.building-btn[data-type="${type}"]`); await settle(page);
    const ok = await page.evaluate(() => !document.getElementById('pb-confirm').disabled);
    if (ok) { await page.tap('#pb-confirm'); await settle(page); }
    await page.tap('#pb-cancel').catch(() => {}); await settle(page);
  }
  let st = await page.evaluate(() => BuildingManager.getAll().map(b => b.type));
  assert(st.includes('castle') && st.includes('apple_orchard') && st.includes('lumberjack'), 'built castle, orchard, lumberjack by tapping: ' + st.join(','));

  // 3x speed, let three days pass
  await page.tap('#speed-3x');
  await page.evaluate(() => { for (let i = 0; i < 3 * 80; i++) Game.update(250); });
  st = await page.evaluate(() => ({ day: Game.getState().day, wood: Game.getState().resources.wood }));
  assert(st.day === 4, `three days passed at 3x (day ${st.day}, wood ${st.wood})`);
  await page.screenshot({ path: out('e2e-phone-day4.png') });

  // App switch + reload: progress survives
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.reload(); await settle(page);
  const cont = await page.textContent('#continue-btn');
  await page.screenshot({ path: out('e2e-phone-continue.png') });
  assert(cont.includes('Day 4'), `after reload: "${cont}"`);
  await page.tap('#continue-btn'); await settle(page);
  st = await page.evaluate(() => ({ n: BuildingManager.getAll().length, speed: Game.getState().speed, day: Game.getState().day }));
  assert(st.n === 3 && st.speed === 3 && st.day === 4, 'settlement, speed and day restored ' + JSON.stringify(st));
  assert(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  await browser.close();
})();
