// Balance simulation: a bot plays the real game headless (Playwright + Game.update) and
// prints what happens per game day. Used to tune the numbers in js/constants.js (#40).
//
//   node tests/balance-sim.js                 # all profiles, seeds 42 1234 777, 18 days
//   node tests/balance-sim.js --days 24 --seeds 42 --profiles optimal
//   node tests/balance-sim.js --set BUILDINGS.house.cost.stone=15 SEASONS.3.food.hunter=0.4
//   GAME_URL=http://127.0.0.1:8123/index.html node tests/balance-sim.js
//
// --set changes a constant in the page before the runs (try numbers without editing files);
// --summary prints only one line per run.
//
// Without GAME_URL it serves the repo itself on a free port.
//
// The bot (like the one from the 2026-11-13 playtest): a fixed build order plus four rules,
// decided every 5 game seconds:
//   1. no free villager and a workplace waits for people  -> house (a well next to them once
//      there are a few houses)
//   2. meat running short                                 -> hunter
//   3. otherwise the next building of the build order; while it can't pay for it and
//      villagers stand idle, it builds a producer of the missing resource
//   4. a free villager and a weapon in store              -> recruit
// Profiles:
//   optimal  rule 2 also looks ahead: before winter it wants enough meat in store (or enough
//            hunters) to get through the winter
//   nofood   rule 2 only reacts to the "meat runs out" warning (net negative, < 1.5 min left)
//   slow     a relaxed human: optimal rules, but looks at the game only every 30 s
// It never builds extra warehouses, so "at cap" shows income that has nothing to go into.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function arg(name, def) {
    const i = args.indexOf('--' + name);
    if (i < 0) return def;
    const out = [];
    for (let j = i + 1; j < args.length && !args[j].startsWith('--'); j++) out.push(args[j]);
    return out;
}
const DAYS = Number((arg('days', ['18']))[0]);
const SEEDS = arg('seeds', ['42', '1234', '777']).map(Number);
const PROFILES = arg('profiles', ['optimal', 'nofood', 'slow']);
const QUIET = args.includes('--summary');
const SETS = arg('set', []);

function serve() {
    const root = path.join(__dirname, '..');
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg' };
    const server = http.createServer((req, res) => {
        const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
        if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
        fs.createReadStream(p).pipe(res);
    });
    return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

// ---- Runs inside the page ----
function playBot({ seed, profile, days }) {
    const T = TILE_SIZE;
    const STEP = 5;                                    // game seconds per bot decision
    const look = profile === 'slow' ? 30 : STEP;       // how often the bot acts
    const foresight = profile !== 'nofood';
    const ARMY_MAX = 24;                               // a garrison, not every villager

    Game.reset();
    Game.clearSave();
    Villagers.reset();
    GameMap.generate(seed);
    UI.deselectBuilding(true);
    Game.start();
    const s = Game.getState();

    const cx = Math.floor(MAP_WIDTH / 2), cy = Math.floor(MAP_HEIGHT / 2);
    let castle = null;
    const dist2 = (x, y) => { const c = castle || { pixelX: cx * T, pixelY: cy * T }; return ((x - c.pixelX) ** 2 + (y - c.pixelY) ** 2) / (T * T); };

    // Spiral around the castle: first spot that fits
    function spiral(type, maxR = 30) {
        const c = castle ? { x: Math.floor(castle.pixelX / T) + 2, y: Math.floor(castle.pixelY / T) + 2 } : { x: cx, y: cy };
        const def = BUILDINGS[type];
        for (let d = castle ? 3 : 0; d <= maxR; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
            const x = (c.x + dx) * T - Math.floor(def.width / 2) * T, y = (c.y + dy) * T - Math.floor(def.height / 2) * T;
            if (Game.checkSpot(type, x, y).ok) return { x, y };
        }
        return null;
    }
    // Best tile of the quality grid, a little penalty for distance from the castle
    function bestSpot(type, minQ = -0.5) {
        const g = Game.getQualityGrid(type);
        if (!g) return null;
        const def = BUILDINGS[type];
        let best = null, bestScore = -Infinity;
        for (let i = 0; i < g.length; i++) {
            if (g[i] < 0 || g[i] < minQ) continue;
            const x = Math.round((i % MAP_WIDTH) * T + T / 2 - def.width * T / 2);
            const y = Math.round(Math.floor(i / MAP_WIDTH) * T + T / 2 - def.height * T / 2);
            const d = Math.sqrt(dist2(x, y));
            if (d > (type === 'hunter' ? 45 : 28)) continue;   // food may come from further away
            const score = g[i] - d * 0.01;
            if (score > bestScore) { bestScore = score; best = { x, y }; }
        }
        return best;
    }
    function spotFor(type) {
        if (type === 'castle' || type === 'warehouse' || type === 'weaponsmith' || type === 'barracks') return spiral(type);
        if (type === 'house' || type === 'tavern') return bestSpot(type, 0.9) || spiral(type);
        if (type === 'well') return bestSpot(type, 0.2) || spiral(type);
        return bestSpot(type);
    }

    const log = { builds: [], goals: {}, days: [], waits: [], starved: false, gameOverDay: null, atCap: { wood: 0, stone: 0, iron: 0, food: 0 }, starveEvents: 0, hungry: 0, hungryAll: 0 };
    let lastBuildAt = 0;
    function build(type) {
        if (!Game.isBuildingAvailable(type)) return false;
        const p = spotFor(type);
        if (!p) return false;
        const ok = Game.placeBuilding(type, p.x, p.y);
        if (!ok) return false;
        const b = BuildingManager.getAll()[BuildingManager.getAll().length - 1];
        if (type === 'castle') castle = b;
        if (b.def.crafts) Game.setSmithProduct(b.id, 'bow');
        if (s.clockStarted) { log.waits.push({ t: s.time, wait: s.time - lastBuildAt, type }); lastBuildAt = s.time; }
        log.builds.push({ t: Math.round(s.time), day: s.day, type });
        return true;
    }

    const ORDER = ['castle', 'warehouse', 'lumberjack', 'hunter', 'quarry', 'lumberjack', 'house', 'house',
        'hunter', 'forester', 'iron_mine', 'house', 'well', 'weaponsmith', 'quarry', 'barracks', 'house'];
    // after the build order: keep growing, but skip producers whose resource already piles up
    // (food is left to rule 2)
    const LOOP = ['house', 'lumberjack', 'quarry', 'iron_mine', 'house', 'tavern', 'forester', 'weaponsmith'];
    let oi = 0, li = 0;
    const piles = type => {
        const res = BUILDINGS[type].production?.resource;
        return !!res && s.resources[res] >= s.maxStorage * 0.8;
    };
    const nextOrdered = () => {
        if (oi < ORDER.length) return ORDER[oi];
        for (let k = 0; k < LOOP.length && piles(LOOP[li % LOOP.length]); k++) li++;
        return LOOP[li % LOOP.length];
    };
    const advance = () => { if (oi < ORDER.length) oi++; else li++; };

    const consumption = () => Game.getFoodConsumption();
    function foodTrouble() {
        const net = Game.getRates().food - consumption();
        // ignoring food: only the "meat runs out" warning (under ~1.5 min left) gets a reaction
        if (!foresight) return net < 0 && s.resources.food < -net * 1.5;
        if (net < Math.max(0.5, consumption() * 0.1)) return true;   // rule 2: meat net low
        // look ahead: winter must not empty the store
        const season = Game.getSeason();
        const winterMin = DAY_SECONDS / 60;
        const winterNet = Game.getFoodNetForSeason('winter');
        if (winterNet >= 0) return false;
        const need = -winterNet * winterMin;
        if (season.id === 'winter') return s.resources.food < -net * 3;
        const minutesToWinter = season.secondsToWinter / 60;
        const reach = s.resources.food + Math.max(0, net) * minutesToWinter;
        // more than the store can hold: winter must be carried by more hunters
        if (need > s.maxStorage * 0.8) return true;
        return reach < need * 1.1;
    }

    // weapons: forge what is short; recruit whenever possible (bow -> archer, sword -> swordsman)
    function military() {
        BuildingManager.getAll().filter(b => b.def.crafts).forEach(b => {
            const want = s.weapons.sword < s.weapons.bow && s.resources.iron >= WEAPONS.sword.cost.iron * 2 ? 'sword' : 'bow';
            if (!b.inputPaid && Game.getProduct(b) !== want) Game.setSmithProduct(b.id, want);
        });
        const bar = BuildingManager.getAll().find(b => b.def.recruits);
        if (!bar) return;
        for (const unit of ['swordsman', 'archer']) {
            // keep at least one villager free for the next workplace once the army is a fair size
            if (Units.getAll().length >= 4 && Game.getFreeWorkers() < 2) break;
            if (Units.getAll().length >= ARMY_MAX) break;
            if (!Game.getRecruitReason(unit)) Game.recruit(bar.id, unit);
        }
    }

    function act() {
        if (!castle) { build('castle'); advance(); }
        if (!Game.hasWarehouse()) { if (build('warehouse')) advance(); return; }
        // rule 1: villagers short
        const understaffed = Game.getUnderstaffed().length > 0;
        if (Game.getFreeWorkers() <= 0 && (understaffed || BUILDINGS[nextOrdered()].workers > 0)) {
            const houses = BuildingManager.countByType('house');
            const wells = BuildingManager.countByType('well');
            const type = houses >= 3 && wells * 4 < houses && Game.getYield('well', 0, 0) !== null &&
                bestSpot('well', 0.2) ? 'well' : 'house';
            build(type);
            return;
        }
        // rule 2: food
        if (foodTrouble()) { build('hunter'); return; }
        // rule 3: build order
        const next = nextOrdered();
        if (build(next)) advance();
        else if (!Game.canAfford(next)) {
            // can't pay yet: with idle villagers, build a producer of what is missing
            if (Game.getFreeWorkers() < 2 || !BuildingManager.countByType('quarry')) return;
            const cost = Game.getCost(next);
            const short = ['iron', 'stone', 'wood'].find(r => cost[r] > s.resources[r]);
            const maker = { wood: 'lumberjack', stone: 'quarry', iron: 'iron_mine' }[short];
            if (maker && maker !== next && Game.canAfford(maker)) build(maker);
        } else advance();   // no spot: skip it
    }

    const goalsAt = () => s.milestones.length;
    let nextLook = 0, t = 0;
    const end = days * DAY_SECONDS;
    act();
    act();   // castle + warehouse start the clock
    let starvingSeen = false;
    while (s.time < end && !s.gameOver) {
        if (s.time >= nextLook) { act(); military(); nextLook = s.time + look; }
        const day = s.day;
        Game.update(STEP * 1000);
        if (s.resources.food <= 0 && consumption() > 0 && s.milestones.length < MILESTONES.length) log.hungry += STEP;
        if (s.resources.food <= 0 && consumption() > 0) log.hungryAll += STEP;
        if (s.starving > 0 && !starvingSeen) { log.starveEvents++; starvingSeen = true; log.starveAt = (log.starveAt || []).concat(Math.round(s.time / DAY_SECONDS * 10) / 10 + 1); }
        if (s.starving === 0) starvingSeen = false;
        ['wood', 'stone', 'iron', 'food'].forEach(r => { if (s.resources[r] >= s.maxStorage - 1 && s.milestones.length < MILESTONES.length) log.atCap[r] += STEP; });
        s.milestones.forEach(id => { if (log.goals[id] === undefined) log.goals[id] = Math.round(s.time); });
        if (s.day !== day || s.gameOver) {
            const r = Game.getRates(Game.getSeason(day));
            log.days.push({
                day, season: Game.getSeason(day).id,
                wood: Math.round(s.resources.wood), stone: Math.round(s.resources.stone),
                iron: Math.round(s.resources.iron), food: Math.round(s.resources.food), cap: s.maxStorage,
                rw: r.wood, rs: r.stone, ri: r.iron, rf: r.food, eat: consumption(),
                used: s.populationUsed, popCap: s.populationCap, soldiers: Units.getAll().length,
                bld: BuildingManager.getAll().length, goals: goalsAt(),
                bows: s.weapons.bow, swords: s.weapons.sword,
            });
        }
    }
    if (s.gameOver) { log.starved = true; log.gameOverDay = Math.round(s.time / DAY_SECONDS * 10) / 10; }
    const early = log.waits.filter(w => w.t <= 2 * DAY_SECONDS);
    log.early = {
        builds: early.length,
        meanWait: early.length ? Math.round(early.reduce((a, w) => a + w.wait, 0) / early.length) : null,
        maxWait: early.length ? Math.round(Math.max(...early.map(w => w.wait))) : null,
    };
    log.maxWaitAll = log.waits.length ? Math.round(Math.max(...log.waits.map(w => w.wait))) : null;
    log.allGoalsDay = s.milestones.length === MILESTONES.length ? Math.round(Math.max(...Object.values(log.goals)) / DAY_SECONDS * 10) / 10 + 1 : null;
    log.goalCount = s.milestones.length;
    log.popAt = [2, 4, 8, 12, 16].map(d => (log.days.find(x => x.day === d) || {}).used ?? '-');
    log.total = MILESTONES.length;
    log.goalOrder = MILESTONES.map(m => [m.id, log.goals[m.id] === undefined ? null : Math.round(log.goals[m.id] / DAY_SECONDS * 10) / 10 + 1]);
    Game.clearSave();
    return log;
}

const pad = (v, n) => String(v).padStart(n);
const DAY_SECONDS = 360;   // as in js/constants.js (only for printing)
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);

function printRun(seed, profile, log) {
    console.log(`\n=== ${profile}, seed ${seed}`);
    if (!QUIET) {
        console.log(' day season  wood stone iron food  cap | +wood +stone +iron +meat -meat | work/home sold bld goals bows swords');
        log.days.forEach(d => {
            console.log(`${pad(d.day, 4)} ${d.season.padEnd(6)} ${pad(d.wood, 5)} ${pad(d.stone, 5)} ${pad(d.iron, 4)} ${pad(d.food, 4)} ${pad(d.cap, 4)} |` +
                ` ${pad(f1(d.rw), 5)} ${pad(f1(d.rs), 6)} ${pad(f1(d.ri), 5)} ${pad(f1(d.rf), 5)} ${pad(f1(d.eat), 5)} |` +
                ` ${pad(d.used + '/' + d.popCap, 9)} ${pad(d.soldiers, 4)} ${pad(d.bld, 3)} ${pad(d.goals, 5)} ${pad(d.bows, 4)} ${pad(d.swords, 6)}`);
        });
        console.log('goals (day reached): ' + log.goalOrder.map(([id, d]) => `${id} ${d === null ? '-' : d}`).join(', '));
    }
    const cap = Object.entries(log.atCap).map(([r, sec]) => `${r} ${f1(sec / DAY_SECONDS)}d`).join(', ');
    console.log(`goals ${log.goalCount}/${log.total}` + (log.allGoalsDay ? `, all on day ${log.allGoalsDay}` : '') +
        ` | first 2 days: ${log.early.builds} builds, mean wait ${log.early.meanWait} s, max ${log.early.maxWait} s | longest wait ${log.maxWaitAll} s` +
        ` | at cap before last goal: ${cap} | no meat ${f1(log.hungry / 60)} min before the last goal (${f1(log.hungryAll / 60)} in all) in ${log.starveEvents} spells${log.starveAt ? ' (from day ' + log.starveAt[0] + ')' : ''}` + (log.starved ? ` | GAME OVER day ${log.gameOverDay}` : ''));
}

(async () => {
    let server = null, url = process.env.GAME_URL;
    if (!url) { server = await serve(); url = `http://127.0.0.1:${server.address().port}/index.html`; }
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForTimeout(300);
    await page.click('#start-btn');
    await page.waitForTimeout(300);
    // keep the real-time loop out of the way: the bot drives Game.update itself
    await page.evaluate(() => { AudioSys.setMuted && AudioSys.setMuted(true); });
    for (const kv of SETS) {
        const [key, val] = kv.split('=');
        await page.evaluate(([key, val]) => {
            const parts = key.split('.');
            let o = window[parts[0]] || eval(parts[0]);   // consts are global lexical bindings
            for (let i = 1; i < parts.length - 1; i++) o = o[parts[i]];
            o[parts[parts.length - 1]] = JSON.parse(val);
        }, [key, val]);
        console.log(`set ${key} = ${val}`);
    }
    const summary = [];
    for (const profile of PROFILES) {
        for (const seed of SEEDS) {
            const log = await page.evaluate(playBot, { seed, profile, days: DAYS });
            printRun(seed, profile, log);
            summary.push({ profile, seed, log });
        }
    }
    console.log('\n=== summary');
    console.log('profile  seed  goals  all-on-day  early-mean/max-wait  longest-wait  at-cap(days w/s/i/f)  no-meat-min  game-over  workers d2/4/8/12/16');
    summary.forEach(({ profile, seed, log }) => {
        const c = log.atCap;
        console.log(`${profile.padEnd(8)} ${pad(seed, 5)} ${pad(log.goalCount + '/' + log.total, 6)} ${pad(log.allGoalsDay || '-', 11)} ${pad(log.early.meanWait + '/' + log.early.maxWait, 20)} ${pad(log.maxWaitAll, 13)}` +
            `  ${pad([c.wood, c.stone, c.iron, c.food].map(v => f1(v / DAY_SECONDS)).join('/'), 20)} ${pad(f1(log.hungry / 60), 12)} ${pad(log.gameOverDay || '-', 10)}  ${log.popAt.join('/')}`);
    });
    if (errors.length) console.log('page errors: ' + errors.slice(0, 5).join(' | '));
    await browser.close();
    if (server) server.close();
    process.exit(errors.length ? 1 : 0);
})();
