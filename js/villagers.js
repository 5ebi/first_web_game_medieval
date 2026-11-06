// ============================================
// Villagers - the workers of each building, walking real work routes:
// out to their resource (forest, stone field), working there, and carrying
// the goods back. Purely cosmetic, but every villager can be clicked to see
// who they are and what they are doing.
// ============================================

const Villagers = (() => {
    let list = [];
    let nextId = 1;

    // What each workplace's people do
    const JOBS = {
        lumberjack: { job: 'woodcutter', tool: 'axe', resource: 'FOREST', carry: 'wood', work: [5, 8] },
        hunter:     { job: 'hunter', tool: 'bow', resource: 'FOREST', carry: 'food', work: [6, 10], hunt: true },
        quarry:     { job: 'mason', tool: 'pick', resource: 'STONE_DEPOSIT', carry: 'stone', work: [5, 8] },
        iron_mine:  { job: 'miner', tool: 'pick', resource: 'STONE_DEPOSIT', carry: 'iron', work: [6, 9] },
        blacksmith: { job: 'smith', tool: 'hammer', resource: null, carry: null, work: [4, 7] },
    };

    const NAMES = {
        m: ['Aldric', 'Bertram', 'Cedric', 'Edwin', 'Godric', 'Hugh', 'Jasper', 'Leofric', 'Osric', 'Roland', 'Tobias', 'Walter', 'Wulfric', 'Ambrose', 'Gilbert', 'Hamon', 'Odo', 'Piers', 'Randal', 'Simon'],
        f: ['Agnes', 'Beatrice', 'Cecily', 'Edith', 'Elena', 'Gisela', 'Hilda', 'Isolde', 'Joan', 'Matilda', 'Maud', 'Rosamund', 'Sybil', 'Wynne', 'Alice', 'Emma', 'Ida', 'Margery'],
    };

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
        const seen = new Map();
        list = list.filter(v => {
            if (!wanted.has(v.buildingId)) return false;
            const n = (seen.get(v.buildingId) || 0) + 1;
            seen.set(v.buildingId, n);
            return n <= wanted.get(v.buildingId);
        });
        wanted.forEach((count, buildingId) => {
            const have = list.filter(v => v.buildingId === buildingId).length;
            const b = buildings.find(x => x.id === buildingId);
            for (let i = have; i < count; i++) list.push(spawn(b, i));
        });
    }

    function hashName(seed) {
        const female = seed % 3 === 1;
        const pool = female ? NAMES.f : NAMES.m;
        return pool[(seed * 7 + 3) % pool.length];
    }

    function spawn(b, index) {
        const cx = b.pixelX + b.width / 2;
        const cy = b.pixelY + b.height + 4;
        const job = JOBS[b.type] || { job: 'worker', tool: null, resource: null, carry: null, work: [3, 6] };
        const seed = b.id * 13 + index * 5 + nextId;
        const v = {
            id: nextId++,
            buildingId: b.id,
            buildingType: b.type,
            job: job.job,
            name: hashName(seed),
            homeX: cx + (index - 1) * 6,
            homeY: cy,
            x: cx + (index - 1) * 6,
            y: cy,
            tx: cx, ty: cy,
            speed: 17 + Math.random() * 6, // px per game second
            palette: (b.id * 3 + index) % 6,
            tool: job.tool,
            carry: null,
            frame: 4,
            dist: 0,
            flip: false,
            state: 'idle',
            stateT: 0.5 + index * 1.2 + Math.random(), // stagger the crew
            workT: 0,
        };
        return v;
    }

    // A tile of the needed resource near the workplace (random among the closest ones)
    function findWorkSpot(v, b, resource) {
        const def = b.def;
        const R = typeof RESOURCE_RADIUS !== 'undefined' ? RESOURCE_RADIUS : 5;
        const spots = [];
        for (let dy = -R; dy < def.height + R; dy++) {
            for (let dx = -R; dx < def.width + R; dx++) {
                const tx = b.tileX + dx, ty = b.tileY + dy;
                if (GameMap.getTerrain(tx, ty) !== TERRAIN[resource]) continue;
                const inside = dx >= 0 && dy >= 0 && dx < def.width && dy < def.height;
                const px = tx * TILE_SIZE + 16, py = ty * TILE_SIZE + 22;
                const d = Math.hypot(px - v.homeX, py - v.homeY) + (inside ? 40 : 0);
                spots.push({ x: px, y: py, d });
            }
        }
        if (!spots.length) return null;
        spots.sort((a, c) => a.d - c.d);
        const s = spots[Math.floor(Math.random() * Math.min(6, spots.length))];
        return { x: s.x + (Math.random() - 0.5) * 18, y: s.y + (Math.random() - 0.5) * 8 };
    }

    function wanderSpot(v) {
        const a = Math.random() * Math.PI * 2;
        const r = 10 + Math.random() * 26;
        return { x: v.homeX + Math.cos(a) * r, y: v.homeY + 6 + Math.abs(Math.sin(a)) * r * 0.5 };
    }

    function setTarget(v, p) {
        let tx = Math.max(4, Math.min(MAP_PIXEL_W - 4, p.x));
        let ty = Math.max(4, Math.min(MAP_PIXEL_H - 4, p.y));
        if (GameMap.getTerrain(Math.floor(tx / TILE_SIZE), Math.floor(ty / TILE_SIZE)) === TERRAIN.WATER) { tx = v.homeX; ty = v.homeY; }
        v.tx = tx; v.ty = ty;
    }

    function nextState(v, b) {
        const job = JOBS[b.type];
        switch (v.state) {
            case 'idle':
            case 'deliver':
                if (job && job.resource) {
                    const spot = findWorkSpot(v, b, job.resource);
                    if (spot) { setTarget(v, spot); v.state = 'toWork'; v.carry = null; return; }
                }
                if (job && !job.resource) { // smith: work right at the forge
                    setTarget(v, { x: v.homeX + 10, y: v.homeY + 2 }); v.state = 'toWork'; return;
                }
                setTarget(v, wanderSpot(v)); v.state = 'stroll';
                return;
            case 'toWork':
                v.state = 'working';
                v.stateT = job ? job.work[0] + Math.random() * (job.work[1] - job.work[0]) : 3;
                return;
            case 'working':
                if (job && job.carry) {
                    v.carry = job.carry;
                    setTarget(v, { x: v.homeX, y: v.homeY });
                    v.state = 'toHome';
                } else {
                    v.state = 'idle';
                    v.stateT = 1 + Math.random() * 2;
                }
                return;
            case 'toHome':
                v.state = 'deliver';
                v.carry = null;
                v.stateT = 0.8 + Math.random() * 1.2;
                return;
            case 'stroll':
                v.state = 'idle';
                v.stateT = 1 + Math.random() * 3;
                return;
        }
    }

    function update(dtSec) {
        if (dtSec <= 0) return;
        list.forEach(v => {
            const b = BuildingManager.getById(v.buildingId);
            if (!b) return;
            const moving = v.state === 'toWork' || v.state === 'toHome' || v.state === 'stroll';
            if (!moving) {
                v.stateT -= dtSec;
                if (v.state === 'working') {
                    const job = JOBS[b.type];
                    v.workT += dtSec;
                    if (job && job.hunt) v.frame = 4;                       // hunter: waits, watching
                    else v.frame = Math.floor(v.workT * 2.4) % 2 ? 6 : 5;  // swing
                } else {
                    v.frame = 4;
                }
                if (v.stateT <= 0) nextState(v, b);
                return;
            }
            const dx = v.tx - v.x, dy = v.ty - v.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 1) { v.x = v.tx; v.y = v.ty; v.frame = 4; nextState(v, b); return; }
            const speed = v.speed * (v.carry ? 0.8 : 1);
            const stepLen = Math.min(dist, speed * dtSec);
            v.x += dx / dist * stepLen;
            v.y += dy / dist * stepLen;
            if (Math.abs(dx) > 0.3) v.flip = dx < 0;
            // the walk cycle follows the distance covered, so feet never slide
            v.dist += stepLen;
            v.frame = Math.floor(v.dist / 3.2) % 4;
        });
    }

    // Activity text key for the info panel
    function activity(v) {
        const job = JOBS[v.buildingType];
        switch (v.state) {
            case 'toWork': return job && job.resource ? 'vil.act.towork.' + v.job : 'vil.act.towork';
            case 'working': return 'vil.act.work.' + v.job;
            case 'toHome': return 'vil.act.carry';
            case 'deliver': return 'vil.act.deliver';
            case 'stroll': return 'vil.act.stroll';
            default: return 'vil.act.rest';
        }
    }

    // Villager under a world point (generous hit box around the sprite)
    function pick(wx, wy) {
        let best = null, bd = 1e9;
        list.forEach(v => {
            if (wx < v.x - 7 || wx > v.x + 7 || wy < v.y - 24 || wy > v.y + 3) return;
            const d = Math.abs(wx - v.x) + Math.abs(wy - (v.y - 10));
            if (d < bd) { bd = d; best = v; }
        });
        return best;
    }

    function getAll() { return list; }
    function getById(id) { return list.find(v => v.id === id) || null; }

    return { reset, sync, update, getAll, getById, pick, activity };
})();
