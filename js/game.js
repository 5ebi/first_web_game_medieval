// ============================================
// Game State & Logic
// ============================================

const Game = (() => {
    function freshState() {
        return {
            started: false,
            paused: false,
            speed: 1,
            lastSpeed: 1,
            day: 1,
            dayProgress: 0,  // 0 to 1
            resources: {
                wood: 60,
                stone: 30,
                iron: 0,
                food: 40,
            },
            maxStorage: BASE_STORAGE,
            populationCap: 0,
            populationUsed: 0,
            starvationDays: 0,
            gameOver: false,
            milestones: [],       // ids of achieved milestones
            storageWarned: {},    // resource -> true once "storage full" was shown
            stats: { built: 0, demolished: 0, maxPop: 0 },
        };
    }

    let state = freshState();

    let callbacks = {
        onDayTick: null,
        onResourceChange: null,
        onNotification: null,
        onGameOver: null,
        onMilestone: null,
        onProduce: null,
        onBuildingsChanged: null,
    };

    function reset() {
        state = freshState();
        BuildingManager.reset();
    }

    function getState() {
        return state;
    }

    function setCallbacks(cbs) {
        Object.assign(callbacks, cbs);
    }

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

    // ---- Economy helpers ----
    function hasCastle() {
        return BuildingManager.countByType('castle') > 0;
    }

    function getProductionMultiplier(resource) {
        if (resource === 'food') return 1;
        let bonus = 0;
        BuildingManager.getAll().forEach(b => {
            if (b.def.provides?.productionBonus && b.active) bonus += b.def.provides.productionBonus;
        });
        return 1 + bonus;
    }

    // ---- Seasons ----
    function getSeason(day = state.day) {
        let d = (Math.max(1, day) - 1) % YEAR_DAYS;
        const year = Math.floor((Math.max(1, day) - 1) / YEAR_DAYS) + 1;
        for (let i = 0; i < SEASONS.length; i++) {
            const s = SEASONS[i];
            if (d < s.days) {
                // days until the next winter starts (0 while it is winter)
                let toWinter = 0;
                if (s.id !== 'winter') {
                    toWinter = s.days - d;
                    for (let j = i + 1; j < SEASONS.length && SEASONS[j].id !== 'winter'; j++) toWinter += SEASONS[j].days;
                }
                return { ...s, index: i, dayInSeason: d + 1, daysLeft: s.days - d, toWinter, year };
            }
            d -= s.days;
        }
        return { ...SEASONS[0], index: 0, dayInSeason: 1, daysLeft: SEASONS[0].days, toWinter: 0, year };
    }

    function getSeasonMultiplier(type, season = getSeason()) {
        const m = season.food[type];
        return m === undefined ? 1 : m;
    }

    // Production per day for a single building (after bonuses)
    function getBuildingOutput(b, season) {
        if (!b.def.production) return 0;
        let out = b.def.production.amount * getProductionMultiplier(b.def.production.resource);
        if (b.def.production.resource === 'food') out *= getSeasonMultiplier(b.type, season || getSeason());
        return out;
    }

    // Food balance per day during a given season (production minus what workers eat)
    function getFoodNetForSeason(seasonId) {
        const season = SEASONS.find(s => s.id === seasonId) || SEASONS[0];
        let prod = 0;
        BuildingManager.getProductionBuildings().forEach(b => {
            if (b.def.production.resource === 'food') prod += getBuildingOutput(b, season);
        });
        return prod - getFoodConsumption();
    }

    function getTrickle() {
        const out = { wood: 0, stone: 0, iron: 0, food: 0 };
        BuildingManager.getAll().forEach(b => {
            const tr = b.def.provides?.trickle;
            if (!tr) return;
            Object.entries(tr).forEach(([r, a]) => { out[r] += a; });
        });
        return out;
    }

    function getRates() {
        const rates = getTrickle();
        BuildingManager.getProductionBuildings().forEach(b => {
            rates[b.def.production.resource] += getBuildingOutput(b);
        });
        return rates;
    }

    function getFoodConsumption() {
        // Working villagers eat 1 food per day. Idle villagers forage for themselves.
        return state.populationUsed;
    }

    // ---- Building placement logic ----
    // Current price of the next building of a type (the first warehouse is free)
    function getCost(type) {
        const def = BUILDINGS[type];
        if (!def) return { wood: 0, stone: 0, iron: 0 };
        if (def.extraCost && BuildingManager.countByType(type) > 0) return def.extraCost;
        return def.cost;
    }

    function canAfford(type) {
        const def = BUILDINGS[type];
        if (!def) return false;
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

    function canPlace(type, tileX, tileY) {
        const def = BUILDINGS[type];
        if (!def) return { ok: false, reason: t('g.unknown') };

        const reason = getUnavailableReason(type);
        if (reason) return { ok: false, reason };

        if (!GameMap.isBuildable(tileX, tileY, def.width, def.height, BuildingManager.getAll())) {
            // Distinguish water from overlap for a better hint
            let water = false;
            for (let dy = 0; dy < def.height && !water; dy++) {
                for (let dx = 0; dx < def.width; dx++) {
                    const t = GameMap.getTerrain(tileX + dx, tileY + dy);
                    if (t === TERRAIN.WATER || t === TERRAIN.SAND) { water = true; break; }
                }
            }
            return { ok: false, reason: water ? t('g.water') : t('g.occupied') };
        }

        if (def.production?.requires) {
            if (!GameMap.hasNearbyResource(tileX, tileY, def.width, def.height, def.production.requires)) {
                return { ok: false, reason: def.production.requires === 'FOREST' ? t('g.nearforest') : t('g.nearstone') };
            }
        }

        return { ok: true };
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
        if (GameMap.clearArea(tileX, tileY, def.width, def.height) && typeof Renderer !== 'undefined') {
            Renderer.invalidateTerrainCache();
        }

        if (def.workers > 0) {
            building.workers = def.workers;
            building.active = true;
            state.populationUsed += def.workers;
        }

        if (def.provides.populationCap) state.populationCap += def.provides.populationCap;
        if (def.provides.storage) state.maxStorage += def.provides.storage;

        state.stats.built++;
        state.stats.maxPop = Math.max(state.stats.maxPop, state.populationUsed);

        if (callbacks.onResourceChange) callbacks.onResourceChange();
        if (callbacks.onBuildingsChanged) callbacks.onBuildingsChanged();
        notify(t('g.built', { name: bName(def) }), 'success');
        checkMilestones();
        save();

        return building;
    }

    function canDemolish(building) {
        if (!building) return { ok: false, reason: t('g.notavailable') };
        if (building.type === 'castle') return { ok: false, reason: t('g.castlenodemolish') };
        if (building.def.provides.populationCap) {
            // Removing housing must not strand working villagers
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
        // Refund part of the cost
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

    // ---- Day tick logic ----
    function update(deltaMs) {
        if (!state.started || state.paused || state.gameOver) return;
        // The calendar only starts once the castle stands
        if (!hasCastle()) return;

        const dayDuration = BASE_DAY_DURATION / state.speed;
        state.dayProgress += deltaMs / dayDuration;

        let ticks = 0;
        while (state.dayProgress >= 1 && ticks < 10) {
            state.dayProgress -= 1;
            processDayTick();
            ticks++;
        }
        if (state.dayProgress >= 1) state.dayProgress = 0; // guard against huge deltas (tab was hidden)
    }

    function processDayTick() {
        const prevSeason = getSeason(state.day).id;
        state.day++;
        const season = getSeason(state.day);
        if (season.id !== prevSeason && callbacks.onSeasonChange) callbacks.onSeasonChange(season);

        // Winter warning with a concrete stockpile target
        if (season.id !== 'winter' && season.toWinter === WINTER_WARNING_DAYS) {
            const winter = SEASONS.find(s => s.id === 'winter');
            const need = Math.max(0, Math.ceil(-getFoodNetForSeason('winter') * winter.days));
            if (need > state.maxStorage) notify(t('season.warn.storage', { n: WINTER_WARNING_DAYS, food: need, max: state.maxStorage }), 'danger');
            else if (need > state.resources.food) notify(t('season.warn', { n: WINTER_WARNING_DAYS, food: need }), 'warning');
            else notify(t('season.warn.ok', { n: WINTER_WARNING_DAYS }), 'info');
        }

        // Production
        // Small base income from the castle
        Object.entries(getTrickle()).forEach(([r, a]) => {
            if (a > 0) state.resources[r] = Math.min(state.maxStorage, state.resources[r] + a);
        });

        const producers = BuildingManager.getProductionBuildings();
        producers.forEach(b => {
            const res = b.def.production.resource;
            const amount = getBuildingOutput(b);
            const before = state.resources[res];
            state.resources[res] = Math.min(before + amount, state.maxStorage);
            const gained = state.resources[res] - before;
            if (callbacks.onProduce) callbacks.onProduce(b, res, gained);
            if (gained < amount - 0.001 && !state.storageWarned[res]) {
                state.storageWarned[res] = true;
                notify(t('g.storagefull', { res: resName(res) }), 'warning');
            }
            if (gained >= amount - 0.001 && state.resources[res] < state.maxStorage * 0.9) {
                state.storageWarned[res] = false;
            }
        });

        // Growth for orchards / farms (dormant in winter)
        BuildingManager.getAll().forEach(b => {
            if (season.growth && b.def.production?.growthDays && !b.grown) {
                b.growthProgress++;
                if (b.growthProgress >= b.def.production.growthDays) {
                    b.grown = true;
                    notify(t('g.producing', { name: bName(b.def) }), 'grown');
                }
            }
        });

        // Food consumption
        const foodNeeded = getFoodConsumption();
        if (foodNeeded > 0) {
            if (state.resources.food >= foodNeeded) {
                state.resources.food -= foodNeeded;
                if (state.starvationDays > 0) notify(t('g.fedagain'), 'success');
                state.starvationDays = 0;
            } else {
                state.resources.food = 0;
                state.starvationDays++;
                if (state.starvationDays >= STARVATION_LIMIT) {
                    state.gameOver = true;
                    clearSave();
                    if (callbacks.onGameOver) callbacks.onGameOver();
                } else {
                    notify(t('g.starving', { a: state.starvationDays, b: STARVATION_LIMIT }), 'danger');
                }
            }
        }

        // Low food warning (a few days ahead)
        const rates = getRates();
        const net = rates.food - foodNeeded;
        if (net < 0 && state.resources.food > 0 && state.resources.food <= -net * 4 && state.day % 3 === 0) {
            const daysLeft = Math.ceil(state.resources.food / -net);
            notify(t('g.foodout', { n: daysLeft, unit: daysLeft === 1 ? t('day') : t('days') }), 'warning');
        }

        checkMilestones();

        if (callbacks.onDayTick) callbacks.onDayTick();
        if (callbacks.onResourceChange) callbacks.onResourceChange();

        if (state.day % 5 === 0) save();
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

    // Check if a building type's button should be enabled
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
                version: 2,
                seed: GameMap.getSeed(),
                state: Object.assign({}, state, { started: true }),
                buildings: BuildingManager.serialize(),
                savedAt: Date.now(),
            };
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        } catch (e) { /* storage might be unavailable */ }
    }

    function hasSave() {
        try {
            return !!localStorage.getItem(SAVE_KEY);
        } catch (e) { return false; }
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
            if (!data || data.version !== 2) return false;
            GameMap.generate(data.seed);
            state = Object.assign(freshState(), data.state);
            state.paused = false;
            state.speed = state.lastSpeed || 1;
            state.gameOver = false;
            state.started = true;
            BuildingManager.deserialize(data.buildings);
            BuildingManager.getAll().forEach(b => GameMap.clearArea(b.tileX, b.tileY, b.def.width, b.def.height));
            return true;
        } catch (e) {
            return false;
        }
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
        getProductionMultiplier,
        getNextMilestone,
        hasCastle,
        save,
        load,
        hasSave,
        getSaveInfo,
        clearSave,
    };
})();
