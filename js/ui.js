// ============================================
// UI Manager
// ============================================

const UI = (() => {
    let selectedBuilding = null; // building type to place
    let placementPreview = null;

    // Pointer movement (px) below which a press counts as a tap, not a drag
    const DRAG_THRESHOLD = 8;

    // DOM elements
    let els = {};

    function init() {
        els = {
            hud: document.getElementById('hud'),
            resWood: document.getElementById('res-wood'),
            resStone: document.getElementById('res-stone'),
            resIron: document.getElementById('res-iron'),
            resFood: document.getElementById('res-food'),
            resPop: document.getElementById('res-pop'),
            resDay: document.getElementById('res-day'),
            rates: {
                wood: document.getElementById('rate-wood'),
                stone: document.getElementById('rate-stone'),
                iron: document.getElementById('rate-iron'),
                food: document.getElementById('rate-food'),
                pop: document.getElementById('rate-pop'),
            },
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
        };

        installIcons();
        buildBuildingMenu();
        setupSpeedButtons();
        setupCanvasInput();
        setupKeyboard();

        els.infoClose.addEventListener('click', hideInfo);

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
        if (def.provides.populationCap) info.push(`+${def.provides.populationCap} villagers`);
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
                <span class="b-info">${infoText(def)}</span>
            `;

            btn.append(thumb, body);
            btn.addEventListener('click', () => selectBuilding(type));
            els.buildingList.appendChild(btn);
        });
    }

    function selectBuilding(type) {
        if (selectedBuilding === type) {
            deselectBuilding();
            return;
        }
        selectedBuilding = type;
        placementPreview = null;
        els.canvas.classList.add('placing');
        updateBuildingButtons();
        hideInfo();
    }

    function deselectBuilding() {
        selectedBuilding = null;
        placementPreview = null;
        els.canvas.classList.remove('placing');
        updateBuildingButtons();
    }

    function updateBuildingButtons() {
        const btns = els.buildingList.querySelectorAll('.building-btn');
        btns.forEach(btn => {
            const type = btn.dataset.type;
            const available = Game.isBuildingAvailable(type);
            const hasWorkers = BUILDINGS[type].workers <= Game.getFreeWorkers();
            btn.classList.toggle('disabled', !available || !hasWorkers);
            btn.classList.toggle('selected', type === selectedBuilding);
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

    // ---- Map input: one code path for mouse, touch and pen ----

    // Top-left tile so that the building is centered under the pointer
    function anchorTile(type, sx, sy) {
        const def = BUILDINGS[type];
        const w = Renderer.screenToWorld(sx, sy);
        return {
            x: Math.round(w.x / TILE_SIZE - def.width / 2),
            y: Math.round(w.y / TILE_SIZE - def.height / 2),
        };
    }

    function setPreviewAt(sx, sy) {
        if (!selectedBuilding) {
            placementPreview = null;
            return;
        }
        const tile = anchorTile(selectedBuilding, sx, sy);
        const check = Game.canPlace(selectedBuilding, tile.x, tile.y);
        placementPreview = {
            type: selectedBuilding,
            tileX: tile.x,
            tileY: tile.y,
            valid: check.ok,
            reason: check.ok ? '' : check.reason,
        };
    }

    function tryPlace(type, tileX, tileY) {
        const result = Game.placeBuilding(type, tileX, tileY);
        if (result) {
            // Keep selected for rapid placement, unless limited or unaffordable now
            const def = BUILDINGS[type];
            const limitReached = def.limit !== null && BuildingManager.countByType(type) >= def.limit;
            if (limitReached || !Game.isBuildingAvailable(type) || def.workers > Game.getFreeWorkers()) {
                deselectBuilding();
            } else if (placementPreview) {
                // The spot under the ghost is occupied now
                const check = Game.canPlace(type, placementPreview.tileX, placementPreview.tileY);
                placementPreview = Object.assign({}, placementPreview, { valid: check.ok, reason: check.ok ? '' : check.reason });
            }
            updateBuildingButtons();
        }
        return result;
    }

    function handleTap(sx, sy) {
        if (selectedBuilding) {
            const tile = anchorTile(selectedBuilding, sx, sy);
            tryPlace(selectedBuilding, tile.x, tile.y);
            return;
        }
        // Tap on existing building - show info
        const tile = Renderer.screenToTile(sx, sy);
        const building = BuildingManager.getBuildingAt(tile.x, tile.y);
        if (building) showBuildingInfo(building);
        else hideInfo();
    }

    function setupCanvasInput() {
        const canvas = els.canvas;
        let drag = null; // { id, startX, startY, camX, camY, moved }

        function pos(e) {
            const rect = canvas.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }

        canvas.addEventListener('pointerdown', e => {
            if (!e.isPrimary || e.button > 0) return;
            const p = pos(e);
            const cam = Renderer.getCamera();
            drag = { id: e.pointerId, startX: p.x, startY: p.y, camX: cam.x, camY: cam.y, moved: false };
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
                    canvas.classList.add('dragging');
                }
                if (drag.moved) Renderer.setCamera(drag.camX + dx, drag.camY + dy);
            }
            // Mouse/pen hover: ghost follows the pointer
            if (e.pointerType !== 'touch') setPreviewAt(p.x, p.y);
        });

        function endDrag(e, cancelled) {
            if (!drag || drag.id !== e.pointerId) return;
            const wasTap = !drag.moved && !cancelled;
            drag = null;
            canvas.classList.remove('dragging');
            if (wasTap) {
                const p = pos(e);
                if (e.pointerType === 'touch') setPreviewAt(p.x, p.y);
                handleTap(p.x, p.y);
            }
        }

        canvas.addEventListener('pointerup', e => endDrag(e, false));
        canvas.addEventListener('pointercancel', e => endDrag(e, true));
        canvas.addEventListener('pointerleave', e => {
            if (e.pointerType === 'mouse' && !drag) placementPreview = null;
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

    function updateResources() {
        const gs = Game.getState();

        // Calculate production rates
        const producers = BuildingManager.getProductionBuildings();
        const rates = { wood: 0, stone: 0, iron: 0, food: 0 };
        producers.forEach(b => {
            rates[b.def.production.resource] += b.def.production.amount;
        });
        // Food consumption
        rates.food -= gs.populationCap;

        function setRate(el, val) {
            el.textContent = val > 0 ? `+${val}` : val < 0 ? `${val}` : '';
            el.classList.toggle('up', val > 0);
            el.classList.toggle('down', val < 0);
        }

        els.resWood.textContent = Math.floor(gs.resources.wood);
        els.resStone.textContent = Math.floor(gs.resources.stone);
        els.resIron.textContent = Math.floor(gs.resources.iron);
        els.resFood.textContent = Math.floor(gs.resources.food);
        ['wood', 'stone', 'iron', 'food'].forEach(r => setRate(els.rates[r], rates[r]));

        els.resPop.textContent = `${gs.populationUsed}/${gs.populationCap}`;
        const free = gs.populationCap - gs.populationUsed;
        els.rates.pop.textContent = gs.populationCap > 0 ? `${free} free` : '';
        els.rates.pop.classList.remove('up', 'down');

        els.resDay.textContent = `Day ${gs.day}`;

        // Flash food red if starving
        els.resFood.closest('.resource').classList.toggle('alert', gs.starvationDays > 0);

        updateBuildingButtons();
    }

    function showNotification(message, type = 'info') {
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.textContent = message;
        els.notifications.appendChild(div);
        // Never stack more than three messages on small screens
        while (els.notifications.children.length > 3) els.notifications.firstChild.remove();
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
    };
})();
