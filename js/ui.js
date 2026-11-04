// ============================================
// UI Manager
// ============================================

const UI = (() => {
    let selectedBuilding = null; // building type to place
    let placementPreview = null;

    // Last input device; touch/pen get the "position, then confirm" flow
    let lastPointerType = window.matchMedia && window.matchMedia('(hover: none)').matches ? 'touch' : 'mouse';

    // Pointer movement (px) below which a press counts as a tap, not a drag
    const DRAG_THRESHOLD = 8;

    // DOM elements
    let els = {};

    function init() {
        els = {
            hud: document.getElementById('hud'),
            values: {
                wood: document.getElementById('res-wood'),
                stone: document.getElementById('res-stone'),
                iron: document.getElementById('res-iron'),
                food: document.getElementById('res-food'),
            },
            resPop: document.getElementById('res-pop'),
            resDay: document.getElementById('res-day'),
            rates: {
                wood: document.getElementById('rate-wood'),
                stone: document.getElementById('rate-stone'),
                iron: document.getElementById('rate-iron'),
                food: document.getElementById('rate-food'),
                pop: document.getElementById('rate-pop'),
            },
            fills: {
                wood: document.getElementById('fill-wood'),
                stone: document.getElementById('fill-stone'),
                iron: document.getElementById('fill-iron'),
                food: document.getElementById('fill-food'),
            },
            dayPill: document.getElementById('day-pill'),
            dayFill: document.getElementById('day-fill'),
            buildingMenu: document.getElementById('building-menu'),
            buildingList: document.getElementById('building-list'),
            infoPanel: document.getElementById('info-panel'),
            infoTitle: document.getElementById('info-title'),
            infoContent: document.getElementById('info-content'),
            infoClose: document.getElementById('info-close'),
            tooltip: document.getElementById('tooltip'),
            notifications: document.getElementById('notifications'),
            gameOver: document.getElementById('game-over'),
            welcome: document.getElementById('welcome-screen'),
            startBtn: document.getElementById('start-btn'),
            continueBtn: document.getElementById('continue-btn'),
            restartBtn: document.getElementById('restart-btn'),
            canvas: document.getElementById('game-canvas'),
            placementBar: document.getElementById('placement-bar'),
            pbName: document.getElementById('pb-name'),
            pbHint: document.getElementById('pb-hint'),
            pbConfirm: document.getElementById('pb-confirm'),
            pbCancel: document.getElementById('pb-cancel'),
        };

        installIcons();
        buildBuildingMenu();
        setupSpeedButtons();
        setupCanvasInput();
        setupKeyboard();

        els.infoClose.addEventListener('click', hideInfo);

        // Tap a resource for the full story (amount / cap, per day, how long it lasts)
        document.querySelectorAll('#resource-bar .resource').forEach(chip => {
            chip.addEventListener('click', () => {
                showTooltipFor(chip, resourceDetail(chip.dataset.res), { timeout: 4000 });
            });
        });
        els.pbConfirm.addEventListener('click', confirmPlacement);
        els.pbCancel.addEventListener('click', deselectBuilding);

        document.addEventListener('pointerdown', e => {
            lastPointerType = e.pointerType || 'mouse';
        }, true);

        // Mouse clicks must not leave buttons focused, otherwise Space would
        // press the focused button instead of toggling pause
        document.addEventListener('mousedown', e => {
            if (e.target.closest('button')) e.preventDefault();
        });

        // iOS Safari: block page pinch-zoom on the HUD (the map handles its own gestures)
        document.addEventListener('gesturestart', e => e.preventDefault());

        window.addEventListener('resize', measureLayout);
        measureLayout();
        if (document.fonts && document.fonts.load) {
            document.fonts.load('16px "Jersey 10"').then(() => {
                measureLayout();
                Renderer.markDirty();
            }).catch(() => {});
        }
    }

    // Pixel-art icons as CSS variables so any [data-icon] element can use them
    function installIcons() {
        ['wood', 'stone', 'iron', 'food', 'pop', 'day'].forEach(name => {
            document.documentElement.style.setProperty(`--icon-${name}`, `url("${Sprites.getIconURL(name)}")`);
        });
    }

    // Tell the renderer (and CSS) which parts of the screen the HUD covers,
    // so the camera can reach every map edge and overlays avoid the menus
    function measureLayout() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const hudRect = els.hud.getBoundingClientRect();
        const menuRect = els.buildingMenu.getBoundingClientRect();
        const menuAtBottom = menuRect.width >= vw - 1;
        const insets = {
            top: Math.round(hudRect.bottom),
            right: menuAtBottom ? 0 : Math.round(vw - menuRect.left),
            bottom: menuAtBottom ? Math.round(vh - menuRect.top) : 0,
            left: 0,
        };
        const root = document.documentElement.style;
        root.setProperty('--inset-top', `${insets.top}px`);
        root.setProperty('--inset-right', `${insets.right}px`);
        root.setProperty('--inset-bottom', `${insets.bottom}px`);
        Renderer.setInsets(insets);
    }

    function costHtml(def) {
        const parts = [];
        ['wood', 'stone', 'iron'].forEach(res => {
            if (def.cost[res] > 0) {
                parts.push(`<span class="cost" data-res="${res}"><i class="mini-icon" data-icon="${res}"></i>${def.cost[res]}</span>`);
            }
        });
        if (def.workers > 0) {
            parts.push(`<span class="cost" data-res="workers"><i class="mini-icon" data-icon="pop"></i>${def.workers}</span>`);
        }
        if (parts.length === 0) parts.push('<span class="cost free">Free</span>');
        return parts.join('');
    }

    function infoText(def) {
        const info = [];
        if (def.provides.populationCap) info.push(`+${def.provides.populationCap} villagers (eat ${def.provides.populationCap} food/day)`);
        if (def.provides.storage) info.push(`+${def.provides.storage} storage`);
        if (def.production) {
            let p = `+${def.production.amount} ${def.production.resource}/day`;
            if (def.production.growthDays) p += ` after ${def.production.growthDays} days`;
            info.push(p);
        }
        return info.join(' · ');
    }

    function buildBuildingMenu() {
        els.buildingList.innerHTML = '';
        BUILD_ORDER.forEach(type => {
            const def = BUILDINGS[type];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'building-btn';
            btn.dataset.type = type;
            btn.title = def.description;

            const thumb = Sprites.getBuildingThumbnail(type, 48);
            thumb.className = 'b-thumb';

            const body = document.createElement('span');
            body.className = 'b-body';
            body.innerHTML = `
                <span class="b-name">${def.name}</span>
                <span class="b-cost">${costHtml(def)}</span>
                <span class="b-status">Built</span>
                <span class="b-info">${infoText(def)}</span>
            `;

            btn.append(thumb, body);
            btn.addEventListener('click', () => onBuildingCardClick(btn, type));
            els.buildingList.appendChild(btn);
        });
    }

    // Disabled cards stay tappable: they explain what is missing instead of doing nothing
    function onBuildingCardClick(btn, type) {
        const blocker = Game.getBuildBlocker(type);
        if (blocker && selectedBuilding !== type) {
            btn.classList.remove('nope');
            void btn.offsetWidth; // restart the shake animation
            btn.classList.add('nope');
            showTooltipFor(btn, blocker, { tone: 'bad', timeout: 2600 });
            return;
        }
        selectBuilding(type);
    }

    function isTouchMode() {
        return lastPointerType !== 'mouse';
    }

    function selectBuilding(type) {
        if (selectedBuilding === type) {
            deselectBuilding();
            return;
        }
        selectedBuilding = type;
        placementPreview = null;
        hideTooltip();
        els.canvas.classList.add('placing');
        hideInfo();

        // Touch has no hover: put the ghost on the nearest free spot right away,
        // so the player only has to adjust (tap / drag) and confirm
        if (isTouchMode()) {
            const vp = Renderer.getViewport();
            const center = anchorTile(type, vp.x + vp.w / 2, vp.y + vp.h / 2);
            const spot = findValidSpot(type, center.x, center.y) || center;
            setPreviewTile(spot.x, spot.y);
            ensurePreviewVisible();
        }
        updateBuildingButtons();
        updatePlacementBar();
    }

    function deselectBuilding() {
        selectedBuilding = null;
        placementPreview = null;
        els.canvas.classList.remove('placing');
        hideTooltip();
        updateBuildingButtons();
        updatePlacementBar();
    }

    function updateBuildingButtons() {
        const gs = Game.getState();
        const free = Game.getFreeWorkers();
        const btns = els.buildingList.querySelectorAll('.building-btn');
        btns.forEach(btn => {
            const type = btn.dataset.type;
            const def = BUILDINGS[type];
            const blocker = Game.getBuildBlocker(type);
            const built = def.limit !== null && BuildingManager.countByType(type) >= def.limit;
            btn.classList.toggle('disabled', !!blocker);
            btn.classList.toggle('built', built);
            btn.classList.toggle('selected', type === selectedBuilding);
            btn.setAttribute('aria-disabled', blocker ? 'true' : 'false');
            btn.querySelectorAll('.cost[data-res]').forEach(chip => {
                const res = chip.dataset.res;
                const short = res === 'workers' ? def.workers > free : def.cost[res] > gs.resources[res];
                chip.classList.toggle('short', short);
            });
        });
    }

    function setupSpeedButtons() {
        document.getElementById('speed-pause').addEventListener('click', () => setSpeed(0));
        document.getElementById('speed-1x').addEventListener('click', () => setSpeed(1));
        document.getElementById('speed-2x').addEventListener('click', () => setSpeed(2));
        document.getElementById('speed-3x').addEventListener('click', () => setSpeed(3));
    }

    function setSpeed(speed) {
        if (speed === 0) Game.togglePause();
        else Game.setSpeed(speed);
        syncSpeedButtons();
    }

    // ---- Placement ----

    // Top-left tile so that the building is centered under the pointer
    function anchorTile(type, sx, sy) {
        const def = BUILDINGS[type];
        const w = Renderer.screenToWorld(sx, sy);
        return {
            x: Math.round(w.x / TILE_SIZE - def.width / 2),
            y: Math.round(w.y / TILE_SIZE - def.height / 2),
        };
    }

    function setPreviewTile(tileX, tileY) {
        if (!selectedBuilding) {
            placementPreview = null;
            return;
        }
        const check = Game.canPlace(selectedBuilding, tileX, tileY);
        placementPreview = {
            type: selectedBuilding,
            tileX,
            tileY,
            valid: check.ok,
            reason: check.ok ? '' : check.reason,
        };
        updatePlacementBar();
    }

    function setPreviewAt(sx, sy) {
        if (!selectedBuilding) {
            placementPreview = null;
            return;
        }
        const tile = anchorTile(selectedBuilding, sx, sy);
        setPreviewTile(tile.x, tile.y);
    }

    // Nearest buildable spot, searching rings around (cx, cy)
    function findValidSpot(type, cx, cy, maxRadius = 14) {
        for (let r = 0; r <= maxRadius; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                    if (Game.canPlace(type, cx + dx, cy + dy).ok) return { x: cx + dx, y: cy + dy };
                }
            }
        }
        return null;
    }

    // Scroll the map if the ghost ended up under the HUD or off screen. For
    // production buildings, also bring the resource tiles in range into view,
    // so the player can see *why* the spot works.
    function ensurePreviewVisible() {
        if (!placementPreview) return;
        const pv = placementPreview;
        const def = BUILDINGS[pv.type];
        const cam = Renderer.getCamera();
        const vp = Renderer.getViewport();
        const margin = 24;
        const onScreen = (wx0, wy0, wx1, wy1) =>
            wx0 - cam.x >= vp.x + margin && wx1 - cam.x <= vp.x + vp.w - margin &&
            wy0 - cam.y >= vp.y + margin && wy1 - cam.y <= vp.y + vp.h - margin;

        const gx0 = pv.tileX * TILE_SIZE, gy0 = pv.tileY * TILE_SIZE;
        const gx1 = gx0 + def.width * TILE_SIZE, gy1 = gy0 + def.height * TILE_SIZE;
        let focusX = (gx0 + gx1) / 2;
        let focusY = (gy0 + gy1) / 2;
        let visible = onScreen(gx0, gy0, gx1, gy1);

        const req = def.production && def.production.requires;
        if (req) {
            // centroid of the resource tiles in range
            let sx = 0, sy = 0, n = 0;
            for (let ty = pv.tileY - RESOURCE_RADIUS; ty < pv.tileY + def.height + RESOURCE_RADIUS; ty++) {
                for (let tx = pv.tileX - RESOURCE_RADIUS; tx < pv.tileX + def.width + RESOURCE_RADIUS; tx++) {
                    if (GameMap.getTerrain(tx, ty) === TERRAIN[req]) {
                        sx += (tx + 0.5) * TILE_SIZE;
                        sy += (ty + 0.5) * TILE_SIZE;
                        n++;
                    }
                }
            }
            if (n > 0) {
                const cx = sx / n, cy = sy / n;
                visible = visible && onScreen(cx - 16, cy - 16, cx + 16, cy + 16);
                focusX = (focusX + cx) / 2;
                focusY = (focusY + cy) / 2;
            }
        }
        if (!visible) Renderer.centerOn(focusX, focusY);
    }

    function pointInPreview(sx, sy) {
        if (!placementPreview) return false;
        const def = BUILDINGS[placementPreview.type];
        const w = Renderer.screenToWorld(sx, sy);
        const pad = 12; // fingers are not precise
        const x0 = placementPreview.tileX * TILE_SIZE - pad;
        const y0 = placementPreview.tileY * TILE_SIZE - pad;
        return w.x >= x0 && w.x <= x0 + def.width * TILE_SIZE + pad * 2 &&
               w.y >= y0 && w.y <= y0 + def.height * TILE_SIZE + pad * 2;
    }

    function tryPlace(type, tileX, tileY) {
        const result = Game.placeBuilding(type, tileX, tileY);
        if (!result) return null;

        // Keep selected for rapid placement, unless limited or unaffordable now
        if (!Game.isBuildingAvailable(type)) {
            deselectBuilding();
        } else if (isTouchMode()) {
            // Offer the next free spot next to the one just built
            const spot = findValidSpot(type, tileX, tileY);
            if (spot) setPreviewTile(spot.x, spot.y);
            else setPreviewTile(tileX, tileY);
        } else if (placementPreview) {
            setPreviewTile(placementPreview.tileX, placementPreview.tileY);
        }
        updateBuildingButtons();
        updatePlacementBar();
        return result;
    }

    function confirmPlacement() {
        if (!selectedBuilding || !placementPreview || !placementPreview.valid) return;
        tryPlace(selectedBuilding, placementPreview.tileX, placementPreview.tileY);
    }

    // Floating bar while placing: name, live reason, cancel (and Build on touch)
    function updatePlacementBar() {
        if (!selectedBuilding) {
            els.placementBar.classList.add('hidden');
            return;
        }
        const def = BUILDINGS[selectedBuilding];
        const touch = isTouchMode();
        els.pbName.textContent = def.name;
        let hint;
        let tone = '';
        if (placementPreview && !placementPreview.valid) {
            hint = placementPreview.reason;
            tone = 'bad';
        } else if (placementPreview) {
            hint = touch ? 'Drag to move · tap Build' : 'Click to build · Esc to cancel';
            tone = 'good';
        } else {
            hint = touch ? 'Tap the map to position' : 'Click the map to build · Esc to cancel';
        }
        els.pbHint.textContent = hint;
        els.pbHint.className = tone ? `pb-hint ${tone}` : 'pb-hint';
        els.pbConfirm.classList.toggle('hidden', !touch);
        els.pbConfirm.disabled = !(placementPreview && placementPreview.valid);
        els.placementBar.classList.remove('hidden');
    }

    function handleTap(sx, sy, pointerType) {
        if (selectedBuilding) {
            if (pointerType === 'mouse') {
                const tile = anchorTile(selectedBuilding, sx, sy);
                tryPlace(selectedBuilding, tile.x, tile.y);
            } else {
                // touch / pen: a tap only moves the ghost, "Build" confirms
                setPreviewAt(sx, sy);
            }
            return;
        }
        // Tap on existing building - show info
        const tile = Renderer.screenToTile(sx, sy);
        const building = BuildingManager.getBuildingAt(tile.x, tile.y);
        if (building) showBuildingInfo(building);
        else hideInfo();
    }

    // ---- Map input: one code path for mouse, touch and pen ----
    function setupCanvasInput() {
        const canvas = els.canvas;
        let drag = null; // { id, startX, startY, camX, camY, moved, mode, grab }

        function pos(e) {
            const rect = canvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }

        canvas.addEventListener('pointerdown', e => {
            if (!e.isPrimary || e.button > 0) return;
            const p = pos(e);
            const cam = Renderer.getCamera();
            drag = { id: e.pointerId, startX: p.x, startY: p.y, camX: cam.x, camY: cam.y, moved: false, mode: 'pan' };
            // On touch, pressing on the ghost drags the ghost instead of the map
            if (e.pointerType !== 'mouse' && selectedBuilding && pointInPreview(p.x, p.y)) {
                const w = Renderer.screenToWorld(p.x, p.y);
                drag.mode = 'ghost';
                drag.grab = {
                    x: w.x - placementPreview.tileX * TILE_SIZE,
                    y: w.y - placementPreview.tileY * TILE_SIZE,
                };
            }
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        });

        canvas.addEventListener('pointermove', e => {
            if (!e.isPrimary) return;
            const p = pos(e);
            if (drag && drag.id === e.pointerId) {
                const dx = drag.startX - p.x;
                const dy = drag.startY - p.y;
                if (!drag.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
                    drag.moved = true;
                    if (drag.mode === 'pan') canvas.classList.add('dragging');
                }
                if (drag.moved && drag.mode === 'pan') Renderer.setCamera(drag.camX + dx, drag.camY + dy);
                if (drag.moved && drag.mode === 'ghost') {
                    const w = Renderer.screenToWorld(p.x, p.y);
                    setPreviewTile(
                        Math.round((w.x - drag.grab.x) / TILE_SIZE),
                        Math.round((w.y - drag.grab.y) / TILE_SIZE)
                    );
                }
            }
            // Mouse hover: ghost follows the pointer, reason follows the cursor
            if (e.pointerType === 'mouse') {
                setPreviewAt(p.x, p.y);
                if (placementPreview && !placementPreview.valid && !(drag && drag.moved)) {
                    showTooltip(placementPreview.reason, e.clientX + 16, e.clientY + 18, { tone: 'bad' });
                } else {
                    hideTooltip();
                }
            }
        });

        function endDrag(e, cancelled) {
            if (!drag || drag.id !== e.pointerId) return;
            const wasTap = !drag.moved && !cancelled;
            drag = null;
            canvas.classList.remove('dragging');
            if (wasTap) {
                const p = pos(e);
                handleTap(p.x, p.y, e.pointerType);
            }
        }

        canvas.addEventListener('pointerup', e => endDrag(e, false));
        canvas.addEventListener('pointercancel', e => endDrag(e, true));
        canvas.addEventListener('pointerleave', e => {
            if (e.pointerType === 'mouse' && !drag) {
                placementPreview = null;
                hideTooltip();
                updatePlacementBar();
            }
        });

        // Trackpad / wheel scrolls the map
        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            if (e.ctrlKey) return; // pinch gesture on trackpads: ignore, don't zoom the page
            const unit = e.deltaMode === 1 ? 16 : 1;
            Renderer.moveCamera(e.deltaX * unit, e.deltaY * unit);
        }, { passive: false });

        // Right click to cancel
        canvas.addEventListener('contextmenu', e => {
            e.preventDefault();
            deselectBuilding();
        });
    }

    function setupKeyboard() {
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                deselectBuilding();
                hideInfo();
            }
            if (e.key === ' ') {
                // keyboard users activating a focused button keep the default
                if (e.target.closest && e.target.closest('button')) return;
                e.preventDefault();
                setSpeed(0);
            }
            if (e.key === '1') setSpeed(1);
            if (e.key === '2') setSpeed(2);
            if (e.key === '3') setSpeed(3);
        });
    }

    // ---- Tooltip ----
    let tooltipTimer = null;

    function showTooltip(text, x, y, opts = {}) {
        const t = els.tooltip;
        t.textContent = text;
        t.className = opts.tone ? `tone-${opts.tone}` : '';
        // measure, then keep it on screen
        const r = t.getBoundingClientRect();
        const nx = Math.max(8, Math.min(window.innerWidth - r.width - 8, x));
        const ny = Math.max(8, Math.min(window.innerHeight - r.height - 8, y));
        t.style.transform = `translate(${Math.round(nx)}px, ${Math.round(ny)}px)`;
        clearTimeout(tooltipTimer);
        if (opts.timeout) tooltipTimer = setTimeout(hideTooltip, opts.timeout);
    }

    // Above the element (bottom bar) or to its left (sidebar)
    function showTooltipFor(el, text, opts = {}) {
        showTooltip(text, 0, 0, opts);
        const r = el.getBoundingClientRect();
        const t = els.tooltip.getBoundingClientRect();
        const inSidebar = r.left > window.innerWidth / 2 && r.top > 60 && r.width < window.innerWidth / 2;
        if (inSidebar) {
            showTooltip(text, r.left - t.width - 8, r.top + r.height / 2 - t.height / 2, opts);
        } else if (r.top < window.innerHeight / 2) {
            showTooltip(text, r.left + r.width / 2 - t.width / 2, r.bottom + 8, opts);
        } else {
            showTooltip(text, r.left + r.width / 2 - t.width / 2, r.top - t.height - 8, opts);
        }
    }

    function hideTooltip() {
        clearTimeout(tooltipTimer);
        els.tooltip.classList.add('hidden');
    }

    function showBuildingInfo(building) {
        els.infoTitle.textContent = building.def.name;
        let html = `<p style="margin-bottom:8px;color:#9a8a68">${building.def.description}</p>`;

        if (building.maxWorkers > 0) {
            html += `<div class="stat"><span class="stat-label">Workers</span><span>${building.workers} / ${building.maxWorkers}</span></div>`;
        }

        if (building.def.production) {
            const prod = building.def.production;
            const status = building.grown ? (building.active ? 'Active' : 'No Workers') : `Growing (${building.growthProgress}/${prod.growthDays} days)`;
            html += `<div class="stat"><span class="stat-label">Production</span><span>+${prod.amount} ${prod.resource}/day</span></div>`;
            html += `<div class="stat"><span class="stat-label">Status</span><span>${status}</span></div>`;
        }

        if (building.def.provides.populationCap) {
            html += `<div class="stat"><span class="stat-label">Housing</span><span>+${building.def.provides.populationCap} villagers</span></div>`;
        }

        if (building.def.provides.storage) {
            html += `<div class="stat"><span class="stat-label">Storage</span><span>+${building.def.provides.storage}</span></div>`;
        }

        html += `<div class="stat" style="margin-top:6px"><span class="stat-label">Built on</span><span>Day ${building.dayPlaced}</span></div>`;

        els.infoContent.innerHTML = html;
        els.infoPanel.classList.remove('hidden');
    }

    function hideInfo() {
        els.infoPanel.classList.add('hidden');
    }

    const RES_NAMES = { wood: 'Wood', stone: 'Stone', iron: 'Iron', food: 'Food' };
    const fullNotified = {};

    function isProducing(res, rates, foodProduced) {
        return res === 'food' ? foodProduced > 0 : rates[res] > 0;
    }

    function resourceDetail(res) {
        const gs = Game.getState();
        const { rates, foodProduced, foodEaten } = Game.getRates();
        if (res === 'pop') {
            const free = gs.populationCap - gs.populationUsed;
            return `Villagers: ${gs.populationCap} live here, ${gs.populationUsed} work, ${free} free. Each one eats 1 food a day.`;
        }
        const max = gs.maxStorage;
        const amount = Math.floor(gs.resources[res]);
        let text = `${RES_NAMES[res]}: ${amount} / ${max} stored`;
        if (res === 'food') {
            text += ` · +${foodProduced} grown, −${foodEaten} eaten a day`;
            if (rates.food < 0) text += ` · lasts ${Math.floor(gs.resources.food / -rates.food)} more days`;
        } else if (rates[res] > 0) {
            text += ` · +${rates[res]} a day`;
        } else {
            text += ' · nothing produces it yet';
        }
        const rate = res === 'food' ? rates.food : rates[res];
        if (gs.resources[res] >= max && isProducing(res, rates, foodProduced)) {
            text += BuildingManager.countByType('warehouse') === 0
                ? ' · Storage full, production is wasted! Build a Warehouse.'
                : ' · Storage full, production is wasted!';
        } else if (rate > 0) {
            text += ` · full in ${Math.ceil((max - amount) / rate)} days`;
        }
        return text;
    }

    function updateResources() {
        const gs = Game.getState();
        const { rates, foodProduced } = Game.getRates();
        const max = gs.maxStorage;

        ['wood', 'stone', 'iron', 'food'].forEach(res => {
            const chip = els.rates[res].closest('.resource');
            const amount = gs.resources[res];
            const rate = rates[res];
            const producing = isProducing(res, rates, foodProduced);
            const full = amount >= max && producing;
            const fill = Math.min(1, amount / max);

            els.values[res].textContent = Math.floor(amount);
            els.fills[res].style.transform = `scaleX(${fill.toFixed(3)})`;
            chip.classList.toggle('full', full);
            chip.classList.toggle('near-full', !full && producing && fill >= 0.85);

            let text = rate > 0 ? `+${rate}` : rate < 0 ? `${rate}` : '';
            if (full) text += text ? ' · full' : 'full';
            let alert = false;
            if (res === 'food') {
                if (rate < 0) {
                    const days = Math.floor(amount / -rate);
                    text += ` · ${days}d`;
                    alert = days <= 2;
                }
                alert = alert || gs.starvationDays > 0;
            }
            chip.classList.toggle('alert', alert);
            els.rates[res].textContent = text;
            els.rates[res].classList.toggle('up', rate > 0 && !full);
            els.rates[res].classList.toggle('down', rate < 0);
            chip.title = resourceDetail(res);

            // Say it once when production starts going to waste
            if (full && !fullNotified[res]) {
                fullNotified[res] = true;
                const hint = BuildingManager.countByType('warehouse') === 0 ? ' Build a Warehouse to store more.' : '';
                showNotification(`${RES_NAMES[res]} storage is full!${hint}`, 'warning');
            } else if (!full) {
                fullNotified[res] = false;
            }
        });

        els.resPop.textContent = `${gs.populationUsed}/${gs.populationCap}`;
        const free = gs.populationCap - gs.populationUsed;
        els.rates.pop.textContent = gs.populationCap > 0 ? `${free} free` : '';
        els.rates.pop.closest('.resource').title = resourceDetail('pop');

        els.resDay.textContent = `Day ${gs.day}`;

        updateBuildingButtons();
    }

    // Per frame: only the cheap day-progress bar
    let lastDayFill = -1;
    let lastPaused = null;
    function tick() {
        const gs = Game.getState();
        const p = gs.started ? gs.dayProgress : 0;
        if (Math.abs(p - lastDayFill) >= 0.002 || p < lastDayFill) {
            els.dayFill.style.transform = `scaleX(${p.toFixed(3)})`;
            lastDayFill = p;
        }
        if (gs.paused !== lastPaused) {
            els.dayPill.classList.toggle('paused', gs.paused);
            lastPaused = gs.paused;
        }
    }

    // End of day: numbers float up from every producer, the castle shows what was eaten
    function showDayReport(report) {
        report.produced.forEach(p => {
            const b = p.building;
            const wasted = p.amount < p.wanted;
            const text = p.amount > 0 ? `+${p.amount}` : 'full';
            // start mid-building so the rise stays over its own roof, not the neighbour's labels
            Renderer.spawnFloater(b.pixelX + b.width / 2, b.pixelY + b.height / 2, text, wasted ? '#ffcf6b' : '#c8f5a0', p.res);
        });
        if (report.foodNeeded > 0) {
            const castle = BuildingManager.getAll().find(b => b.type === 'castle');
            if (castle) {
                const hungry = report.foodEaten < report.foodNeeded;
                Renderer.spawnFloater(castle.pixelX + castle.width / 2, castle.pixelY + castle.height / 2,
                    `-${report.foodNeeded}`, hungry ? '#ff5a4a' : '#ffa898', 'food');
            }
        }
    }

    function showNotification(message, type = 'info') {
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.textContent = message;
        els.notifications.appendChild(div);
        // Don't bury the map under messages (phones: 2, desktop: 3)
        const max = window.innerWidth <= 760 ? 2 : 3;
        while (els.notifications.children.length > max) els.notifications.firstChild.remove();
        setTimeout(() => div.remove(), 3000);
    }

    function showGameOver() {
        deselectBuilding();
        hideInfo();
        els.gameOver.classList.remove('hidden');
    }

    function hideWelcome() {
        els.welcome.classList.add('hidden');
    }

    // savedInfo: null for a fresh start, or { day } when a saved settlement exists
    let hasSave = false;
    let confirmNewTimer = null;

    function showWelcome(savedInfo) {
        hasSave = !!savedInfo;
        els.continueBtn.classList.toggle('hidden', !hasSave);
        if (hasSave) els.continueBtn.textContent = `Continue · Day ${savedInfo.day}`;
        resetNewGameButton();
        els.welcome.classList.remove('hidden');
    }

    function resetNewGameButton() {
        clearTimeout(confirmNewTimer);
        els.startBtn.dataset.confirm = '';
        els.startBtn.classList.toggle('secondary', hasSave);
        els.startBtn.textContent = hasSave ? 'New Game' : 'Begin Your Reign';
    }

    function onContinue(cb) {
        els.continueBtn.addEventListener('click', cb);
    }

    // With a save present, "New Game" needs a second tap so a misclick can't wipe the settlement
    function onNewGame(cb) {
        els.startBtn.addEventListener('click', () => {
            if (hasSave && els.startBtn.dataset.confirm !== 'yes') {
                els.startBtn.dataset.confirm = 'yes';
                els.startBtn.textContent = 'Tap again to abandon your settlement';
                clearTimeout(confirmNewTimer);
                confirmNewTimer = setTimeout(resetNewGameButton, 3000);
                return;
            }
            clearTimeout(confirmNewTimer);
            hasSave = false;
            cb();
        });
    }

    function syncSpeedButtons() {
        const gs = Game.getState();
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        const id = gs.paused ? 'speed-pause' : `speed-${gs.speed}x`;
        const btn = document.getElementById(id);
        if (btn) btn.classList.add('active');
    }

    // Re-sync every piece of UI with the game state (after new game / load)
    function refreshAll() {
        deselectBuilding();
        hideInfo();
        syncSpeedButtons();
        updateResources();
    }

    function getPlacementPreview() {
        return placementPreview;
    }

    function getRestartBtn() { return els.restartBtn; }
    function getGameOverEl() { return els.gameOver; }

    return {
        init,
        selectBuilding,
        deselectBuilding,
        updateResources,
        showNotification,
        showGameOver,
        hideWelcome,
        showWelcome,
        onContinue,
        onNewGame,
        refreshAll,
        getPlacementPreview,
        getRestartBtn,
        getGameOverEl,
        updateBuildingButtons,
        measureLayout,
        tick,
        showDayReport,
    };
})();
