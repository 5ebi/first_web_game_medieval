// ============================================
// Game State & Logic
// Real-time economy: production buildings deliver batches when their work
// cycle completes, workers eat continuously. Rates are "per minute" at 1x.
// ============================================

const SAVE_VERSION = 5;  // 5: buildings at free pixel positions (v4 tile positions are migrated)
                         // 4: weapon smith, barracks and units (v3 saves are migrated)

const Game = (() => {
    function freshWeapons() {
        const w = {};
        Object.keys(WEAPONS).forEach(k => { w[k] = 0; });
        return w;
    }

    function freshState() {
        return {
            started: false,
            paused: false,
            speed: 1,
            lastSpeed: 1,
            clockStarted: false,  // true once the first warehouse stands
            time: 0,              // game seconds since the clock started
            day: 1,
            dayProgress: 0,       // 0 to 1
            resources: { wood: 0, stone: 0, iron: 0, food: 0 },
            weapons: freshWeapons(), // weapon stock (bows, swords, ...), WEAPON_STOCK_MAX each
            maxStorage: BASE_STORAGE,
            populationCap: 0,
            populationUsed: 0,
            starving: 0,          // seconds without meat
            gameOver: false,
            milestones: [],
            storageWarned: {},
            warnedWinterYear: 0,
            lastFoodWarn: -999,
            lastStarveWarn: -999,
            stats: { built: 0, demolished: 0, maxPop: 0 },
        };
    }

    let state = freshState();
    let uiTimer = 0, saveTimer = 0, milestoneTimer = 0;

    let callbacks = {
        onDayTick: null,
        onResourceChange: null,
        onNotification: null,
        onGameOver: null,
        onMilestone: null,
        onProduce: null,
        onBuildingsChanged: null,
        onSeasonChange: null,
        onClockStart: null,
    };

    function reset() {
        state = freshState();
        BuildingManager.reset();
        Units.reset();
    }

    function getState() { return state; }

    function setCallbacks(cbs) { Object.assign(callbacks, cbs); }

    function notify(msg, type) {
        if (callbacks.onNotification) callbacks.onNotification(msg, type);
    }

    function start() {
        state.started = true;
        state.paused = false;
    }

    function setSpeed(speed) {
        if (speed === 0) {
            if (state.speed > 0) state.lastSpeed = state.speed;
            state.paused = true;
            state.speed = 0;
        } else {
            state.speed = speed;
            state.lastSpeed = speed;
            state.paused = false;
        }
    }

    function togglePause() {
        if (state.paused) setSpeed(state.lastSpeed || 1);
        else setSpeed(0);
        return state.paused;
    }

    // ---- Basics ----
    function hasCastle() { return BuildingManager.countByType('castle') > 0; }
    function hasWarehouse() { return BuildingManager.countByType('warehouse') > 0; }
    function isClockRunning() { return state.clockStarted; }

    // Hour of the day (0-24), the clock starts at START_HOUR
    function getHour() {
        return (START_HOUR + state.dayProgress * 24) % 24;
    }

    // ---- Seasons ----
    function getSeason(day = state.day) {
        let d = (Math.max(1, day) - 1) % YEAR_DAYS;
        const year = Math.floor((Math.max(1, day) - 1) / YEAR_DAYS) + 1;
        const progress = day === state.day ? state.dayProgress : 0;
        for (let i = 0; i < SEASONS.length; i++) {
            const s = SEASONS[i];
            if (d < s.days) {
                const daysLeft = s.days - d - progress;      // fractional days left in this season
                let toWinter = 0;
                if (s.id !== 'winter') {
                    toWinter = daysLeft;
                    for (let j = i + 1; j < SEASONS.length && SEASONS[j].id !== 'winter'; j++) toWinter += SEASONS[j].days;
                }
                return {
                    ...s, index: i, year,
                    secondsLeft: daysLeft * DAY_SECONDS,
                    secondsToWinter: toWinter * DAY_SECONDS,
                };
            }
            d -= s.days;
        }
        return { ...SEASONS[0], index: 0, year, secondsLeft: DAY_SECONDS, secondsToWinter: 0 };
    }

    function getSeasonMultiplier(type, season = getSeason()) {
        const m = season.food[type];
        return m === undefined ? 1 : m;
    }

    // Speed factor of a building's work cycle (season for hunters)
    function getCycleFactor(b, season) {
        if (b.def.production.resource === 'food') return getSeasonMultiplier(b.type, season || getSeason());
        return 1;
    }

    // ---- Yields: where a building stands matters ----
    // One function for the simulation, the rates, the ghost while placing and the
    // info panel. (x, y) is the footprint's top-left in world pixels; opts.self is a
    // standing building to leave out of its own neighbour checks.
    // Returns null when the spot does not matter for this type, else
    //   { kind: 'prod' | 'house' | 'well', value, base, factor, quality (0..1),
    //     parts: [{ k, v }] (i18n keys with vars), resource?, count? }
    //  - prod:  value = rate per minute at 1x before the season, factor scales the cycle
    //  - house: value = villagers housed (base + well bonus)
    //  - well:  value = extra villagers it would add (only houses no other well reaches)
    function wellDef() { return BUILDINGS.well.well; }

    // Does a well whose footprint top-left is (wx, wy) reach a footprint?
    function wellReaches(wx, wy, x, y, w, h) {
        const half = BUILDINGS.well.width * TILE_SIZE / 2;
        const cx = wx + half, cy = wy + half;
        const dx = Math.max(x - cx, 0, cx - (x + w));
        const dy = Math.max(y - cy, 0, cy - (y + h));
        const r = wellDef().radius * TILE_SIZE;
        return dx * dx + dy * dy <= r * r;
    }

    // Well bonus for a house / tavern footprint (several wells don't stack)
    function wellBonusAt(type, x, y, w, h, excludeId) {
        const bonus = wellDef().bonus[type];
        if (!bonus) return 0;
        const reached = BuildingManager.getAll().some(b => b.type === 'well' && b.id !== excludeId &&
            wellReaches(b.pixelX, b.pixelY, x, y, w, h));
        return reached ? bonus : 0;
    }

    function getYield(type, x, y, opts = {}) {
        const def = BUILDINGS[type];
        if (!def) return null;
        const w = def.width * TILE_SIZE, h = def.height * TILE_SIZE;
        const selfId = opts.self ? opts.self.id : -1;

        if (def.production && YIELD[type]) {
            const p = def.production, cfg = YIELD[type];
            const base = p.amount * 60 / p.cycle;
            const parts = [];
            let factor, quality, count = 0;
            if (cfg.by === 'onStone') {
                const share = GameMap.terrainArea(x, y, w, h, TERRAIN.STONE_DEPOSIT) / (w * h);
                factor = 0.25 + share;
                quality = Math.max(0, Math.min(1, (share - 0.5) / 0.5));
                parts.push({ k: 'y.onstone', v: { n: Math.round(share * 100) } });
            } else {
                const r = GameMap.rangeTiles(x, y, w, h);
                // what the footprint clears on placement doesn't count (0 once it stands)
                count = GameMap.countInRect(cfg.by, r.x0, r.y0, r.x1, r.y1) - GameMap.countCleared(cfg.by, x, y, w, h);
                factor = Math.max(cfg.min, Math.min(cfg.max, count / cfg.full));
                quality = Math.max(0, Math.min(1, count / (cfg.full * cfg.max)));
                parts.push({ k: 'y.' + cfg.by, v: { n: count } });
                if (cfg.by === 'trees' && !opts.brief) {
                    const stumps = GameMap.countFelledInRect(r.x0, r.y0, r.x1, r.y1);
                    if (stumps > 0) parts.push({ k: 'y.stumps', v: { n: stumps } });
                }
            }
            parts.push({ k: 'y.factor', v: { n: factor } });
            return { kind: 'prod', resource: p.resource, value: base * factor, base, factor, quality, parts, count };
        }

        if (def.provides.populationCap && wellDef().bonus[type]) {
            const base = def.provides.populationCap;
            const bonus = wellBonusAt(type, x, y, w, h);
            return {
                kind: 'house', value: base + bonus, base, factor: 1, quality: bonus ? 1 : 0.5,
                parts: [bonus ? { k: 'y.well', v: { n: bonus } } : { k: 'y.nowell', v: {} }],
            };
        }

        if (def.well) {
            let reach = 0, gain = 0, covered = 0, total = 0;
            BuildingManager.getAll().forEach(b => {
                const bonus = def.well.bonus[b.type];
                if (!bonus || !wellReaches(x, y, b.pixelX, b.pixelY, b.width, b.height)) return;
                reach++;
                total += bonus;
                // another well already gives this house its bonus
                if (wellBonusAt(b.type, b.pixelX, b.pixelY, b.width, b.height, selfId)) covered++;
                else gain += bonus;
            });
            const parts = [{ k: 'y.reach', v: { n: reach } }];
            if (covered) parts.push({ k: 'y.covered', v: { n: covered } });
            return { kind: 'well', value: opts.self ? total : gain, base: 0, factor: 1, quality: Math.min(1, gain / 8), parts, count: reach };
        }
        return null;
    }

    function fmtLocal(n, digits) {
        return Number(n).toLocaleString(Lang.get() === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: digits });
    }
    function fmtFactor(f) { return fmtLocal(f, 2); }
    function fmtRate(n) { return fmtLocal(n, n >= 10 ? 0 : 1); }

    // Text for a yield: { main: '+9 wood/min', parts: ['14 trees', '×0.7'] }.
    // Producers include the current season, so the number is what it produces now.
    function describeYield(y, type) {
        if (!y) return null;
        const parts = y.parts.map(p => t(p.k, p.k === 'y.factor' ? { n: fmtFactor(p.v.n) } : p.v));
        if (y.kind === 'prod') {
            const m = getSeasonMultiplier(type);
            if (m !== 1) parts.push(t('y.season', { s: t('season.' + getSeason().id), n: fmtFactor(m) }));
            return { main: t('menu.prod', { n: fmtRate(y.value * m), res: resName(y.resource) }), parts };
        }
        return { main: t('menu.villagers', { n: y.value }), parts };
    }

    // Yield of a standing building, cached until buildings or trees change
    function buildingYield(b) {
        const gv = GameMap.getVersion(), bv = BuildingManager.getVersion();
        if (b._yield === undefined || b._yieldG !== gv || b._yieldB !== bv) {
            b._yield = getYield(b.type, b.pixelX, b.pixelY, { self: b });
            b._yieldG = gv; b._yieldB = bv;
        }
        return b._yield;
    }

    // Spot factor of a producer (1 when its spot doesn't matter)
    function getSpotFactor(b) {
        const y = b.def.production ? buildingYield(b) : null;
        return y && y.kind === 'prod' ? y.factor : 1;
    }

    // Production of one building in units per minute
    function getBuildingOutput(b, season) {
        if (!b.def.production) return 0;
        const p = b.def.production;
        return p.amount * 60 / p.cycle * getSpotFactor(b) * getCycleFactor(b, season);
    }

    // Villagers all houses and taverns hold (with well bonuses), optionally without one building
    function computePopulationCap(excludeId) {
        let cap = 0;
        BuildingManager.getAll().forEach(b => {
            if (b.id === excludeId || !b.def.provides.populationCap) return;
            cap += b.def.provides.populationCap + wellBonusAt(b.type, b.pixelX, b.pixelY, b.width, b.height, excludeId);
        });
        return cap;
    }

    function getRates(season) {
        const rates = { wood: 0, stone: 0, iron: 0, food: 0 };
        BuildingManager.getProductionBuildings().forEach(b => {
            rates[b.def.production.resource] += getBuildingOutput(b, season);
        });
        return rates;
    }

    // Meat eaten per minute (idle villagers feed themselves)
    function getFoodConsumption() {
        return state.populationUsed * FOOD_PER_WORKER_PER_MIN;
    }

    // Meat balance per minute during a given season
    function getFoodNetForSeason(seasonId) {
        const season = SEASONS.find(s => s.id === seasonId) || SEASONS[0];
        return getRates(season).food - getFoodConsumption();
    }

    // ---- Placement ----
    const NO_COST = Object.freeze({ wood: 0, stone: 0, iron: 0 });

    // Emergency rule: no lumberjack stands and the player can't pay for one
    function isLumberjackFree() {
        return BuildingManager.countByType('lumberjack') === 0 &&
               state.resources.wood < BUILDINGS.lumberjack.cost.wood;
    }

    // Current price of the next building of a type (the first warehouse is free,
    // a lumberjack only in the emergency case above)
    function getCost(type) {
        const def = BUILDINGS[type];
        if (!def) return NO_COST;
        if (type === 'lumberjack' && isLumberjackFree()) return NO_COST;
        if (def.extraCost && BuildingManager.countByType(type) > 0) return def.extraCost;
        return def.cost;
    }

    function canAfford(type) {
        const cost = getCost(type);
        return cost.wood <= state.resources.wood &&
               cost.stone <= state.resources.stone &&
               cost.iron <= state.resources.iron;
    }

    // Human readable reason why a building can't be built right now (null = ok)
    function getUnavailableReason(type) {
        const def = BUILDINGS[type];
        if (!def) return t('g.unknown');
        if (def.limit !== null && BuildingManager.countByType(type) >= def.limit) {
            return def.limit === 1 ? t('g.alreadybuilt') : t('g.limit', { n: def.limit });
        }
        if (type !== 'castle' && !hasCastle()) return t('g.castlefirst');
        if (type !== 'castle' && type !== 'warehouse' && !hasWarehouse()) return t('g.warehousefirst');
        const missing = [];
        ['wood', 'stone', 'iron'].forEach(r => {
            const c = getCost(type)[r];
            if (c > state.resources[r]) missing.push(`${c - Math.floor(state.resources[r])} ${resName(r)}`);
        });
        if (missing.length) return t('g.needmore', { list: missing.join(', ') });
        const free = getFreeWorkers();
        if (def.workers > free) return t('g.needworkers', { n: def.workers, have: free });
        return null;
    }

    // Placement is free: (x, y) is the top-left of the footprint in world pixels,
    // snapped to whole pixels so the art stays crisp. Terrain stays a tile grid.
    function snapPos(x, y) { return { x: Math.round(x), y: Math.round(y) }; }

    function canPlace(type, x, y) {
        const def = BUILDINGS[type];
        if (!def) return { ok: false, reason: t('g.unknown') };

        const reason = getUnavailableReason(type);
        if (reason) return { ok: false, reason };
        return checkSpot(type, x, y);
    }

    // Is the spot itself fine for this type (ignores cost and workers)?
    function checkSpot(type, x, y) {
        const problem = spotProblem(type, x, y);
        if (!problem) return { ok: true };
        const def = BUILDINGS[type];
        const reasons = {
            unknown: 'g.unknown', water: 'g.water', occupied: 'g.occupied', onstone: 'g.onstone',
            resource: def?.production?.requires === 'FOREST' ? 'g.nearforest' : 'g.nearstone',
        };
        return { ok: false, reason: t(reasons[problem]) };
    }

    // What is wrong with a spot (null = fine): 'unknown' | 'water' | 'occupied' | 'onstone' | 'resource'
    function spotProblem(type, x, y) {
        const def = BUILDINGS[type];
        if (!def) return 'unknown';
        ({ x, y } = snapPos(x, y));
        const w = def.width * TILE_SIZE, h = def.height * TILE_SIZE;
        if (!GameMap.isBuildable(x, y, w, h, BuildingManager.getAll())) {
            return GameMap.rectHasTerrain(x, y, w, h, [TERRAIN.WATER, TERRAIN.SAND]) ? 'water' : 'occupied';
        }
        // Quarries must stand (at least partly) on a stone field, measured by covered area
        if (def.onStone && GameMap.terrainArea(x, y, w, h, TERRAIN.STONE_DEPOSIT) < w * h * def.onStone) return 'onstone';
        if (def.production?.requires && !GameMap.hasNearbyResource(x, y, w, h, def.production.requires)) return 'resource';
        return null;
    }

    // Does the spot change what this type yields (producers, houses, taverns, the well)?
    function hasSpotYield(type) {
        const def = BUILDINGS[type];
        return !!def && (!!YIELD[type] || !!def.well || !!(def.provides.populationCap && wellDef().bonus[type]));
    }

    // Quality (0..1) of every tile for placing this type with its footprint centred on
    // the tile, -1 where it can't stand or gains nothing from the spot (a well reaching no
    // house, a house without a well). Used for the red-to-green map tint; callers cache it.
    function getQualityGrid(type) {
        if (!hasSpotYield(type)) return null;
        const def = BUILDINGS[type];
        const w = def.width * TILE_SIZE, h = def.height * TILE_SIZE;
        const grid = new Float32Array(MAP_WIDTH * MAP_HEIGHT).fill(-1);
        // The well's reach is checked against a prepared list instead of getYield (O(houses))
        let homes = null;
        if (def.well) {
            homes = BuildingManager.getAll().filter(b => def.well.bonus[b.type]).map(b => ({
                b, bonus: def.well.bonus[b.type],
                covered: !!wellBonusAt(b.type, b.pixelX, b.pixelY, b.width, b.height),
            }));
        }
        for (let ty = 0; ty < MAP_HEIGHT; ty++) {
            for (let tx = 0; tx < MAP_WIDTH; tx++) {
                const x = Math.round(tx * TILE_SIZE + TILE_SIZE / 2 - w / 2);
                const y = Math.round(ty * TILE_SIZE + TILE_SIZE / 2 - h / 2);
                if (spotProblem(type, x, y)) continue;
                let q;
                if (homes) {
                    let gain = 0;
                    for (const hm of homes) {
                        if (!hm.covered && wellReaches(x, y, hm.b.pixelX, hm.b.pixelY, hm.b.width, hm.b.height)) gain += hm.bonus;
                    }
                    if (!gain) continue;          // reaches no house: leave the map untinted there
                    q = Math.min(1, gain / 8);
                } else {
                    const yl = getYield(type, x, y, { brief: true });
                    if (yl.kind === 'house' && yl.value === yl.base) continue;   // no well: untinted
                    q = yl.quality;
                }
                grid[ty * MAP_WIDTH + tx] = q;
            }
        }
        return grid;
    }

    function clearUnder(b) {
        return GameMap.clearArea(b.pixelX, b.pixelY, b.width, b.height, { keepStone: !!b.def.onStone });
    }

    function placeBuilding(type, x, y) {
        ({ x, y } = snapPos(x, y));
        const check = canPlace(type, x, y);
        if (!check.ok) {
            notify(check.reason, 'warning');
            return null;
        }
        const def = BUILDINGS[type];
        const cost = getCost(type);
        state.resources.wood -= cost.wood;
        state.resources.stone -= cost.stone;
        state.resources.iron -= cost.iron;

        const building = BuildingManager.place(type, x, y);
        building.dayPlaced = state.day;
        building.paid = { ...cost };
        building.progress = 0;
        if (clearUnder(building) && typeof Renderer !== 'undefined') Renderer.invalidateTerrainCache();

        if (def.workers > 0) {
            building.workers = def.workers;
            building.active = true;
            state.populationUsed += def.workers;
        }
        state.populationCap = computePopulationCap();
        if (def.provides.storage) state.maxStorage += def.provides.storage;

        state.stats.built++;
        state.stats.maxPop = Math.max(state.stats.maxPop, state.populationUsed);

        notify(t('g.built', { name: bName(def) }), 'success');

        // The first warehouse brings the starting supplies and starts the clock
        if (type === 'warehouse' && !state.clockStarted) {
            Object.entries(WAREHOUSE_STOCK).forEach(([r, a]) => {
                state.resources[r] = Math.min(state.maxStorage, state.resources[r] + a);
            });
            state.clockStarted = true;
            notify(t('g.clockstart'), 'success');
            if (callbacks.onClockStart) callbacks.onClockStart();
        }

        if (callbacks.onResourceChange) callbacks.onResourceChange();
        if (callbacks.onBuildingsChanged) callbacks.onBuildingsChanged();
        checkMilestones();
        save();
        return building;
    }

    function canDemolish(building) {
        if (!building) return { ok: false, reason: t('g.notavailable') };
        if (building.type === 'castle') return { ok: false, reason: t('g.castlenodemolish') };
        if (building.def.provides.populationCap || building.def.well) {
            const capAfter = computePopulationCap(building.id);
            if (capAfter < state.populationUsed) {
                return { ok: false, reason: t(building.def.well ? 'g.wellneeded' : 'g.stillliving', { n: state.populationUsed - capAfter }) };
            }
        }
        return { ok: true };
    }

    function demolishBuilding(id) {
        const b = BuildingManager.getById(id);
        const check = canDemolish(b);
        if (!check.ok) {
            notify(check.reason, 'warning');
            return false;
        }
        const def = b.def;
        // A smith mid-forge already took the material for its weapon: that comes
        // back in full, on top of the usual share of the building cost.
        const held = (def.crafts && b.inputPaid) ? WEAPONS[getProduct(b)].cost : {};
        b.inputPaid = false;
        b.progress = 0;
        const refund = {};
        ['wood', 'stone', 'iron'].forEach(r => {
            const amt = Math.floor(((b.paid || def.cost)[r] || 0) * DEMOLISH_REFUND) + (held[r] || 0);
            if (amt > 0) {
                refund[r] = amt;
                state.resources[r] = Math.min(state.maxStorage, state.resources[r] + amt);
            }
        });
        if (b.workers > 0) state.populationUsed -= b.workers;
        if (def.provides.storage) {
            state.maxStorage -= def.provides.storage;
            Object.keys(state.resources).forEach(r => {
                state.resources[r] = Math.min(state.resources[r], state.maxStorage);
            });
        }
        BuildingManager.remove(id);
        state.populationCap = computePopulationCap();
        state.stats.demolished++;

        const refundStr = Object.entries(refund).map(([r, a]) => `+${a} ${resName(r)}`).join(', ');
        notify(refundStr ? t('g.demolished.refund', { name: bName(def), r: refundStr }) : t('g.demolished', { name: bName(def) }), 'info');
        if (callbacks.onResourceChange) callbacks.onResourceChange();
        if (callbacks.onBuildingsChanged) callbacks.onBuildingsChanged();
        save();
        return true;
    }

    // ---- Weapon smith ----
    // Each smith forges its chosen weapon: the input is taken when work on a weapon
    // starts, the weapon goes into the stock when the cycle completes.
    function getProduct(b) {
        return WEAPONS[b.product] ? b.product : Object.keys(WEAPONS)[0];
    }

    function canPayWeapon(wkey) {
        const cost = WEAPONS[wkey].cost;
        return Object.keys(cost).every(r => state.resources[r] >= cost[r]);
    }

    // 'building' | 'noworkers' | 'full' | 'noinput' | 'notime' | 'working'
    function getSmithStatus(b) {
        if (!b.active || b.workers <= 0) return 'noworkers';
        const w = getProduct(b);
        if (!b.inputPaid && state.weapons[w] >= WEAPON_STOCK_MAX) return 'full';
        if (!b.inputPaid && !canPayWeapon(w)) return 'noinput';
        if (!state.clockStarted) return 'notime';
        return 'working';
    }

    function setSmithProduct(id, wkey) {
        const b = BuildingManager.getById(id);
        if (!b || !b.def.crafts || !WEAPONS[wkey] || getProduct(b) === wkey) return false;
        // Material already taken for the old weapon goes back into the store
        if (b.inputPaid) {
            const cost = WEAPONS[getProduct(b)].cost;
            Object.keys(cost).forEach(r => { state.resources[r] = Math.min(state.maxStorage, state.resources[r] + cost[r]); });
        }
        b.product = wkey;
        b.inputPaid = false;
        b.progress = 0;
        if (callbacks.onResourceChange) callbacks.onResourceChange();
        save();
        return true;
    }

    function simulateSmiths(dt) {
        let changed = false;
        BuildingManager.getAll().forEach(b => {
            if (!b.def.crafts || !b.active || b.workers <= 0) return;
            const w = getProduct(b);
            const wd = WEAPONS[w];
            if (!b.inputPaid) {
                if (state.weapons[w] >= WEAPON_STOCK_MAX || !canPayWeapon(w)) return;
                Object.keys(wd.cost).forEach(r => { state.resources[r] -= wd.cost[r]; });
                b.inputPaid = true;
                changed = true;
            }
            b.progress = (b.progress || 0) + dt * (b.workers / b.maxWorkers) / wd.cycle;
            if (b.progress >= 1) {
                b.progress = 0;
                b.inputPaid = false;
                state.weapons[w] = Math.min(WEAPON_STOCK_MAX, state.weapons[w] + 1);
                changed = true;
                if (callbacks.onForge) callbacks.onForge(b, w);
                if (state.weapons[w] >= WEAPON_STOCK_MAX) notify(t('g.weaponsfull', { w: wName(w, 2) }), 'warning');
            }
        });
        return changed;
    }

    // ---- Barracks ----
    // Why a soldier of this type can't be recruited right now (null = ok)
    function getRecruitReason(unitType) {
        const w = UNIT_WEAPON[unitType];
        if (!w) return t('g.unknown');
        if (getFreeWorkers() < 1) return t('g.nofree');
        if (state.weapons[w] < 1) return t('g.noweapon', { w: wName(w, 1) });
        return null;
    }

    function recruit(barracksId, unitType) {
        const b = BuildingManager.getById(barracksId);
        if (!b || !b.def.recruits) return null;
        const reason = getRecruitReason(unitType);
        if (reason) { notify(reason, 'warning'); return null; }
        const unit = Units.add(unitType, b);
        if (!unit) return null;
        state.weapons[UNIT_WEAPON[unitType]] -= 1;
        state.populationUsed += 1;   // a soldier is a working villager: he eats
        state.stats.maxPop = Math.max(state.stats.maxPop, state.populationUsed);
        notify(t('g.recruited', { name: t('unit.' + unitType) }), 'success');
        if (callbacks.onResourceChange) callbacks.onResourceChange();
        checkMilestones();
        save();
        return unit;
    }

    // ---- Simulation ----
    function update(deltaMs) {
        if (!state.started || state.paused || state.gameOver || !state.clockStarted) return;
        let dt = deltaMs / 1000 * state.speed;
        // Simulate in steps of at most one second so long frames (or tests) stay accurate
        while (dt > 0 && !state.gameOver) {
            const step = Math.min(dt, 1);
            simulate(step);
            dt -= step;
        }
    }

    function simulate(dt) {
        const prevDay = state.day;
        const prevSeason = getSeason(prevDay).id;

        state.time += dt;
        state.day = Math.floor(state.time / DAY_SECONDS) + 1;
        state.dayProgress = (state.time % DAY_SECONDS) / DAY_SECONDS;

        let changed = false;

        // Production: each building fills its work cycle and delivers a batch
        const season = getSeason();
        BuildingManager.getProductionBuildings().forEach(b => {
            const p = b.def.production;
            b.progress = (b.progress || 0) + dt * getSpotFactor(b) * getCycleFactor(b, season) / p.cycle;
            while (b.progress >= 1) {
                b.progress -= 1;
                if (YIELD[b.type]?.by === 'trees') fellFor(b);
                const res = p.resource;
                const before = state.resources[res];
                state.resources[res] = Math.min(before + p.amount, state.maxStorage);
                const gained = state.resources[res] - before;
                changed = true;
                if (callbacks.onProduce) callbacks.onProduce(b, res, gained);
                if (gained < p.amount && !state.storageWarned[res]) {
                    state.storageWarned[res] = true;
                    notify(t('g.storagefull', { res: resName(res) }), 'warning');
                } else if (state.resources[res] < state.maxStorage * 0.9) {
                    state.storageWarned[res] = false;
                }
            }
        });

        if (simulateSmiths(dt)) changed = true;
        GameMap.growTrees(dt);

        // Workers eat continuously
        const eat = getFoodConsumption() / 60 * dt;
        if (eat > 0) {
            if (state.resources.food >= eat) {
                state.resources.food -= eat;
                if (state.starving > 0) notify(t('g.fedagain'), 'success');
                state.starving = 0;
            } else {
                state.resources.food = 0;
                state.starving += dt;
                const left = Math.ceil(STARVATION_GRACE - state.starving);
                if (state.time - state.lastStarveWarn >= 15) {
                    state.lastStarveWarn = state.time;
                    notify(t('g.starving', { s: Math.max(0, left) }), 'danger');
                }
                if (state.starving >= STARVATION_GRACE) {
                    state.gameOver = true;
                    clearSave();
                    if (callbacks.onGameOver) callbacks.onGameOver();
                    return;
                }
            }
        }

        // Running low on meat: warn when less than ~1.5 minutes are left
        const net = getRates().food - getFoodConsumption();
        if (net < 0 && state.resources.food > 0 && state.resources.food < -net * 1.5 && state.time - state.lastFoodWarn > 45) {
            state.lastFoodWarn = state.time;
            notify(t('g.foodout', { n: Math.max(1, Math.round(state.resources.food / -net)) }), 'warning');
        }

        // Winter warning with a concrete stockpile target
        if (season.id !== 'winter' && season.secondsToWinter <= WINTER_WARNING_SECONDS && state.warnedWinterYear !== season.year) {
            state.warnedWinterYear = season.year;
            const winterMinutes = SEASONS.find(s => s.id === 'winter').days * DAY_SECONDS / 60;
            const need = Math.max(0, Math.ceil(-getFoodNetForSeason('winter') * winterMinutes));
            const n = Math.round(season.secondsToWinter / 60);
            if (need > state.maxStorage) notify(t('season.warn.storage', { n, food: need, max: state.maxStorage }), 'danger');
            else if (need > state.resources.food) notify(t('season.warn', { n, food: need }), 'warning');
            else notify(t('season.warn.ok', { n }), 'info');
        }

        // New day / season
        if (state.day !== prevDay) {
            const s = getSeason();
            if (s.id !== prevSeason && callbacks.onSeasonChange) callbacks.onSeasonChange(s);
            if (callbacks.onDayTick) callbacks.onDayTick();
            changed = true;
        }

        milestoneTimer += dt;
        if (milestoneTimer >= 1) { milestoneTimer = 0; checkMilestones(); }

        uiTimer += dt;
        if (changed || uiTimer >= 0.5) {
            uiTimer = 0;
            if (callbacks.onResourceChange) callbacks.onResourceChange();
        }

        saveTimer += dt;
        if (saveTimer >= 20) { saveTimer = 0; save(); }
    }

    // A wood delivery fells the nearest standing trees in the lumberjack's range
    function fellFor(b) {
        const r = GameMap.rangeTiles(b.pixelX, b.pixelY, b.width, b.height);
        const trees = GameMap.fellTrees(r.x0, r.y0, r.x1, r.y1, b.pixelX + b.width / 2, b.pixelY + b.height, TREES_PER_DELIVERY);
        if (trees.length && callbacks.onFell) callbacks.onFell(b, trees);
    }

    // ---- Milestones ----
    function checkMilestones() {
        MILESTONES.forEach(m => {
            if (state.milestones.includes(m.id)) return;
            if (m.check(state, BuildingManager)) {
                state.milestones.push(m.id);
                if (callbacks.onMilestone) callbacks.onMilestone(m);
            }
        });
    }

    function getNextMilestone() {
        return MILESTONES.find(m => !state.milestones.includes(m.id)) || null;
    }

    function isBuildingAvailable(type) {
        return getUnavailableReason(type) === null;
    }

    function getFreeWorkers() {
        return state.populationCap - state.populationUsed;
    }

    // ---- Save / Load ----
    function save() {
        if (!state.started || state.gameOver) return;
        try {
            const data = {
                version: SAVE_VERSION,
                seed: GameMap.getSeed(),
                state: Object.assign({}, state, { started: true }),
                buildings: BuildingManager.serialize(),
                units: Units.serialize(),
                trees: GameMap.serializeTrees(),   // felled trees [id, growth]; missing = all standing
                savedAt: Date.now(),
            };
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        } catch (e) { /* storage might be unavailable */ }
    }

    function hasSave() {
        try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    }

    function getSaveInfo() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            return { day: data.state?.day, buildings: data.buildings?.length || 0, savedAt: data.savedAt };
        } catch (e) { return null; }
    }

    function load() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data || !(data.version >= 3 && data.version <= SAVE_VERSION)) return false;
            if (data.version === 3) migrateV3(data);
            // v3/v4 buildings carry tileX/tileY: BuildingManager.deserialize turns them into pixels
            GameMap.generate(data.seed);
            GameMap.deserializeTrees(data.trees);
            state = Object.assign(freshState(), data.state);
            state.weapons = Object.assign(freshWeapons(), data.state.weapons);
            state.milestones = (state.milestones || []).filter(id => MILESTONES.some(m => m.id === id));
            state.paused = false;
            state.speed = state.lastSpeed || 1;
            state.gameOver = false;
            state.started = true;
            BuildingManager.deserialize(data.buildings);
            BuildingManager.getAll().forEach(clearUnder);
            state.populationCap = computePopulationCap();
            Units.deserialize(data.units);
            return true;
        } catch (e) {
            return false;
        }
    }

    // v3 -> v4: the blacksmith is gone. Drop it, give back what it cost and free its smith.
    function migrateV3(data) {
        const st = data.state || (data.state = {});
        const res = st.resources || (st.resources = { wood: 0, stone: 0, iron: 0, food: 0 });
        const cap = st.maxStorage || BASE_STORAGE;
        data.buildings = (data.buildings || []).filter(b => {
            if (b.type !== 'blacksmith') return true;
            const paid = b.paid || { wood: 30, stone: 20, iron: 10 };
            ['wood', 'stone', 'iron'].forEach(r => { res[r] = Math.min(cap, (res[r] || 0) + (paid[r] || 0)); });
            st.populationUsed = Math.max(0, (st.populationUsed || 0) - (b.workers || 0));
            return false;
        });
        data.units = [];
        data.version = SAVE_VERSION;
    }

    function clearSave() {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    }

    return {
        reset,
        getState,
        setCallbacks,
        start,
        setSpeed,
        togglePause,
        canAfford,
        getCost,
        isLumberjackFree,
        canPlace,
        checkSpot,
        hasSpotYield,
        getQualityGrid,
        getYield,
        getBuildingYield: buildingYield,
        describeYield,
        placeBuilding,
        canDemolish,
        demolishBuilding,
        update,
        isBuildingAvailable,
        getUnavailableReason,
        getFreeWorkers,
        getRates,
        getFoodConsumption,
        getBuildingOutput,
        getSeason,
        getSeasonMultiplier,
        getFoodNetForSeason,
        getSmithStatus,
        getProduct,
        setSmithProduct,
        getRecruitReason,
        recruit,
        getNextMilestone,
        getHour,
        hasCastle,
        hasWarehouse,
        isClockRunning,
        save,
        load,
        hasSave,
        getSaveInfo,
        clearSave,
    };
})();
