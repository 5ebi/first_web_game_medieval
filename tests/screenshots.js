// Screenshots on several devices into tests/out. Run: node tests/screenshots.js [welcome|town|info ...]
const { chromium, devices } = require('playwright');
const { URL, assert, out, seedRandom } = require('./helpers');
const scenes = process.argv.slice(2);
const want = s => scenes.length === 0 || scenes.includes(s);

const targets = [
  { name: 'desktop', opts: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
  { name: 'iphone', opts: { ...devices['iPhone 13'] } },
  { name: 'landscape', opts: { ...devices['iPhone 13 landscape'] } },
  { name: 'small', opts: { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];

async function setupTown(page) {
  await page.evaluate(() => {
    const cx = Math.floor(MAP_WIDTH / 2), cy = Math.floor(MAP_HEIGHT / 2);
    Game.placeBuilding('castle', cx - 2, cy - 2);
    const gs = Game.getState();
    gs.resources.wood = 200; gs.resources.stone = 200;
    const tryNear = (type) => {
      for (let r = 2; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Game.canPlace(type, cx + dx, cy + dy).ok) { Game.placeBuilding(type, cx + dx, cy + dy); return true; }
      }
      return false;
    };
    ['house', 'apple_orchard', 'chicken_hut', 'lumberjack', 'warehouse'].forEach(tryNear);
    gs.resources.wood = 87; gs.resources.stone = 42; gs.resources.iron = 3;
    gs.dayProgress = 0.45;
    UI.updateResources();
    Renderer.centerOn(cx * 32, cy * 32);
    document.querySelectorAll('#notifications > *').forEach(n => n.remove());
  });
}

(async () => {
  const browser = await chromium.launch();
  for (const t of targets) {
    const ctx = await browser.newContext(t.opts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(URL);
    await page.waitForTimeout(300);
    if (want('welcome')) await page.screenshot({ path: out(`${t.name}-welcome.png`) });
    await page.click('#start-btn');
    await setupTown(page);
    await page.waitForTimeout(200);
    if (want('town')) await page.screenshot({ path: out(`${t.name}-town.png`) });
    if (want('info')) {
      // tap on the castle to open the info panel
      const pt = await page.evaluate(() => {
        const b = BuildingManager.getAll()[0]; const cam = Renderer.getCamera();
        return { x: b.pixelX + b.width / 2 - cam.x, y: b.pixelY + b.height / 2 - cam.y };
      });
      if (t.opts.hasTouch) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(150);
      await page.screenshot({ path: out(`${t.name}-info.png`) });
    }
    console.log(t.name, errors.length ? 'ERRORS: ' + JSON.stringify(errors) : 'no errors');
    if (errors.length) process.exitCode = 1;
    await ctx.close();
  }
  await browser.close();
})();
