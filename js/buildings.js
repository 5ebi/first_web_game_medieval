// ============================================
// Building Manager
// ============================================

const BuildingManager = (() => {
    let placedBuildings = [];
    let nextId = 1;
    let version = 0;   // bumps on every place / remove (placement tint and yields cache on it)

    function reset() {
        placedBuildings = [];
        nextId = 1;
        version++;
    }

    function getVersion() { return version; }

    // (x, y): top-left of the footprint in world pixels. pixelX/pixelY are the one
    // source of truth for the position; tiles are derived from them when needed.
    function place(type, x, y) {
        const def = BUILDINGS[type];
        if (!def) return null;

        const building = {
            id: nextId++,
            type: type,
            def: def,
            pixelX: Math.round(x),
            pixelY: Math.round(y),
            width: def.width * TILE_SIZE,
            height: def.height * TILE_SIZE,
            workers: 0,
            maxWorkers: def.workers,
            active: def.workers === 0, // Buildings with no workers are immediately active
            dayPlaced: 0,
            grown: def.production?.growthDays ? false : true,
            growthProgress: 0,
            buildStart: performance.now(), // construction animation (cosmetic)
        };
        if (def.crafts) {
            building.product = Object.keys(WEAPONS)[0]; // weapon smith: what it forges
            building.inputPaid = false;                // material for the current weapon taken
        }

        placedBuildings.push(building);
        version++;
        return building;
    }

    function remove(id) {
        placedBuildings = placedBuildings.filter(b => b.id !== id);
        version++;
    }

    function getAll() {
        return placedBuildings;
    }

    function getById(id) {
        return placedBuildings.find(b => b.id === id);
    }

    // Building whose footprint contains a world point
    function getBuildingAt(wx, wy) {
        return placedBuildings.find(b =>
            wx >= b.pixelX && wx < b.pixelX + b.width &&
            wy >= b.pixelY && wy < b.pixelY + b.height
        );
    }

    function countByType(type) {
        return placedBuildings.filter(b => b.type === type).length;
    }

    function getProductionBuildings() {
        return placedBuildings.filter(b => b.def.production && b.active && b.grown);
    }

    // ---- Save / load ----
    function serialize() {
        return placedBuildings.map(b => ({
            id: b.id,
            type: b.type,
            x: b.pixelX,
            y: b.pixelY,
            workers: b.workers,
            active: b.active,
            dayPlaced: b.dayPlaced,
            grown: b.grown,
            growthProgress: b.growthProgress,
            paid: b.paid,
            progress: b.progress || 0,
            product: b.product,
            inputPaid: b.inputPaid,
        }));
    }

    function deserialize(list) {
        reset();
        (list || []).forEach(s => {
            if (!BUILDINGS[s.type]) return;
            // saves before v5 stored tile positions
            const x = Number.isFinite(s.x) ? s.x : (s.tileX || 0) * TILE_SIZE;
            const y = Number.isFinite(s.y) ? s.y : (s.tileY || 0) * TILE_SIZE;
            const b = place(s.type, x, y);
            if (!b) return;
            b.id = s.id ?? b.id;
            b.workers = s.workers ?? 0;
            b.active = s.active ?? (b.maxWorkers === 0);
            b.dayPlaced = s.dayPlaced ?? 1;
            b.grown = s.grown ?? b.grown;
            b.growthProgress = s.growthProgress ?? 0;
            b.buildStart = 0; // loaded buildings are already finished
            if (s.paid) b.paid = s.paid;
            // saves from before lumberjacks had a price: they cost nothing, so refund nothing
            else if (s.type === 'lumberjack') b.paid = { wood: 0, stone: 0, iron: 0 };
            b.progress = s.progress || 0;
            if (b.def.crafts) {
                if (WEAPONS[s.product]) b.product = s.product;
                b.inputPaid = !!s.inputPaid;
            }
            nextId = Math.max(nextId, b.id + 1);
        });
    }

    return {
        reset,
        place,
        remove,
        getAll,
        getById,
        getBuildingAt,
        countByType,
        getProductionBuildings,
        getVersion,
        serialize,
        deserialize,
    };
})();
