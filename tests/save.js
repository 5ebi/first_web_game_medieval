// Point 1: save / continue / new game
const { chromium } = require('playwright');
const { URL, assert, out, seedRandom } = require('./helpers');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(URL);
  assert(await page.isHidden('#continue-btn'), 'no save -> continue hidden');
  await page.click('#start-btn');
  const placed = await page.evaluate(() => {
    const c = Math.floor(MAP_WIDTH / 2) - 2, r = Math.floor(MAP_HEIGHT / 2) - 2;
    Game.placeBuilding('castle', c, r);
    Game.getState().resources.wood = 99;
    // find a spot for an orchard
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
      if (Game.canPlace('apple_orchard', x, y).ok) { Game.placeBuilding('apple_orchard', x, y); return { seed: GameMap.getSeed(), n: BuildingManager.getAll().length }; }
    }
    return null;
  });
  assert(placed && placed.n === 2, 'castle + orchard placed');
  // advance two days quickly
  await page.evaluate(() => { const gs = Game.getState(); Game.update(60000 * 2 + 1000); });
  const st1 = await page.evaluate(() => ({ day: Game.getState().day, food: Game.getState().resources.food, grow: BuildingManager.getAll()[1].growthProgress, raw: localStorage.getItem('lordsOfTheKeep.save') }));
  assert(st1.raw && JSON.parse(st1.raw).game.day === st1.day, `autosave after day tick (day ${st1.day})`);

  await page.reload();
  const cont = await page.textContent('#continue-btn');
  assert(await page.isVisible('#continue-btn') && cont.includes(`Day ${st1.day}`), `continue visible: "${cont}"`);
  assert((await page.textContent('#start-btn')) === 'New Game', 'start button became "New Game"');
  await page.click('#continue-btn');
  const st2 = await page.evaluate(() => ({ seed: GameMap.getSeed(), day: Game.getState().day, n: BuildingManager.getAll().length, food: Game.getState().resources.food, grow: BuildingManager.getAll()[1]?.growthProgress, cap: Game.getState().populationCap, used: Game.getState().populationUsed, started: Game.getState().started }));
  assert(st2.seed === placed.seed && st2.day === st1.day && st2.n === 2 && st2.food === st1.food && st2.grow === st1.grow, 'state restored ' + JSON.stringify(st2));
  assert(st2.cap === 10 && st2.used === 1 && st2.started, 'derived state recalculated');

  // New game needs two taps
  await page.reload();
  await page.click('#start-btn');
  assert(await page.isVisible('#welcome-screen'), 'first tap on New Game only asks for confirmation');
  await page.click('#start-btn');
  assert(await page.isHidden('#welcome-screen'), 'second tap starts a new game');
  const st3 = await page.evaluate(() => ({ n: BuildingManager.getAll().length, raw: localStorage.getItem('lordsOfTheKeep.save') }));
  assert(st3.n === 0 && st3.raw === null, 'new game wiped buildings and save');

  // Game over clears the save
  await page.evaluate(() => {
    Game.placeBuilding('castle', Math.floor(MAP_WIDTH / 2) - 2, Math.floor(MAP_HEIGHT / 2) - 2);
    Game.getState().resources.food = 0;
    Game.update(60000 * 3 + 100);
  });
  const st4 = await page.evaluate(() => ({ over: Game.getState().gameOver, raw: localStorage.getItem('lordsOfTheKeep.save') }));
  assert(st4.over && st4.raw === null, 'game over clears save');

  assert(errors.length === 0, 'no console errors ' + JSON.stringify(errors));
  await browser.close();
})();
