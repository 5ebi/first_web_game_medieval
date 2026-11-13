// ============================================
// Units - soldiers recruited at the barracks. They stand in formation next to
// their barracks until the player selects them and sends them somewhere
// (move) or lets them walk between waypoints (patrol). Paths go around water
// and buildings (A* on tiles). No combat yet. Soldiers are saved.
//
// Unit states: 'idle' (standing guard), 'move' (walking to `dest`),
// 'patrol' (walking the loop `patrol.pts`, currently heading to `patrol.i`).
// ============================================

const Units = (() => {
    let list = [];
    let nextId = 1;
    const COLS = 5;          // soldiers per row in front of the barracks
    const SPACING_X = 12, SPACING_Y = 11;
    const SPEED = 24;        // px per game second (villagers walk ~20)
    const SPREAD = 12;       // px between soldiers of a group at the destination
    const MIN_GAP = 10;      // px a new target / spawn spot keeps from other soldiers
    const MIN_SEP = 10;      // px: standing soldiers closer than this push apart
    const PUSH_SPEED = 18;   // px per game second while pushing apart
    const selected = new Set();

    function reset() {
        list = [];
        nextId = 1;
        selected.clear();
    }

    // Free spot in the formation in front of (below) a barracks: skips slots
    // that are taken, under water or a building, or where a soldier stands
    function slotNear(b) {
        const taken = new Set(list.filter(u => u.barracksId === b.id).map(u => u.slot));
        const g = getGrid();
        const reserved = reservedSpots(null);
        const cols = Math.max(COLS, Math.floor((b.width - 8) / SPACING_X));
        const x0 = b.pixelX + Math.round((b.width - (cols - 1) * SPACING_X) / 2);
        let first = null;
        for (let slot = 0; slot < 80; slot++) {
            if (taken.has(slot)) continue;
            const x = x0 + (slot % cols) * SPACING_X + (Math.floor(slot / cols) % 2) * 5;
            const y = b.pixelY + b.height + 9 + Math.floor(slot / cols) * SPACING_Y;
            const spot = { slot, x: clampX(x), y: clampY(y) };
            if (!first) first = spot;
            if (spotFree(g, spot.x, spot.y, reserved)) return spot;
        }
        return first; // crowded: the separation step in update() sorts it out
    }

    function makeUnit(type, x, y, hp) {
        const wkey = UNIT_WEAPON[type];
        const maxHp = WEAPONS[wkey].hp;
        return {
            id: nextId++, type, x, y,
            hp: Math.min(maxHp, hp ?? maxHp), maxHp,
            state: 'idle', barracksId: null, slot: 0,
            dest: null,          // { x, y } for 'move'
            patrol: null,        // { pts: [{x, y}, ...], i } for 'patrol'
            path: null, pathI: 0, // current walk (tile centres), not saved
            flip: false, frame: 0, dist: 0,
            t: Math.random() * 10,
        };
    }

    function add(type, barracks) {
        if (!UNIT_WEAPON[type]) return null;
        const spot = slotNear(barracks);
        const u = makeUnit(type, spot.x, spot.y);
        u.barracksId = barracks.id;
        u.slot = spot.slot;
        list.push(u);
        return u;
    }

    function remove(id) { list = list.filter(u => u.id !== id); selected.delete(id); }

    // ---------- walkable grid + A* ----------
    // Water and building footprints block. The grid is rebuilt when the
    // buildings change (cheap: 80x60 tiles); paths are cached per grid.
    let grid = null, gridKey = '';
    const pathCache = new Map();

    function buildingsKey() {
        const all = BuildingManager.getAll();
        let k = all.length, s = 0;
        for (let i = 0; i < all.length; i++) s = (s * 31 + all[i].id * 7 + all[i].pixelX * 3 + all[i].pixelY) % 1000000007;
        return k + ':' + s + ':' + GameMap.getSeed();
    }

    function getGrid() {
        const key = buildingsKey();
        if (grid && key === gridKey) return grid;
        gridKey = key;
        pathCache.clear();
        grid = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
        for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
            if (GameMap.getTerrain(x, y) === TERRAIN.WATER) grid[y * MAP_WIDTH + x] = 1;
        }
        BuildingManager.getAll().forEach(b => {
            // a tile is blocked when a footprint covers any part of it
            const r = GameMap.rectTiles(b.pixelX, b.pixelY, b.width, b.height);
            for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
                if (x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT) grid[y * MAP_WIDTH + x] = 1;
            }
        });
        return grid;
    }

    function blocked(g, x, y) {
        return x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT || g[y * MAP_WIDTH + x] === 1;
    }

    // Closest walkable tile (rings outward)
    function nearestFree(g, tx, ty) {
        if (!blocked(g, tx, ty)) return { x: tx, y: ty };
        for (let r = 1; r < 12; r++) {
            let best = null, bd = 1e9;
            for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                if (blocked(g, tx + dx, ty + dy)) continue;
                const d = dx * dx + dy * dy;
                if (d < bd) { bd = d; best = { x: tx + dx, y: ty + dy }; }
            }
            if (best) return best;
        }
        return null;
    }

    // Reused A* buffers (no allocations per search beyond the result)
    const N = MAP_WIDTH * MAP_HEIGHT;
    const gScore = new Float32Array(N), came = new Int32Array(N), seen = new Uint32Array(N), closed = new Uint32Array(N);
    let stamp = 0;
    const heapF = [], heapI = [];
    function hPush(f, i) {
        let n = heapF.length; heapF.push(f); heapI.push(i);
        while (n > 0) {
            const p = (n - 1) >> 1;
            if (heapF[p] <= heapF[n]) break;
            [heapF[p], heapF[n]] = [heapF[n], heapF[p]]; [heapI[p], heapI[n]] = [heapI[n], heapI[p]];
            n = p;
        }
    }
    function hPop() {
        const top = heapI[0];
        const lf = heapF.pop(), li = heapI.pop();
        if (heapF.length) {
            heapF[0] = lf; heapI[0] = li;
            let n = 0;
            for (;;) {
                const l = n * 2 + 1, r = l + 1;
                let m = n;
                if (l < heapF.length && heapF[l] < heapF[m]) m = l;
                if (r < heapF.length && heapF[r] < heapF[m]) m = r;
                if (m === n) break;
                [heapF[m], heapF[n]] = [heapF[n], heapF[m]]; [heapI[m], heapI[n]] = [heapI[n], heapI[m]];
                n = m;
            }
        }
        return top;
    }

    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

    // Tile path from (sx, sy) to (tx, ty), both included; null if unreachable.
    // The start tile may be blocked (a soldier standing at a building's edge).
    function findPath(sx, sy, tx, ty) {
        const g = getGrid();
        const key = sx + ',' + sy + '>' + tx + ',' + ty;
        if (pathCache.has(key)) return pathCache.get(key);
        stamp++;
        heapF.length = 0; heapI.length = 0;
        const s = sy * MAP_WIDTH + sx, goal = ty * MAP_WIDTH + tx;
        gScore[s] = 0; came[s] = -1; seen[s] = stamp;
        const h = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
        hPush(h(sx, sy), s);
        let found = false, iter = 0;
        while (heapF.length && iter++ < N * 2) {
            const cur = hPop();
            if (closed[cur] === stamp) continue;
            closed[cur] = stamp;
            if (cur === goal) { found = true; break; }
            const cx = cur % MAP_WIDTH, cy = (cur / MAP_WIDTH) | 0;
            for (let d = 0; d < 8; d++) {
                const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
                if (blocked(g, nx, ny)) continue;
                // no cutting corners past water or walls
                if (DIRS[d][0] && DIRS[d][1] && (blocked(g, cx + DIRS[d][0], cy) || blocked(g, cx, cy + DIRS[d][1]))) continue;
                const ni = ny * MAP_WIDTH + nx;
                if (closed[ni] === stamp) continue;
                const ng = gScore[cur] + DIRS[d][2];
                if (seen[ni] === stamp && ng >= gScore[ni]) continue;
                seen[ni] = stamp; gScore[ni] = ng; came[ni] = cur;
                hPush(ng + h(nx, ny), ni);
            }
        }
        let result = null;
        if (found) {
            result = [];
            for (let i = goal; i !== -1; i = came[i]) result.push({ x: i % MAP_WIDTH, y: (i / MAP_WIDTH) | 0 });
            result.reverse();
            result = smooth(g, result);
        }
        if (pathCache.size > 200) pathCache.clear();
        pathCache.set(key, result);
        return result;
    }

    // Straight walk between two tiles possible? (samples the line, checks every tile it touches)
    function lineFree(g, a, b) {
        const ax = a.x + 0.5, ay = a.y + 0.5, bx = b.x + 0.5, by = b.y + 0.5;
        const n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 3);
        for (let i = 1; i < n; i++) {
            const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
            // a body is not a point: test a little to each side as well
            if (blocked(g, Math.floor(x - 0.2), Math.floor(y - 0.2)) || blocked(g, Math.floor(x + 0.2), Math.floor(y + 0.2)) ||
                blocked(g, Math.floor(x - 0.2), Math.floor(y + 0.2)) || blocked(g, Math.floor(x + 0.2), Math.floor(y - 0.2))) return false;
        }
        return true;
    }

    // Drop the tiles in between where the soldier can walk straight (no grid zigzag)
    function smooth(g, p) {
        if (p.length <= 2) return p;
        const out = [p[0]];
        let i = 0;
        while (i < p.length - 1) {
            let j = p.length - 1;
            while (j > i + 1 && !lineFree(g, p[i], p[j])) j--;
            out.push(p[j]);
            i = j;
        }
        return out;
    }

    // Plans a walk to a world point: waypoints in pixels, last one exactly the target
    function planWalk(u, wx, wy) {
        const g = getGrid();
        const st = { x: Math.floor(u.x / TILE_SIZE), y: Math.floor((u.y - 1) / TILE_SIZE) };
        let tt = { x: Math.floor(wx / TILE_SIZE), y: Math.floor(wy / TILE_SIZE) };
        let exact = { x: wx, y: wy };
        if (blocked(g, tt.x, tt.y)) {
            tt = nearestFree(g, tt.x, tt.y);
            if (!tt) return null;
            exact = { x: tt.x * TILE_SIZE + 16, y: tt.y * TILE_SIZE + 20 };
        }
        const tiles = findPath(st.x, st.y, tt.x, tt.y);
        if (!tiles) return null;
        const pts = [];
        for (let i = 1; i < tiles.length - 1; i++) pts.push({ x: tiles[i].x * TILE_SIZE + 16, y: tiles[i].y * TILE_SIZE + 20 });
        pts.push(exact);
        return { pts, target: exact };
    }

    function startWalk(u, wx, wy) {
        const plan = planWalk(u, wx, wy);
        if (!plan) { u.path = null; return null; }
        u.path = plan.pts;
        u.pathI = 0;
        return plan.target;
    }

    // ---------- orders ----------
    // ---------- free spots ----------
    // Where soldiers stand or are about to stand (idle position, move target).
    // Patrolling soldiers keep walking, so they reserve nothing.
    function reservedSpots(exclude) {
        const out = [];
        for (let i = 0; i < list.length; i++) {
            const u = list[i];
            if (exclude && exclude.has(u)) continue;
            if (u.state === 'idle') out.push({ x: u.x, y: u.y });
            else if (u.state === 'move' && u.dest) out.push(u.dest);
        }
        return out;
    }

    // Feet on a walkable tile (same tile rule as planWalk)
    function walkableAt(g, x, y) {
        return !blocked(g, Math.floor(x / TILE_SIZE), Math.floor((y - 1) / TILE_SIZE));
    }

    function spotFree(g, x, y, reserved) {
        if (!walkableAt(g, x, y)) return false;
        for (let i = 0; i < reserved.length; i++) {
            const dx = reserved[i].x - x, dy = reserved[i].y - y;
            if (dx * dx + dy * dy < MIN_GAP * MIN_GAP) return false;
        }
        return true;
    }

    // Loose block formation around the target, on free walkable spots only:
    // the nearest free grid spots win, then soldiers take them left to right
    function formation(units, wx, wy) {
        const n = units.length;
        if (!n) return [];
        const g = getGrid();
        let cx = clampX(wx), cy = clampY(wy);
        let ct = { x: Math.floor(cx / TILE_SIZE), y: Math.floor((cy - 1) / TILE_SIZE) };
        if (blocked(g, ct.x, ct.y)) {
            const f = nearestFree(g, ct.x, ct.y);
            if (f) { ct = f; cx = f.x * TILE_SIZE + 16; cy = f.y * TILE_SIZE + 20; }
        }
        const reserved = reservedSpots(new Set(units));
        const spots = [];
        for (let R = 3; R <= 12 && spots.length < n; R += 3) {
            spots.length = 0;
            const cands = [];
            for (let r = -R; r <= R; r++) for (let c = -R; c <= R; c++) {
                cands.push({ x: clampX(cx + c * SPREAD + (r & 1) * 3), y: clampY(cy + r * (SPREAD - 2)), d: c * c + r * r * 1.3 });
            }
            cands.sort((a, b) => a.d - b.d);
            const used = reserved.slice();
            for (let i = 0; i < cands.length && spots.length < n; i++) {
                const p = cands[i];
                if (!spotFree(g, p.x, p.y, used)) continue;
                const pt = { x: Math.floor(p.x / TILE_SIZE), y: Math.floor((p.y - 1) / TILE_SIZE) };
                // same side of a river or wall as the target, not across it
                if ((pt.x !== ct.x || pt.y !== ct.y) && !lineFree(g, ct, pt)) continue;
                spots.push({ x: p.x, y: p.y });
                used.push(p);
            }
        }
        while (spots.length < n) spots.push({ x: cx, y: cy }); // no room at all: separation spreads them
        // assign spots by left-to-right order so paths don't cross much
        const us = units.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
        const ss = spots.sort((a, b) => (a.x - b.x) || (a.y - b.y));
        return us.map((u, i) => ({ u, x: ss[i].x, y: ss[i].y }));
    }
    function clampX(x) { return Math.max(4, Math.min(MAP_PIXEL_W - 4, x)); }
    function clampY(y) { return Math.max(6, Math.min(MAP_PIXEL_H - 2, y)); }

    function resolveIds(ids) {
        return (ids || [...selected]).map(getById).filter(Boolean);
    }

    // Send soldiers to a point. Returns how many can get there.
    function moveTo(ids, wx, wy) {
        const units = resolveIds(ids);
        let ok = 0;
        formation(units, wx, wy).forEach(({ u, x, y }) => {
            const target = startWalk(u, x, y);
            u.patrol = null;
            if (target) { u.state = 'move'; u.dest = target; ok++; }
            else { u.state = 'idle'; u.dest = null; }
        });
        return ok;
    }

    // Patrol between where each soldier stands and the point (plus more points with `append`)
    function patrolTo(ids, wx, wy, append) {
        const units = resolveIds(ids);
        let ok = 0;
        formation(units, wx, wy).forEach(({ u, x, y }) => {
            const plan = planWalk(u, x, y);
            if (!plan) return;
            if (append && u.state === 'patrol' && u.patrol) {
                u.patrol.pts.push(plan.target);
            } else {
                u.patrol = { pts: [{ x: u.x, y: u.y }, plan.target], i: 1 };
                u.state = 'patrol';
                u.dest = null;
                u.path = plan.pts; u.pathI = 0;
            }
            ok++;
        });
        return ok;
    }

    function stop(ids) {
        resolveIds(ids).forEach(u => { u.state = 'idle'; u.dest = null; u.patrol = null; u.path = null; u.frame = 0; });
    }

    // ---------- selection ----------
    function select(ids, add) {
        if (!add) selected.clear();
        ids.forEach(id => { if (getById(id)) selected.add(id); });
    }
    function toggle(id) { if (selected.has(id)) selected.delete(id); else if (getById(id)) selected.add(id); }
    function clearSelection() { selected.clear(); }
    function isSelected(u) { return selected.has(u.id); }
    function getSelected() { return list.filter(u => selected.has(u.id)); }

    // Soldiers whose feet are inside a world rectangle
    function inRect(x0, y0, x1, y1) {
        const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
        return list.filter(u => u.x >= ax - 4 && u.x <= bx + 4 && u.y - 12 <= by && u.y >= ay);
    }

    // ---------- update ----------
    function update(dtSec) {
        if (dtSec <= 0) return;
        for (let i = 0; i < list.length; i++) {
            const u = list[i];
            if (u.state === 'idle') { idle(u, dtSec); continue; }
            if (!u.path) {
                // freshly loaded (paths are not saved) or the way got blocked: plan again
                const goal = u.state === 'move' ? u.dest : u.patrol && u.patrol.pts[u.patrol.i];
                if (!goal || !startWalk(u, goal.x, goal.y)) { u.state = 'idle'; u.dest = null; u.patrol = null; continue; }
            }
            walk(u, dtSec);
        }
        separate(dtSec);
    }

    // Soldiers that stand (or are about to stop) as obstacles; walkers pass through
    function settled(u) {
        if (u.state === 'idle') return true;
        if (u.state !== 'move' || !u.path || u.pathI !== u.path.length - 1) return false;
        const p = u.path[u.pathI];
        return Math.abs(p.x - u.x) + Math.abs(p.y - u.y) < 16;
    }

    // Idle soldiers that stand too close step apart gently. Patrols and walkers
    // are never pushed (no jitter on routes); never onto water or buildings.
    // O(n²) over a few dozen soldiers with an early out: cheap, no allocations.
    function separate(dtSec) {
        const n = list.length;
        if (n < 2) return;
        const g = getGrid();
        const maxStep = PUSH_SPEED * dtSec;
        for (let i = 0; i < n; i++) {
            const u = list[i];
            if (u.state !== 'idle') continue;
            let px = 0, py = 0;
            for (let j = 0; j < n; j++) {
                if (j === i) continue;
                const v = list[j];
                const dx = u.x - v.x;
                if (dx > MIN_SEP || dx < -MIN_SEP) continue;
                const dy = u.y - v.y;
                if (dy > MIN_SEP || dy < -MIN_SEP || !settled(v)) continue;
                const d = Math.hypot(dx, dy);
                if (d >= MIN_SEP) continue;
                // the idle one gives way to an arriving walker; two idle ones share it
                const share = v.state === 'idle' ? 0.5 : 1;
                if (d < 0.01) {
                    const a = (u.id - v.id) * 2.39996; // golden angle: same spot, different ways
                    px += Math.cos(a) * MIN_SEP * share; py += Math.sin(a) * MIN_SEP * share;
                } else {
                    px += dx / d * (MIN_SEP - d) * share; py += dy / d * (MIN_SEP - d) * share;
                }
            }
            if (px === 0 && py === 0) continue;
            const len = Math.hypot(px, py);
            if (len > maxStep) { px = px / len * maxStep; py = py / len * maxStep; }
            const nx = clampX(u.x + px), ny = clampY(u.y + py);
            if (walkableAt(g, nx, ny)) { u.x = nx; u.y = ny; }
            else if (walkableAt(g, nx, u.y)) u.x = nx;
            else if (walkableAt(g, u.x, ny)) u.y = ny;
        }
    }

    // Standing: breathing, now and then a look to the other side
    function idle(u, dtSec) {
        u.t += dtSec;
        u.frame = Math.floor(u.t * 1.2) % 2;
        if (u.t > 8 + (u.id % 5)) { u.t = 0; u.flip = !u.flip && Math.random() < 0.35; }
    }

    function walk(u, dtSec) {
        let budget = SPEED * dtSec;
        let steps = 0;
        while (budget > 0 && u.path && steps++ < 8) {
            const p = u.path[u.pathI];
            const dx = p.x - u.x, dy = p.y - u.y;
            const d = Math.hypot(dx, dy);
            if (Math.abs(dx) > 0.3) u.flip = dx < 0;
            if (d <= budget) {
                u.x = p.x; u.y = p.y; budget -= d; u.dist += d;
                u.pathI++;
                if (u.pathI >= u.path.length) arrived(u);
            } else {
                u.x += dx / d * budget; u.y += dy / d * budget; u.dist += budget;
                budget = 0;
            }
        }
        if (u.state !== 'idle') u.frame = 2 + Math.floor(u.dist / 3.2) % 4;
    }

    function arrived(u) {
        u.path = null;
        if (u.state === 'patrol' && u.patrol && u.patrol.pts.length > 1) {
            u.patrol.i = (u.patrol.i + 1) % u.patrol.pts.length;
            const goal = u.patrol.pts[u.patrol.i];
            if (!startWalk(u, goal.x, goal.y)) { u.state = 'idle'; u.patrol = null; }
            return;
        }
        u.state = 'idle'; u.dest = null; u.patrol = null; u.t = 0; u.frame = 0;
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
    // Could a soldier stand at this world point? (not water, not a building)
    function canStand(wx, wy) { return walkableAt(getGrid(), wx, wy); }

    // ---- Save / load ----
    const pt = p => p ? { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 } : null;
    function serialize() {
        return list.map(u => ({
            id: u.id, type: u.type, x: pt(u).x, y: pt(u).y, hp: u.hp, state: u.state, barracksId: u.barracksId, slot: u.slot,
            dest: pt(u.dest), patrol: u.patrol ? { pts: u.patrol.pts.map(pt), i: u.patrol.i } : null,
        }));
    }

    const validPt = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
    function deserialize(saved) {
        reset();
        (saved || []).forEach(s => {
            if (!UNIT_WEAPON[s.type] || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return;
            const u = makeUnit(s.type, s.x, s.y, s.hp);
            u.id = s.id;
            u.barracksId = s.barracksId ?? null;
            u.slot = s.slot ?? 0;
            if (s.state === 'move' && validPt(s.dest)) { u.state = 'move'; u.dest = { x: s.dest.x, y: s.dest.y }; }
            else if (s.state === 'patrol' && s.patrol && Array.isArray(s.patrol.pts) && s.patrol.pts.filter(validPt).length > 1) {
                const pts = s.patrol.pts.filter(validPt).map(p => ({ x: p.x, y: p.y }));
                u.state = 'patrol';
                u.patrol = { pts, i: Math.min(pts.length - 1, Math.max(0, s.patrol.i | 0)) };
            }
            list.push(u);
            nextId = Math.max(nextId, (s.id || 0) + 1);
        });
    }

    return {
        reset, add, remove, update, pick, getAll, getById, countByType, serialize, deserialize,
        moveTo, patrolTo, stop, findPath, canStand,
        select, toggle, clearSelection, isSelected, getSelected, inRect,
    };
})();
