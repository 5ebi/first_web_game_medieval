// Performance regressions:
//  1) background tab: time must not catch up after the tab was hidden (fake clock)
//  2) JS time per frame: idle frames are skipped, forced redraws reported
// Note: headless Chromium renders in software; absolute numbers are not phone numbers.
const { chromium } = require('playwright');
const { URL, assert, out, seedRandom } = require('./helpers');

(async () => {
  const browser = await chromium.launch();

  // ---- 1) Background tab: lid closed for 10 minutes ----
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.clock.install();
    await page.goto(URL);
    await page.click('#start-btn');
    await page.evaluate(() => {
      Game.placeBuilding('castle', 38, 28);
    });
    await page.clock.runFor(2000);
    const before = await page.evaluate(() => ({ day: Game.getState().day, food: Game.getState().resources.food, over: Game.getState().gameOver }));
    await page.clock.fastForward('10:00'); // tab hidden / phone locked for 10 min
    await page.clock.runFor(100);
    const after = await page.evaluate(() => ({ day: Game.getState().day, food: Game.getState().resources.food, over: Game.getState().gameOver }));
    console.log('background 10min  before:', JSON.stringify(before), ' after:', JSON.stringify(after));
    assert(after.day === before.day && !after.over, 'no catch-up after 10 minutes in the background');
    await page.close();
  }

  // ---- 2) Render cost per frame ----
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(URL);
    await page.click('#start-btn');
    const r = await page.evaluate(() => {
      Game.placeBuilding('castle', 38, 28);
      // find camera position with most trees visible
      const trees = GameMap.getTrees();
      let best = { n: -1 };
      for (let cy = 0; cy < MAP_PIXEL_H - 800; cy += 160) for (let cx = 0; cx < MAP_PIXEL_W - 1280; cx += 160) {
        let n = 0; for (const t of trees) if (t.x > cx && t.x < cx + 1280 && t.y > cy && t.y < cy + 800) n++;
        if (n > best.n) best = { n, cx, cy };
      }
      const measure = (label) => {
        for (let i = 0; i < 30; i++) Renderer.render(null); // warmup
        const N = 300; const t0 = performance.now();
        for (let i = 0; i < N; i++) { if (window.__force) Renderer.markDirty && Renderer.markDirty(); Renderer.render(null); }
        return { label, msPerFrame: +((performance.now() - t0) / N).toFixed(3) };
      };
      const out = [];
      out.push(measure('center idle (no change)')); window.__force = true; out.push(measure('center forced redraw')); window.__force = false;
      Renderer.setCamera(best.cx, best.cy);
      window.__force = true; out.push({ ...measure('forest-dense forced redraw'), visibleTrees: best.n });
      out.push({ totalTrees: trees.length, totalStones: GameMap.getStones().length });
      return out;
    });
    console.log('render cost:', JSON.stringify(r));
    assert(r[0].msPerFrame < 0.2, `idle frames are skipped (${r[0].msPerFrame} ms per frame)`);
    await page.close();
  }
  await browser.close();
})();
