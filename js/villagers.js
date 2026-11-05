// ============================================
// Villagers - little animated workers around their buildings
// Purely cosmetic: they bring the village to life.
// ============================================

const Villagers = (() => {
    let list = [];
    let nextId = 1;

    function reset() {
        list = [];
        nextId = 1;
    }

    // Make sure every active building with workers has its villagers
    function sync(buildings) {
        const wanted = new Map(); // buildingId -> count
        buildings.forEach(b => {
            if (b.workers > 0 && b.active && !b.buildStart) wanted.set(b.id, b.workers);
        });

        // Remove villagers of missing buildings
        list = list.filter(v => wanted.has(v.buildingId));

        // Add missing villagers
        wanted.forEach((count, buildingId) => {
            const have = list.filter(v => v.buildingId === buildingId).length;
            const b = buildings.find(x => x.id === buildingId);
            for (let i = have; i < count; i++) {
                list.push(spawn(b, i));
            }
        });
    }

    function spawn(b, index) {
        const cx = b.pixelX + b.width / 2;
        const cy = b.pixelY + b.height + 6;
        const v = {
            id: nextId++,
            buildingId: b.id,
            homeX: cx,
            homeY: cy,
            x: cx + (Math.random() - 0.5) * b.width,
            y: cy + Math.random() * 16,
            tx: cx,
            ty: cy,
            speed: 18 + Math.random() * 10, // px per second
            palette: (b.id * 3 + index) % 6,
            frame: 0,
            animT: Math.random(),
            waitT: Math.random() * 2,
            flip: false,
            working: false,
            workT: 0,
        };
        pickTarget(v, b);
        return v;
    }

    function pickTarget(v, b) {
        // wander in a radius around the building's base, biased to the front
        const r = 1.5 * TILE_SIZE + Math.random() * 1.5 * TILE_SIZE;
        const a = Math.random() * Math.PI * 2;
        let tx = v.homeX + Math.cos(a) * r;
        let ty = v.homeY + Math.sin(a) * r * 0.6;
        // keep them off water and inside the map
        const tile = { x: Math.floor(tx / TILE_SIZE), y: Math.floor(ty / TILE_SIZE) };
        const t = GameMap.getTerrain(tile.x, tile.y);
        if (t === TERRAIN.WATER) { tx = v.homeX; ty = v.homeY; }
        v.tx = Math.max(4, Math.min(MAP_PIXEL_W - 4, tx));
        v.ty = Math.max(4, Math.min(MAP_PIXEL_H - 4, ty));
    }

    function update(dtSec) {
        if (dtSec <= 0) return;
        list.forEach(v => {
            if (v.waitT > 0) {
                v.waitT -= dtSec;
                // idle: "work" bob
                v.workT += dtSec;
                v.frame = Math.floor(v.workT * 4) % 2;
                if (v.waitT <= 0) {
                    const b = BuildingManager.getById(v.buildingId);
                    if (b) pickTarget(v, b);
                }
                return;
            }
            const dx = v.tx - v.x;
            const dy = v.ty - v.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 1.5) {
                v.waitT = 1 + Math.random() * 3;
                v.frame = 0;
                return;
            }
            const stepLen = Math.min(dist, v.speed * dtSec);
            v.x += dx / dist * stepLen;
            v.y += dy / dist * stepLen;
            v.flip = dx < 0;
            v.animT += dtSec * 6;
            v.frame = Math.floor(v.animT) % 2;
        });
    }

    function getAll() { return list; }

    return { reset, sync, update, getAll };
})();
