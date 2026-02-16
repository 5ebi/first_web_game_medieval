// ============================================
// Building Manager
// ============================================

const BuildingManager = (() => {
    let placedBuildings = [];
    let nextId = 1;

    function reset() {
        placedBuildings = [];
        nextId = 1;
    }

    function place(type, tileX, tileY) {
        const def = BUILDINGS[type];
        if (!def) return null;

        const building = {
            id: nextId++,
            type: type,
            def: def,
            tileX: tileX,
            tileY: tileY,
            pixelX: tileX * TILE_SIZE,
            pixelY: tileY * TILE_SIZE,
            width: def.width * TILE_SIZE,
            height: def.height * TILE_SIZE,
            workers: 0,
            maxWorkers: def.workers,
            active: def.workers === 0, // Buildings with no workers are immediately active
            dayPlaced: 0,
            grown: def.production?.growthDays ? false : true,
            growthProgress: 0,
        };

        placedBuildings.push(building);
        return building;
    }

    function remove(id) {
        placedBuildings = placedBuildings.filter(b => b.id !== id);
    }

    function getAll() {
        return placedBuildings;
    }

    function getById(id) {
        return placedBuildings.find(b => b.id === id);
    }

    function getBuildingAt(tileX, tileY) {
        return placedBuildings.find(b =>
            tileX >= b.tileX && tileX < b.tileX + b.def.width &&
            tileY >= b.tileY && tileY < b.tileY + b.def.height
        );
    }

    function countByType(type) {
        return placedBuildings.filter(b => b.type === type).length;
    }

    function getProductionBuildings() {
        return placedBuildings.filter(b => b.def.production && b.active && b.grown);
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
    };
})();
