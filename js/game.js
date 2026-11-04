// ============================================
// Game State & Logic
// ============================================

const Game = (() => {
    function freshState() {
        return {
            started: false,
            paused: false,
            speed: 1,
            day: 1,
            dayProgress: 0,  // 0 to 1
            resources: {
                wood: 50,
                stone: 30,
                iron: 0,
                food: 40,
            },
            maxStorage: BASE_STORAGE,  // increases with warehouse
            populationCap: 0,
            populationUsed: 0,
            starvationDays: 0,
            gameOver: false,
        };
    }

    let state = freshState();

    let callbacks = {
        onDayTick: null,
        onResourceChange: null,
        onNotification: null,
        onGameOver: null,
        onBuildingPlaced: null,
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

    function start() {
        state.started = true;
        state.paused = false;
    }

    // speed 0 = pause; pausing keeps the chosen speed so unpausing restores it
    function setSpeed(speed) {
        if (speed === 0) {
            state.paused = true;
            return;
        }
        state.speed = speed;
        state.paused = false;
    }

    function togglePause() {
        state.paused = !state.paused;
    }

    // ---- Building placement logic ----
    function canAfford(type) {
        const def = BUILDINGS[type];
        if (!def) return false;
        return def.cost.wood <= state.resources.wood &&
               def.cost.stone <= state.resources.stone &&
               def.cost.iron <= state.resources.iron;
    }

    const RESOURCE_LABELS = { FOREST: 'trees', STONE_DEPOSIT: 'stone deposits' };

    function getMissingCost(type) {
        const def = BUILDINGS[type];
        return ['wood', 'stone', 'iron']
            .filter(res => def.cost[res] > state.resources[res])
            .map(res => ({ res, amount: Math.ceil(def.cost[res] - state.resources[res]) }));
    }

    // Why this building type can't be built anywhere right now, or null
    function getBuildBlocker(type) {
        const def = BUILDINGS[type];
        if (!def) return 'Unknown building type';
        if (def.limit !== null && BuildingManager.countByType(type) >= def.limit) {
            return def.limit === 1 ? `You already have a ${def.name}` : `Only ${def.limit} ${def.name} allowed`;
        }
        if (type !== 'castle' && BuildingManager.countByType('castle') === 0) {
            return 'Build your Castle first';
        }
        const missing = getMissingCost(type);
        if (missing.length > 0) {
            return 'Need ' + missing.map(m => `${m.amount} more ${m.res}`).join(', ');
        }
        const freeWorkers = getFreeWorkers();
        if (def.workers > freeWorkers) {
            return `Needs ${def.workers} free villagers (${freeWorkers} free). Build a House.`;
        }
        return null;
    }

    function canPlace(type, tileX, tileY) {
        const def = BUILDINGS[type];
        if (!def) return { ok: false, reason: 'Unknown building type' };

        const blocker = getBuildBlocker(type);
        if (blocker) return { ok: false, reason: blocker };

        // Terrain, map edge and other buildings
        const areaProblem = GameMap.checkArea(tileX, tileY, def.width, def.height, BuildingManager.getAll());
        if (areaProblem) return { ok: false, reason: areaProblem };

        // Resource proximity for production buildings
        const req = def.production?.requires;
        if (req && !GameMap.hasNearbyResource(tileX, tileY, def.width, def.height, req)) {
            return { ok: false, reason: `Must be within ${RESOURCE_RADIUS} tiles of ${RESOURCE_LABELS[req] || req}` };
        }

        return { ok: true };
    }

    function placeBuilding(type, tileX, tileY) {
        const check = canPlace(type, tileX, tileY);
        if (!check.ok) {
            if (callbacks.onNotification) callbacks.onNotification(check.reason, 'warning');
            return null;
        }

        const def = BUILDINGS[type];

        // Deduct cost
        state.resources.wood -= def.cost.wood;
        state.resources.stone -= def.cost.stone;
        state.resources.iron -= def.cost.iron;

        // Place building
        const building = BuildingManager.place(type, tileX, tileY);
        building.dayPlaced = state.day;

        // Auto-assign workers
        if (def.workers > 0) {
            building.workers = def.workers;
            building.active = true;
        }

        // Population cap, workers in use and storage all derive from the buildings
        recalcDerived();

        // Start the day timer when the castle is placed
        const firstCastle = type === 'castle' && !state.started;
        if (firstCastle) {
            state.started = true;
            state.paused = false;
        }

        if (callbacks.onResourceChange) callbacks.onResourceChange();
        if (callbacks.onNotification) {
            callbacks.onNotification(firstCastle ? 'Castle built! The days begin.' : `${def.name} built!`, 'success');
        }
        if (callbacks.onBuildingPlaced) callbacks.onBuildingPlaced(building);

        return building;
    }

    function recalcDerived() {
        let populationCap = 0;
        let populationUsed = 0;
        let maxStorage = BASE_STORAGE;
        BuildingManager.getAll().forEach(b => {
            populationCap += b.def.provides.populationCap || 0;
            maxStorage += b.def.provides.storage || 0;
            populationUsed += b.workers;
        });
        state.populationCap = populationCap;
        state.populationUsed = populationUsed;
        state.maxStorage = maxStorage;
    }

    // ---- Save / load ----
    function serialize() {
        return {
            day: state.day,
            dayProgress: state.dayProgress,
            speed: state.speed,
            paused: state.paused,
            resources: { ...state.resources },
            starvationDays: state.starvationDays,
            buildings: BuildingManager.getAll().map(b => ({
                type: b.type,
                tileX: b.tileX,
                tileY: b.tileY,
                workers: b.workers,
                growthProgress: b.growthProgress,
                grown: b.grown,
                dayPlaced: b.dayPlaced,
            })),
        };
    }

    function load(data) {
        reset();
        const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);

        (data.buildings || []).forEach(sb => {
            const def = BUILDINGS[sb.type];
            if (!def) return;
            const b = BuildingManager.place(sb.type, num(sb.tileX, 0), num(sb.tileY, 0));
            b.workers = Math.min(num(sb.workers, def.workers), def.workers);
            b.active = def.workers === 0 || b.workers > 0;
            b.growthProgress = num(sb.growthProgress, 0);
            b.grown = def.production?.growthDays ? !!sb.grown : true;
            b.dayPlaced = num(sb.dayPlaced, 1);
        });
        recalcDerived();

        const res = data.resources || {};
        Object.keys(state.resources).forEach(k => {
            state.resources[k] = Math.max(0, num(res[k], state.resources[k]));
        });
        state.day = Math.max(1, Math.floor(num(data.day, 1)));
        state.dayProgress = Math.min(Math.max(num(data.dayProgress, 0), 0), 0.999);
        state.speed = [1, 2, 3].includes(data.speed) ? data.speed : 1;
        state.paused = !!data.paused;
        state.starvationDays = Math.max(0, Math.floor(num(data.starvationDays, 0)));
        state.started = BuildingManager.countByType('castle') > 0;
    }

    // ---- Day tick logic ----
    function update(deltaMs) {
        if (!state.started || state.paused || state.gameOver) return;

        const dayDuration = BASE_DAY_DURATION / state.speed;
        state.dayProgress += deltaMs / dayDuration;

        while (state.dayProgress >= 1) {
            state.dayProgress -= 1;
            processDayTick();
        }
    }

    function processDayTick() {
        state.day++;

        // Production
        const producers = BuildingManager.getProductionBuildings();
        producers.forEach(b => {
            const res = b.def.production.resource;
            const amount = b.def.production.amount;
            state.resources[res] = Math.min(state.resources[res] + amount, state.maxStorage);
        });

        // Growth for orchards
        BuildingManager.getAll().forEach(b => {
            if (b.def.production?.growthDays && !b.grown) {
                b.growthProgress++;
                if (b.growthProgress >= b.def.production.growthDays) {
                    b.grown = true;
                    if (callbacks.onNotification) {
                        callbacks.onNotification(`${b.def.name} is now producing!`, 'success');
                    }
                }
            }
        });

        // Food consumption: 1 food per villager per day
        // All villagers in the settlement eat, whether working or idle
        const foodNeeded = state.populationCap;

        if (foodNeeded > 0) {
            if (state.resources.food >= foodNeeded) {
                state.resources.food -= foodNeeded;
                state.starvationDays = 0;
            } else {
                // Partial food - eat what's available
                state.resources.food = 0;
                state.starvationDays++;

                if (state.starvationDays >= 3) {
                    // Game over
                    state.gameOver = true;
                    if (callbacks.onGameOver) callbacks.onGameOver();
                } else {
                    if (callbacks.onNotification) {
                        callbacks.onNotification(`Your people are starving! (${state.starvationDays}/3 days)`, 'warning');
                    }
                }
            }
        }

        // Warnings
        if (state.resources.food <= foodNeeded * 3 && state.resources.food > 0 && state.day % 5 === 0) {
            if (callbacks.onNotification) {
                callbacks.onNotification('Food supplies running low!', 'warning');
            }
        }

        if (callbacks.onDayTick) callbacks.onDayTick();
        if (callbacks.onResourceChange) callbacks.onResourceChange();
    }

    // Check if a building type's button should be enabled
    function isBuildingAvailable(type) {
        return getBuildBlocker(type) === null;
    }

    function getFreeWorkers() {
        return state.populationCap - state.populationUsed;
    }

    return {
        reset,
        getState,
        setCallbacks,
        start,
        setSpeed,
        togglePause,
        canAfford,
        canPlace,
        placeBuilding,
        update,
        isBuildingAvailable,
        getBuildBlocker,
        getMissingCost,
        getFreeWorkers,
        serialize,
        load,
    };
})();
