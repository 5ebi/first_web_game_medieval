// Point 3: core-loop feedback. Run: node tests/feedback.js
const { chromium, devices } = require('playwright');
const { URL, assert, out, seedRandom } = require('./helpers');

async function town(page) {
  return page.evaluate(() => {
    const cx = Math.floor(MAP_WIDTH / 2), cy = Math.floor(MAP_HEIGHT / 2);
    Game.placeBuilding('castle', cx - 2, cy - 2);
    const gs = Game.getState();
    gs.resources.wood = 200; gs.resources.stone = 200;
    const near = (type) => {
      for (let r = 2; r < 25; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (Game.canPlace(type, cx + dx, cy + dy).ok) { Game.placeBuilding(type, cx + dx, cy + dy); return true; }
      }
      return false;
    };
    const placed = ['lumberjack', 'quarry', 'chicken_hut', 'house'].map(near);
    gs.resources.wood = 97; gs.resources.stone = 40; gs.resources.food = 40;
    UI.updateResources();
    Renderer.centerOn(cx * 32, cy * 32);
    document.querySelectorAll('#notifications > *').forEach(n => n.remove());
    return placed;
  });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(seedRandom, 777);
  await page.goto(URL);
  await page.tap('#start-btn');
  const placed = await town(page);
  console.log('info: placed lumberjack/quarry/chicken/house:', JSON.stringify(placed));

  // Food runway: castle 10 + house 5 = 15 eaten, chickens +4 -> -11/day, 40 food -> 3 days
  let st = await page.evaluate(() => ({ rate: document.getElementById('rate-food').textContent, alert: document.querySelector('[data-res="food"]').classList.contains('alert') }));
  assert(st.rate === '-11 · 3d', `food shows net rate and runway: "${st.rate}"`);

  // Day progress bar follows the clock
  await page.evaluate(() => { Game.getState().dayProgress = 0.5; });
  await page.waitForTimeout(100);
  st = await page.evaluate(() => document.getElementById('day-fill').style.transform);
  assert(parseFloat(st.slice(7)) === 0.5, `day progress bar at half a day: ${st}`);

  // Day tick: wood 97 + 6 caps at 100 -> wood chip full, floater says +3 (wasted), food floater on castle
  await page.evaluate(() => { Game.getState().dayProgress = 0.999; });
  await page.waitForTimeout(150);
  await page.waitForTimeout(450); // mid-animation
  await page.screenshot({ path: out(`phone-tick.png`) });
  st = await page.evaluate(() => {
    const chip = document.querySelector('[data-res="wood"]');
    return {
      day: Game.getState().day, wood: Game.getState().resources.wood,
      full: chip.classList.contains('full'), rate: document.getElementById('rate-wood').textContent,
      notes: [...document.querySelectorAll('.notification')].map(n => n.textContent),
      fill: document.getElementById('fill-wood').style.transform,
    };
  });
  assert(st.day === 2 && st.wood === 100, `day 2, wood capped at 100 (${st.wood})`);
  assert(st.full && st.rate === '+6 · full' && parseFloat(st.fill.slice(7)) === 1, `wood chip shows full storage: "${st.rate}" ${st.fill}`);
  assert(st.notes.some(n => n.startsWith('Wood storage is full!')), 'one-time warning about wasted wood: ' + JSON.stringify(st.notes));

  // Tap the food chip -> detail tooltip
  await page.tap('[data-res="food"]');
  st = await page.evaluate(() => ({ t: document.getElementById('tooltip').textContent, hidden: document.getElementById('tooltip').classList.contains('hidden') }));
  assert(!st.hidden && st.t.includes('eaten a day') && st.t.includes('lasts'), `food detail: "${st.t}"`);
  await page.waitForTimeout(100);
  await page.screenshot({ path: out(`phone-detail.png`) });

  assert(errors.length === 0, 'no page errors ' + JSON.stringify(errors));

  // Desktop look
  const d = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await d.addInitScript(seedRandom, 777);
  await d.goto(URL);
  await d.click('#start-btn');
  await town(d);
  await d.evaluate(() => { Game.getState().dayProgress = 0.999; });
  await d.waitForTimeout(600);
  await d.screenshot({ path: out(`desktop-tick.png`) });
  await browser.close();
})();
