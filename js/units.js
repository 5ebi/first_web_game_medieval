// ============================================
// Units - soldiers recruited at the barracks. For now they only stand in
// formation next to their barracks (idle animation); selection, movement and
// combat come later. Soldiers are part of the game state and are saved.
// ============================================

const Units = (() => {
    let list = [];
    let nextId = 1;
    const COLS = 5;          // soldiers per row in front of the barracks
    const SPACING_X = 12, SPACING_Y = 11;

    function reset() {
        list = [];
        nextId = 1;
    }

    // Free spot in the formation in front of (below) a barracks
    function slotNear(b) {
        const taken = list.filter(u => u.barracksId === b.id).map(u => u.slot);
        let slot = 0;
        while (taken.includes(slot)) slot++;
        const cols = Math.max(COLS, Math.floor((b.width - 8) / SPACING_X));
        const x0 = b.pixelX + Math.round((b.width - (cols - 1) * SPACING_X) / 2);
        const x = x0 + (slot % cols) * SPACING_X + (Math.floor(slot / cols) % 2) * 5;
        const y = b.pixelY + b.height + 9 + Math.floor(slot / cols) * SPACING_Y;
        return { slot, x: Math.max(4, Math.min(MAP_PIXEL_W - 4, x)), y: Math.max(4, Math.min(MAP_PIXEL_H - 4, y)) };
    }

    function add(type, barracks) {
        const wkey = UNIT_WEAPON[type];
        if (!wkey) return null;
        const spot = slotNear(barracks);
        const u = {
            id: nextId++,
            type,
            x: spot.x,
            y: spot.y,
            hp: WEAPONS[wkey].hp,
            maxHp: WEAPONS[wkey].hp,
            state: 'idle',
            barracksId: barracks.id,
            slot: spot.slot,
            flip: false,
            frame: 0,
            t: Math.random() * 10,
        };
        list.push(u);
        return u;
    }

    function remove(id) { list = list.filter(u => u.id !== id); }

    // Idle life: breathing, now and then a look to the other side
    function update(dtSec) {
        if (dtSec <= 0) return;
        for (let i = 0; i < list.length; i++) {
            const u = list[i];
            u.t += dtSec;
            u.frame = Math.floor(u.t * 1.2) % 2;
            if (u.t > 8 + (u.id % 5)) { u.t = 0; u.flip = !u.flip && Math.random() < 0.35; }
        }
    }

    // Soldier under a world point (generous hit box around the sprite)
    function pick(wx, wy) {
        let best = null, bd = 1e9;
        list.forEach(u => {
            if (wx < u.x - 7 || wx > u.x + 7 || wy < u.y - 24 || wy > u.y + 3) return;
            const d = Math.abs(wx - u.x) + Math.abs(wy - (u.y - 10));
            if (d < bd) { bd = d; best = u; }
        });
        return best;
    }

    function getAll() { return list; }
    function getById(id) { return list.find(u => u.id === id) || null; }
    function countByType(type) { return list.filter(u => u.type === type).length; }

    // ---- Save / load ----
    function serialize() {
        return list.map(u => ({ id: u.id, type: u.type, x: u.x, y: u.y, hp: u.hp, state: u.state, barracksId: u.barracksId, slot: u.slot }));
    }

    function deserialize(saved) {
        reset();
        (saved || []).forEach(s => {
            const wkey = UNIT_WEAPON[s.type];
            if (!wkey) return;
            const maxHp = WEAPONS[wkey].hp;
            list.push({
                id: s.id, type: s.type, x: s.x, y: s.y,
                hp: Math.min(maxHp, s.hp ?? maxHp), maxHp,
                state: s.state || 'idle', barracksId: s.barracksId ?? null, slot: s.slot ?? 0,
                flip: false, frame: 0, t: Math.random() * 10,
            });
            nextId = Math.max(nextId, (s.id || 0) + 1);
        });
    }

    return { reset, add, remove, update, pick, getAll, getById, countByType, serialize, deserialize };
})();
