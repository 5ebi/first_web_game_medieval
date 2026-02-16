// ============================================
// Game State & Logic
// ============================================

const Game = (() => {
    let state = {
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
        maxStorage: 100,  // Base storage, increases with warehouse
        populationCap: 0,
        populationUsed: 0,
        starvationDays: 0,
        gameOver: false,
    };

    let callbacks = {
        onDayTick: null,
        onResourceChange: null,
        onNotification: null,
        onGameOver: null,
    };

    function reset() {
        state = {
            started: false,
            paused: false,
            speed: 1,
            day: 1,
            dayProgress: 0,
            resources: {
                wood: 50,
                stone: 30,
                iron: 0,
                food: 40,
            },
            maxStorage: 100,
            populationCap: 0,
            populationUsed: 0,
            starvationDays: 0,
            gameOver: false,
        };
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

    function setSpeed(speed) {
        state.speed = speed;
        state.paused = speed === 0;
    }

    // ---- Building placement logic ----
    function canAfford(type) {
        const def = BUILDINGS[type];
        if (!def) return false;
        return def.cost.wood <= state.resources.wood &&
               def.cost.stone <= state.resources.stone &&
               def.cost.iron <= state.resources.iron;
    }

    function canPlace(type, tileX, tileY) {
        const def = BUILDINGS[type];
        if (!def) return { ok: false, reason: 'Unknown building type' };

        // Check limit
        if (def.limit !== null && BuildingManager.countByType(type) >= def.limit) {
            return { ok: false, reason: `You can only build ${def.limit} ${def.name}` };
        }

        // Check affordability
        if (!canAfford(type)) {
            return { ok: false, reason: 'Not enough resources' };
        }

        // Check available workers
        const freeWorkers = state.populationCap - state.populationUsed;
        if (def.workers > freeWorkers) {
            return { ok: false, reason: `Need ${def.workers} free villagers (have ${freeWorkers})` };
        }

        // Check terrain
        if (!GameMap.isBuildable(tileX, tileY, def.width, def.height, BuildingManager.getAll())) {
            return { ok: false, reason: 'Cannot build here' };
        }

        // Check resource proximity for production buildings
        if (def.production?.requires) {
            if (!GameMap.hasNearbyResource(tileX, tileY, def.width, def.height, def.production.requires)) {
                return { ok: false, reason: `Must be near ${def.production.requires === 'FOREST' ? 'trees' : 'stone deposits'}` };
            }
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
            state.populationUsed += def.workers;
        }

        // Apply provides
        if (def.provides.populationCap) {
            state.populationCap += def.provides.populationCap;
        }
        if (def.provides.storage) {
            state.maxStorage += def.provides.storage;
        }

        // Start the day timer when the castle is placed
        if (type === 'castle' && !state.started) {
            state.started = true;
            state.paused = false;
            if (callbacks.onNotification) callbacks.onNotification('The days begin! Manage your resources wisely.', 'info');
        }

        if (callbacks.onResourceChange) callbacks.onResourceChange();
        if (callbacks.onNotification) callbacks.onNotification(`${def.name} built!`, 'success');

        return building;
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
        const def = BUILDINGS[type];
        if (!def) return false;

        // Check limit
        if (def.limit !== null && BuildingManager.countByType(type) >= def.limit) return false;

        // Castle must be first building
        if (type !== 'castle' && BuildingManager.countByType('castle') === 0) return false;

        // Need castle first for everything else
        if (type === 'warehouse' && BuildingManager.countByType('castle') === 0) return false;

        return canAfford(type);
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
        canAfford,
        canPlace,
        placeBuilding,
        update,
        isBuildingAvailable,
        getFreeWorkers,
    };
})();
