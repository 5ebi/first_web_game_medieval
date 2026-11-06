// ============================================
// Game State & Logic
// Real-time economy: production buildings deliver batches when their work
// cycle completes, workers eat continuously. Rates are "per minute" at 1x.
// ============================================

const SAVE_VERSION = 4;  // 4: weapon smith, barracks and units (v3 saves are migrated)

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

    // Production of one building in units per minute
    function getBuildingOutput(b, season) {
        if (!b.def.production) return 0;
        const p = b.def.production;
        return p.amount * 60 / p.cycle * getCycleFactor(b, season);
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
    // Current price of the next building of a type (the first warehouse is free)
    function getCost(type) {
        const def = BUILDINGS[type];
        if (!def) return { wood: 0, stone: 0, iron: 0 };
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

    function countStoneTiles(tileX, tileY, w, h) {
        let n = 0;
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                if (GameMap.getTerrain(tileX + dx, tileY + dy) === TERRAIN.STONE_DEPOSIT) n++;
            }
        }
        return n;
    }

    function canPlace(type, tileX, tileY) {
        const def = BUILDINGS[type];
        if (!def) return { ok: false, reason: t('g.unknown') };

        const reason = getUnavailableReason(type);
        if (reason) return { ok: false, reason };

        if (!GameMap.isBuildable(tileX, tileY, def.width, def.height, BuildingManager.getAll())) {
            let water = false;
            for (let dy = 0; dy < def.height && !water; dy++) {
                for (let dx = 0; dx < def.width; dx++) {
                    const tt = GameMap.getTerrain(tileX + dx, tileY + dy);
                    if (tt === TERRAIN.WATER || tt === TERRAIN.SAND) { water = true; break; }
                }
            }
            return { ok: false, reason: water ? t('g.water') : t('g.occupied') };
        }

        // Quarries must stand (at least partly) on a stone field
        if (def.onStone) {
            const need = Math.ceil(def.width * def.height * def.onStone);
            if (countStoneTiles(tileX, tileY, def.width, def.height) < need) return { ok: false, reason: t('g.onstone') };
        }

        if (def.production?.requires) {
            if (!GameMap.hasNearbyResource(tileX, tileY, def.width, def.height, def.production.requires)) {
                return { ok: false, reason: def.production.requires === 'FOREST' ? t('g.nearforest') : t('g.nearstone') };
            }
        }
        return { ok: true };
    }

    function clearUnder(b) {
        return GameMap.clearArea(b.tileX, b.tileY, b.def.width, b.def.height, { keepStone: !!b.def.onStone });
    }

    function placeBuilding(type, tileX, tileY) {
        const check = canPlace(type, tileX, tileY);
        if (!check.ok) {
            notify(check.reason, 'warning');
            return null;
        }
        const def = BUILDINGS[type];
        const cost = getCost(type);
        state.resources.wood -= cost.wood;
        state.resources.stone -= cost.stone;
        state.resources.iron -= cost.iron;

        const building = BuildingManager.place(type, tileX, tileY);
        building.dayPlaced = state.day;
        building.paid = { ...cost };
        building.progress = 0;
        if (clearUnder(building) && typeof Renderer !== 'undefined') Renderer.invalidateTerrainCache();

        if (def.workers > 0) {
            building.workers = def.workers;
            building.active = true;
            state.populationUsed += def.workers;
        }
        if (def.provides.populationCap) state.populationCap += def.provides.populationCap;
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
        if (building.def.provides.populationCap) {
            const capAfter = state.populationCap - building.def.provides.populationCap;
            if (capAfter < state.populationUsed) {
                return { ok: false, reason: t('g.stillliving', { n: state.populationUsed - capAfter }) };
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
        const refund = {};
        ['wood', 'stone', 'iron'].forEach(r => {
            const amt = Math.floor((b.paid || def.cost)[r] * DEMOLISH_REFUND);
            if (amt > 0) {
                refund[r] = amt;
                state.resources[r] = Math.min(state.maxStorage, state.resources[r] + amt);
            }
        });
        if (b.workers > 0) state.populationUsed -= b.workers;
        if (def.provides.populationCap) state.populationCap -= def.provides.populationCap;
        if (def.provides.storage) {
            state.maxStorage -= def.provides.storage;
            Object.keys(state.resources).forEach(r => {
                state.resources[r] = Math.min(state.resources[r], state.maxStorage);
            });
        }
        BuildingManager.remove(id);
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
            b.progress = (b.progress || 0) + dt * getCycleFactor(b, season) / p.cycle;
            while (b.progress >= 1) {
                b.progress -= 1;
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
            if (!data || !(data.version === 3 || data.version === SAVE_VERSION)) return false;
            if (data.version === 3) migrateV3(data);
            GameMap.generate(data.seed);
            state = Object.assign(freshState(), data.state);
            state.weapons = Object.assign(freshWeapons(), data.state.weapons);
            state.milestones = (state.milestones || []).filter(id => MILESTONES.some(m => m.id === id));
            state.paused = false;
            state.speed = state.lastSpeed || 1;
            state.gameOver = false;
            state.started = true;
            BuildingManager.deserialize(data.buildings);
            BuildingManager.getAll().forEach(clearUnder);
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
        canPlace,
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
