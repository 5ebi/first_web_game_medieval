// ============================================
// UI Manager
// ============================================

const UI = (() => {
    let selectedBuilding = null;   // building type to place
    let selectedPlaced = null;     // placed building shown in the info panel
    let hoveredBuilding = null;
    let placementPreview = null;
    let pointerOverCanvas = false;
    let justPlaced = null;      // building placed last; no ghost while the cursor is still on it
    let pendingTouch = null;    // touch: ghost position waiting for a confirming second tap
    let lastInputTouch = false;
    let wheelAcc = 0, wheelT = 0;
    let lastPointer = { x: 0, y: 0 };
    const keys = new Set();

    // DOM elements
    let els = {};

    function $(id) { return document.getElementById(id); }

    function init() {
        els = {
            resWood: $('res-wood'),
            resStone: $('res-stone'),
            resIron: $('res-iron'),
            resFood: $('res-food'),
            resPop: $('res-pop'),
            resDay: $('res-day'),
            dayProgress: $('day-progress'),
            storageLabel: $('res-storage'),
            buildingList: $('building-list'),
            buildingMenu: $('building-menu'),
            infoPanel: $('info-panel'),
            infoTitle: $('info-title'),
            infoContent: $('info-content'),
            infoClose: $('info-close'),
            infoActions: $('info-actions'),
            tooltip: $('tooltip'),
            notifications: $('notifications'),
            gameOver: $('game-over'),
            gameOverStats: $('game-over-stats'),
            welcome: $('welcome-screen'),
            startBtn: $('start-btn'),
            continueBtn: $('continue-btn'),
            restartBtn: $('restart-btn'),
            canvas: $('game-canvas'),
            pauseBanner: $('pause-banner'),
            muteBtn: $('mute-btn'),
            settingsBtn: $('settings-btn'),
            settingsScreen: $('settings-screen'),
            settingsClose: $('settings-close'),
            settingsHelp: $('settings-help'),
            settingsNew: $('settings-new'),
            langBtns: Array.from(document.querySelectorAll('.lang-btn')),
            toggleMusic: $('toggle-music'),
            toggleSfx: $('toggle-sfx'),
            toggleFx: $('toggle-fx'),
            dayRes: $('day-res'),
            iconDay: $('icon-day'),
            menuBtn: $('menu-btn'),
            helpBtn: $('help-btn'),
            helpScreen: $('help-screen'),
            helpClose: $('help-close'),
            minimap: $('minimap'),
            goalText: $('goal-text'),
            goalCount: $('goal-count'),
            zoomIn: $('zoom-in'),
            zoomOut: $('zoom-out'),
            zoomLabel: $('zoom-label'),
            resourceBar: $('resource-bar'),
            placeBanner: $('place-banner'),
            placeText: $('place-text'),
            placeHint: $('place-hint'),
            placeCancel: $('place-cancel'),
        };

        buildResourceIcons();
        buildBuildingMenu();
        setupSpeedButtons();
        setupTopbarButtons();
        setupSettings();
        setupEventListeners();
        setupMinimap();
        updateInsets();
        window.addEventListener('resize', updateInsets);

        els.infoClose.addEventListener('click', () => hideInfo());
        els.placeCancel.addEventListener('click', () => deselectBuilding());
        els.helpClose.addEventListener('click', () => { els.helpScreen.classList.add('hidden'); AudioSys.play('click'); });

        Lang.onChange(onLanguageChanged);
        syncSettingsUI();

        Atmosphere.setWeatherListener((next, prev) => {
            if (next === 'rain') showNotification(t('weather.rain.start'), 'info');
            else if (next === 'fog') showNotification(t('weather.fog.start'), 'info');
            else if (next === 'clear' && (prev === 'rain' || prev === 'fog')) showNotification(t('weather.clear.start'), 'info');
        });
    }

    // ---------- layout ----------
    function isCompact() {
        return window.matchMedia('(max-width: 760px)').matches;
    }

    function updateInsets() {
        const top = els.resourceBar.offsetHeight || 48;
        if (isCompact()) {
            Renderer.setInsets({ top, right: 0, bottom: els.buildingMenu.offsetHeight || 120, left: 0 });
        } else {
            Renderer.setInsets({ top, right: els.buildingMenu.offsetWidth || 240, bottom: 0, left: 0 });
        }
    }

    // ---------- language ----------
    function onLanguageChanged() {
        Lang.applyDom();
        buildBuildingMenu();
        updateResources();
        updateMuteButton();
        if (selectedPlaced) showBuildingInfo(selectedPlaced);
        if (!els.welcome.classList.contains('hidden')) showWelcome();
        syncSettingsUI();
        hideTooltip();
        updatePlaceBanner();
    }

    // ---------- resource bar ----------
    function buildResourceIcons() {
        const map = { 'icon-wood': 'wood', 'icon-stone': 'stone', 'icon-iron': 'iron', 'icon-food': 'food', 'icon-pop': 'pop', 'icon-day': 'day', 'icon-storage': 'storage' };
        Object.entries(map).forEach(([id, name]) => {
            const el = $(id);
            if (!el) return;
            el.innerHTML = '';
            el.appendChild(Sprites.drawIcon(name));
        });
        updateMuteButton();
    }

    function updateMuteButton() {
        const muted = AudioSys.isMuted();
        els.muteBtn.innerHTML = '';
        els.muteBtn.appendChild(Sprites.drawIcon(muted ? 'mute' : 'sound'));
        els.muteBtn.title = muted ? t('btn.unmute') : t('btn.mute');
    }

    // ---------- building menu ----------
    function buildBuildingMenu() {
        els.buildingList.innerHTML = '';
        BUILD_ORDER.forEach(type => {
            const def = BUILDINGS[type];
            const btn = document.createElement('button');
            btn.className = 'building-btn';
            btn.dataset.type = type;

            const thumb = Sprites.getBuildingThumb(type, 40);
            thumb.className = 'b-thumb';

            const text = document.createElement('div');
            text.className = 'b-text';
            text.innerHTML = `
                <span class="b-name">${bName(def)}<span class="b-key">${def.hotkey}</span></span>
                <span class="b-cost">${costHtml(def)}</span>
                <span class="b-info">${infoString(def)}</span>
            `;

            btn.appendChild(thumb);
            btn.appendChild(text);

            btn.addEventListener('click', () => {
                if (btn.classList.contains('disabled')) {
                    const reason = Game.getUnavailableReason(type);
                    showNotification(reason || t('g.notavailable'), 'warning');
                    AudioSys.play('error');
                    return;
                }
                selectBuilding(type);
            });
            btn.addEventListener('mouseenter', () => showBuildingTooltip(btn, type));
            btn.addEventListener('mouseleave', hideTooltip);
            els.buildingList.appendChild(btn);
        });
        updateBuildingButtons();
    }

    function costHtml(def) {
        const parts = [];
        if (def.cost.wood > 0) parts.push(`<span class="c-wood">${def.cost.wood} ${resName('wood')}</span>`);
        if (def.cost.stone > 0) parts.push(`<span class="c-stone">${def.cost.stone} ${resName('stone')}</span>`);
        if (def.cost.iron > 0) parts.push(`<span class="c-iron">${def.cost.iron} ${resName('iron')}</span>`);
        return parts.length ? parts.join(' · ') : `<span class="c-free">${t('free')}</span>`;
    }

    function infoString(def) {
        const parts = [];
        if (def.workers > 0) parts.push(t(def.workers > 1 ? 'menu.workers' : 'menu.worker', { n: def.workers }));
        if (def.provides.populationCap) parts.push(t('menu.villagers', { n: def.provides.populationCap }));
        if (def.provides.storage) parts.push(t('menu.storage', { n: def.provides.storage }));
        if (def.provides.productionBonus) parts.push(t('menu.bonus', { n: Math.round(def.provides.productionBonus * 100) }));
        if (def.production) {
            parts.push(t('menu.prod', { n: def.production.amount, res: resName(def.production.resource) }));
            if (def.production.growthDays) parts.push(t('menu.after', { n: def.production.growthDays }));
        }
        return parts.join(' · ');
    }

    function showBuildingTooltip(btn, type) {
        if (isCompact()) return;
        const def = BUILDINGS[type];
        const reason = Game.getUnavailableReason(type);
        let html = `<div class="tt-title">${bName(def)}</div><div class="tt-desc">${bDesc(def)}</div>`;
        html += `<div class="tt-row"><span>${t('tt.size')}</span><span>${t('tt.tiles', { w: def.width, h: def.height })}</span></div>`;
        html += `<div class="tt-row"><span>${t('tt.cost')}</span><span>${costHtml(def)}</span></div>`;
        if (def.workers) html += `<div class="tt-row"><span>${t('tt.workers')}</span><span>${t('tt.eats', { n: def.workers })}</span></div>`;
        if (def.production?.requires) html += `<div class="tt-row"><span>${t('tt.needs')}</span><span>${def.production.requires === 'FOREST' ? t('tt.forest') : t('tt.stone')}</span></div>`;
        if (reason) html += `<div class="tt-reason">${reason}</div>`;
        html += `<div class="tt-hint">${t('tt.hotkey', { k: def.hotkey })}</div>`;
        els.tooltip.innerHTML = html;
        els.tooltip.classList.remove('hidden');
        const r = btn.getBoundingClientRect();
        const tw = els.tooltip.offsetWidth;
        const th = els.tooltip.offsetHeight;
        let x = r.left - tw - 10;
        let y = Math.min(r.top, window.innerHeight - th - 10);
        if (x < 4) x = r.right + 10;
        els.tooltip.style.left = x + 'px';
        els.tooltip.style.top = y + 'px';
    }

    function hideTooltip() {
        els.tooltip.classList.add('hidden');
    }

    function selectBuilding(type) {
        if (selectedBuilding === type) {
            // Clicking the already selected building just confirms the choice (no surprise toggle)
            AudioSys.play('select');
            return;
        }
        selectedBuilding = type;
        justPlaced = null;
        pendingTouch = null;
        updatePlaceBanner();
        els.canvas.classList.add('placing');
        AudioSys.play('select');
        updateBuildingButtons();
        hideInfo();
        refreshPreview();
    }

    function deselectBuilding(silent) {
        if (selectedBuilding && !silent) AudioSys.play('deselect');
        selectedBuilding = null;
        placementPreview = null;
        justPlaced = null;
        pendingTouch = null;
        els.canvas.classList.remove('placing');
        updateBuildingButtons();
        updatePlaceBanner();
    }

    function updatePlaceBanner() {
        if (!els.placeBanner) return;
        if (!selectedBuilding) { els.placeBanner.classList.add('hidden'); return; }
        const touch = lastInputTouch || window.matchMedia('(pointer: coarse)').matches;
        els.placeText.textContent = t('pl.placing', { name: bName(selectedBuilding) });
        els.placeHint.textContent = touch ? t('pl.hint.touch') : t('pl.hint.mouse');
        els.placeCancel.title = t('pl.cancel');
        els.placeBanner.classList.remove('hidden');
    }

    function updateBuildingButtons() {
        const btns = els.buildingList.querySelectorAll('.building-btn');
        btns.forEach(btn => {
            const type = btn.dataset.type;
            const available = Game.isBuildingAvailable(type);
            btn.classList.toggle('disabled', !available);
            btn.classList.toggle('selected', type === selectedBuilding);
        });
        const castleBtn = els.buildingList.querySelector('.building-btn[data-type="castle"]');
        if (castleBtn) castleBtn.classList.toggle('pulse', !Game.hasCastle() && selectedBuilding !== 'castle');
    }

    // ---------- speed / top bar ----------
    function setupSpeedButtons() {
        $('speed-pause').addEventListener('click', () => setSpeed(0));
        $('speed-1x').addEventListener('click', () => setSpeed(1));
        $('speed-2x').addEventListener('click', () => setSpeed(2));
        $('speed-3x').addEventListener('click', () => setSpeed(3));
    }

    function setSpeed(speed) {
        Game.setSpeed(speed);
        AudioSys.play('click');
        syncSpeedButtons();
    }

    function syncSpeedButtons() {
        const gs = Game.getState();
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        const id = gs.paused ? 'speed-pause' : `speed-${gs.speed}x`;
        const el = $(id);
        if (el) el.classList.add('active');
        els.pauseBanner.classList.toggle('hidden', !(gs.paused && gs.started && !gs.gameOver));
    }

    function setupTopbarButtons() {
        els.muteBtn.addEventListener('click', () => {
            AudioSys.init();
            const muted = AudioSys.toggleMute();
            updateMuteButton();
            if (!muted) AudioSys.play('click');
        });
        els.helpBtn.addEventListener('click', () => {
            toggleHelp();
            AudioSys.play('click');
        });
        els.settingsBtn.addEventListener('click', () => {
            toggleSettings();
            AudioSys.play('click');
        });
        els.menuBtn.addEventListener('click', () => {
            AudioSys.play('click');
            confirmNewGame();
        });
        els.zoomIn.addEventListener('click', () => { Renderer.zoomStep(1); AudioSys.play('click'); updateZoomLabel(); });
        els.zoomOut.addEventListener('click', () => { Renderer.zoomStep(-1); AudioSys.play('click'); updateZoomLabel(); });
    }

    function confirmNewGame() {
        if (confirm(t('g.confirmnew'))) {
            if (onNewGame) onNewGame();
        }
    }

    function toggleHelp() {
        els.settingsScreen.classList.add('hidden');
        els.helpScreen.classList.toggle('hidden');
    }

    function toggleSettings() {
        els.helpScreen.classList.add('hidden');
        els.settingsScreen.classList.toggle('hidden');
        if (!els.settingsScreen.classList.contains('hidden')) syncSettingsUI();
    }

    function updateZoomLabel() {
        els.zoomLabel.textContent = Math.round(Renderer.getZoom() * 100) + '%';
    }

    let onNewGame = null;
    function setNewGameHandler(fn) { onNewGame = fn; }

    // ---------- settings dialog ----------
    function setupSettings() {
        els.settingsClose.addEventListener('click', () => { els.settingsScreen.classList.add('hidden'); AudioSys.play('click'); });
        els.settingsScreen.addEventListener('click', (e) => {
            if (e.target === els.settingsScreen) els.settingsScreen.classList.add('hidden');
        });
        els.langBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                AudioSys.play('click');
                Lang.set(btn.dataset.lang);
            });
        });
        els.toggleMusic.addEventListener('click', () => {
            AudioSys.init();
            AudioSys.toggleMusic();
            AudioSys.play('click');
            syncSettingsUI();
        });
        els.toggleFx.addEventListener('click', () => {
            Atmosphere.setEnabled(!Atmosphere.isEnabled());
            AudioSys.play('click');
            syncSettingsUI();
        });
        els.toggleSfx.addEventListener('click', () => {
            AudioSys.init();
            AudioSys.toggleSfx();
            AudioSys.play('click');
            syncSettingsUI();
        });
        els.settingsHelp.addEventListener('click', () => {
            AudioSys.play('click');
            toggleHelp();
        });
        els.settingsNew.addEventListener('click', () => {
            AudioSys.play('click');
            els.settingsScreen.classList.add('hidden');
            confirmNewGame();
        });
    }

    function syncSettingsUI() {
        els.langBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.lang === Lang.get()));
        setToggle(els.toggleMusic, AudioSys.isMusicOn());
        setToggle(els.toggleSfx, AudioSys.isSfxOn());
        setToggle(els.toggleFx, Atmosphere.isEnabled());
    }

    function setToggle(btn, on) {
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        const label = btn.querySelector('.toggle-label');
        if (label) label.textContent = on ? t('s.on') : t('s.off');
    }

    // ---------- canvas input ----------
    function getPointerPos(e) {
        const rect = els.canvas.getBoundingClientRect();
        const src = e.touches?.[0] || e.changedTouches?.[0] || e;
        return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    }

    function refreshPreview() {
        if (!selectedBuilding) { placementPreview = null; return; }
        const def = BUILDINGS[selectedBuilding];

        // Touch: the ghost stays where it was tapped until confirmed or moved
        if (pendingTouch) {
            const check = Game.canPlace(selectedBuilding, pendingTouch.tileX, pendingTouch.tileY);
            const s = Renderer.worldToScreen((pendingTouch.tileX + def.width) * TILE_SIZE, (pendingTouch.tileY + def.height) * TILE_SIZE);
            placementPreview = {
                type: selectedBuilding, tileX: pendingTouch.tileX, tileY: pendingTouch.tileY,
                valid: check.ok, reason: check.ok ? null : check.reason,
                hint: check.ok ? t('cv.tap', { name: bName(def) }) : null,
                screenX: s.x - 10, screenY: s.y - 14,
            };
            return;
        }
        if (!pointerOverCanvas || lastInputTouch) { placementPreview = null; return; }

        const tile = Renderer.screenToTile(lastPointer.x, lastPointer.y);
        // Right after building, keep quiet while the cursor is still on the new building
        if (justPlaced) {
            const b = justPlaced;
            if (tile.x >= b.tileX && tile.x < b.tileX + b.def.width && tile.y >= b.tileY && tile.y < b.tileY + b.def.height) {
                placementPreview = null;
                return;
            }
            justPlaced = null;
        }
        const tx = tile.x - Math.floor((def.width - 1) / 2);
        const ty = tile.y - Math.floor((def.height - 1) / 2);
        const check = Game.canPlace(selectedBuilding, tx, ty);
        placementPreview = {
            type: selectedBuilding,
            tileX: tx,
            tileY: ty,
            valid: check.ok,
            reason: check.ok ? null : check.reason,
            screenX: lastPointer.x,
            screenY: lastPointer.y,
        };
    }

    function anyOverlayOpen() {
        return !els.welcome.classList.contains('hidden') || !els.gameOver.classList.contains('hidden');
    }

    function setupEventListeners() {
        let isDragging = false;
        let dragStart = { x: 0, y: 0 };
        let cameraStart = { x: 0, y: 0 };
        let dragDistance = 0;
        let pinchDist = 0;

        function onPointerDown(e) {
            if (e.button !== undefined && e.button !== 0) return;
            if (e.touches && e.touches.length === 2) {
                pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                isDragging = false;
                e.preventDefault();
                return;
            }
            const p = getPointerPos(e);
            const wasTouch = lastInputTouch;
            lastInputTouch = !!e.touches;
            if (wasTouch !== lastInputTouch) updatePlaceBanner();
            isDragging = true;
            dragStart = p;
            dragDistance = 0;
            const cam = Renderer.getCamera();
            cameraStart = { x: cam.x, y: cam.y };
            pointerOverCanvas = true;
            lastPointer = p;
            if (e.touches) e.preventDefault();
        }

        function onPointerMove(e) {
            if (e.touches && e.touches.length === 2) {
                const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                if (pinchDist > 0) {
                    const rect = els.canvas.getBoundingClientRect();
                    const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
                    const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
                    Renderer.setZoom(Renderer.getZoom() * (d / pinchDist), cx, cy);
                    updateZoomLabel();
                }
                pinchDist = d;
                e.preventDefault();
                return;
            }
            const p = getPointerPos(e);
            lastPointer = p;
            pointerOverCanvas = e.target === els.canvas || isDragging;
            if (!e.touches && e.target === els.canvas && lastInputTouch && !isDragging) {
                lastInputTouch = false; // a real mouse is being used again
                updatePlaceBanner();
            }

            if (isDragging) {
                const dx = dragStart.x - p.x;
                const dy = dragStart.y - p.y;
                dragDistance = Math.sqrt(dx * dx + dy * dy);
                const z = Renderer.getZoom();
                Renderer.setCamera(cameraStart.x + dx / z, cameraStart.y + dy / z);
                if (dragDistance > 8) els.canvas.classList.add('dragging');
            }

            if (pointerOverCanvas) {
                const tile = Renderer.screenToTile(p.x, p.y);
                hoveredBuilding = selectedBuilding ? null : (BuildingManager.getBuildingAt(tile.x, tile.y) || null);
            } else {
                hoveredBuilding = null;
            }
            refreshPreview();
            if (e.touches) e.preventDefault();
        }

        function onPointerUp(e) {
            if (e.touches && e.touches.length > 0) return;
            pinchDist = 0;
            if (!isDragging) return;
            isDragging = false;
            els.canvas.classList.remove('dragging');

            if (dragDistance < 8) {
                const p = getPointerPos(e);
                lastPointer = p;
                pointerOverCanvas = true;
                refreshPreview();
                const tile = Renderer.screenToTile(p.x, p.y);

                if (selectedBuilding) {
                    const def0 = BUILDINGS[selectedBuilding];
                    if (e.changedTouches) {
                        // Touch: first tap positions the ghost, a tap on the ghost builds it
                        const pend = pendingTouch;
                        const onGhost = pend && tile.x >= pend.tileX && tile.x < pend.tileX + def0.width &&
                            tile.y >= pend.tileY && tile.y < pend.tileY + def0.height;
                        if (!onGhost) {
                            pendingTouch = { tileX: tile.x - Math.floor((def0.width - 1) / 2), tileY: tile.y - Math.floor((def0.height - 1) / 2) };
                            refreshPreview();
                            AudioSys.play('click');
                            return;
                        }
                    }
                    const pp = placementPreview;
                    const result = Game.placeBuilding(selectedBuilding, pp ? pp.tileX : tile.x, pp ? pp.tileY : tile.y);
                    if (result) {
                        AudioSys.play('buildStart');
                        Effects.dust(result.pixelX, result.pixelY, result.width, result.height);
                        justPlaced = result;
                        pendingTouch = null;
                        const def = BUILDINGS[selectedBuilding];
                        if ((def.limit !== null && BuildingManager.countByType(selectedBuilding) >= def.limit) ||
                            !Game.isBuildingAvailable(selectedBuilding)) {
                            deselectBuilding(true);
                        }
                        updateBuildingButtons();
                        refreshPreview();
                    } else {
                        AudioSys.play('error');
                    }
                } else {
                    const building = BuildingManager.getBuildingAt(tile.x, tile.y);
                    if (building) {
                        AudioSys.play('click');
                        showBuildingInfo(building);
                    } else {
                        hideInfo();
                    }
                }
            }
        }

        els.canvas.addEventListener('mousedown', onPointerDown);
        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);
        els.canvas.addEventListener('mouseleave', () => { pointerOverCanvas = false; hoveredBuilding = null; placementPreview = null; });
        els.canvas.addEventListener('mouseenter', () => { pointerOverCanvas = true; });

        els.canvas.addEventListener('touchstart', onPointerDown, { passive: false });
        window.addEventListener('touchmove', onPointerMove, { passive: false });
        window.addEventListener('touchend', onPointerUp);
        window.addEventListener('touchcancel', onPointerUp);

        els.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const p = getPointerPos(e);
            let d = e.deltaY;
            if (e.deltaMode === 1) d *= 33;
            else if (e.deltaMode === 2) d *= 400;
            if (e.ctrlKey) {
                // Trackpad pinch arrives as ctrl+wheel: zoom smoothly
                Renderer.setZoom(Renderer.getZoom() * Math.exp(-d * 0.01), p.x, p.y);
            } else {
                // Collect small trackpad deltas; one mouse-wheel notch (~100) is one zoom step
                const now = performance.now();
                if (now - wheelT > 300) wheelAcc = 0;
                wheelT = now;
                wheelAcc += d;
                if (Math.abs(wheelAcc) < 60) return;
                Renderer.zoomStep(wheelAcc < 0 ? 1 : -1, p.x, p.y);
                wheelAcc = 0;
            }
            updateZoomLabel();
            refreshPreview();
        }, { passive: false });

        els.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (selectedBuilding) deselectBuilding();
            else hideInfo();
        });

        document.addEventListener('keydown', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
            const k = e.key;

            // Dialogs that can be closed with Escape
            if (k === 'Escape') {
                if (!els.helpScreen.classList.contains('hidden')) { els.helpScreen.classList.add('hidden'); return; }
                if (!els.settingsScreen.classList.contains('hidden')) { els.settingsScreen.classList.add('hidden'); return; }
            }
            if (anyOverlayOpen()) return;

            keys.add(k.toLowerCase());

            if (k === 'Escape') {
                if (selectedBuilding) deselectBuilding();
                else hideInfo();
            } else if (k === ' ') {
                e.preventDefault();
                Game.togglePause();
                AudioSys.play('click');
                syncSpeedButtons();
            } else if (k === '1' || k === '2' || k === '3') {
                setSpeed(parseInt(k, 10));
            } else if (k === '+' || k === '=') {
                Renderer.zoomStep(1); updateZoomLabel();
            } else if (k === '-' || k === '_') {
                Renderer.zoomStep(-1); updateZoomLabel();
            } else if (k.toLowerCase() === 'm') {
                els.muteBtn.click();
            } else if (k.toLowerCase() === 'o') {
                toggleSettings();
            } else if (k === 'h' || k === 'H' || k === '?') {
                toggleHelp();
            } else if (k === 'Delete' || k === 'Backspace') {
                if (selectedPlaced) tryDemolish(selectedPlaced.id);
            } else if (k === 'c' || k === 'C') {
                const castle = BuildingManager.getAll().find(b => b.type === 'castle');
                if (castle) Renderer.centerOn(castle.pixelX + castle.width / 2, castle.pixelY + castle.height / 2);
            } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                const type = BUILD_ORDER.find(bt => BUILDINGS[bt].hotkey.toLowerCase() === k.toLowerCase());
                if (type) {
                    if (Game.isBuildingAvailable(type)) selectBuilding(type);
                    else { showNotification(Game.getUnavailableReason(type), 'warning'); AudioSys.play('error'); }
                }
            }
        });
        document.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
        window.addEventListener('blur', () => keys.clear());
    }

    // Called every frame: keyboard panning, minimap, day bar
    function tick(dtSec) {
        let dx = 0, dy = 0;
        if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
        if (keys.has('arrowright') || keys.has('d')) dx += 1;
        if (keys.has('arrowup') || keys.has('w')) dy -= 1;
        if (keys.has('arrowdown') || keys.has('s')) dy += 1;
        dx = Math.sign(dx); dy = Math.sign(dy);
        if (dx || dy) {
            const speed = 600 * dtSec;
            Renderer.moveCamera(dx * speed, dy * speed);
            refreshPreview();
        }
        if (els.minimap && !els.minimap.classList.contains('hidden')) {
            minimapFrame = (minimapFrame + 1) % 3;
            if (minimapFrame === 0) Renderer.renderMinimap(minimapCtx, els.minimap.width, els.minimap.height);
        }
        const gs = Game.getState();
        if (els.dayProgress) els.dayProgress.style.width = (gs.dayProgress * 100).toFixed(1) + '%';
        updateSky(gs);
    }

    // ---------- sky / weather indicator ----------
    let lastSkyIcon = '', lastSkyTitle = '';
    function updateSky(gs) {
        const icon = Atmosphere.getSkyIcon();
        if (icon !== lastSkyIcon && els.iconDay) {
            els.iconDay.innerHTML = '';
            els.iconDay.appendChild(Sprites.drawIcon(icon));
            lastSkyIcon = icon;
        }
        const title = t('weather.title', { n: gs.day, w: t('weather.' + Atmosphere.getWeather()) });
        if (title !== lastSkyTitle && els.dayRes) {
            els.dayRes.title = title;
            lastSkyTitle = title;
        }
    }

    // ---------- minimap ----------
    let minimapCtx = null;
    let minimapFrame = 0;
    function setupMinimap() {
        if (!els.minimap) return;
        minimapCtx = els.minimap.getContext('2d');
        let down = false;
        const moveTo = (e) => {
            const r = els.minimap.getBoundingClientRect();
            const src = e.touches?.[0] || e;
            const fx = (src.clientX - r.left) / r.width;
            const fy = (src.clientY - r.top) / r.height;
            Renderer.centerOn(fx * MAP_PIXEL_W, fy * MAP_PIXEL_H);
        };
        els.minimap.addEventListener('mousedown', (e) => { down = true; moveTo(e); });
        window.addEventListener('mousemove', (e) => { if (down) moveTo(e); });
        window.addEventListener('mouseup', () => { down = false; });
        els.minimap.addEventListener('touchstart', (e) => { moveTo(e); e.preventDefault(); }, { passive: false });
        els.minimap.addEventListener('touchmove', (e) => { moveTo(e); e.preventDefault(); }, { passive: false });
    }

    // ---------- info panel ----------
    function showBuildingInfo(building) {
        selectedPlaced = building;
        els.infoTitle.textContent = bName(building.def);
        let html = `<p class="info-desc">${bDesc(building.def)}</p>`;

        if (building.maxWorkers > 0) {
            html += `<div class="stat"><span class="stat-label">${t('info.workers')}</span><span>${building.workers} / ${building.maxWorkers}</span></div>`;
        }
        if (building.def.production) {
            const prod = building.def.production;
            const out = Game.getBuildingOutput(building);
            const status = building.grown
                ? (building.active ? `<span class="ok">${t('info.active')}</span>` : `<span class="bad">${t('info.noworkers')}</span>`)
                : t('info.growing', { a: building.growthProgress, b: prod.growthDays });
            const bonus = out > prod.amount ? ` <span class="ok">${t('info.bonus.inline', { n: (out - prod.amount).toFixed(1) })}</span>` : '';
            html += `<div class="stat"><span class="stat-label">${t('info.production')}</span><span>${t('menu.prod', { n: prod.amount, res: resName(prod.resource) })}${bonus}</span></div>`;
            html += `<div class="stat"><span class="stat-label">${t('info.status')}</span><span>${status}</span></div>`;
        }
        if (building.def.provides.populationCap) {
            html += `<div class="stat"><span class="stat-label">${t('info.housing')}</span><span>${t('menu.villagers', { n: building.def.provides.populationCap })}</span></div>`;
        }
        if (building.def.provides.storage) {
            html += `<div class="stat"><span class="stat-label">${t('info.storage')}</span><span>+${building.def.provides.storage}</span></div>`;
        }
        if (building.def.provides.productionBonus) {
            html += `<div class="stat"><span class="stat-label">${t('info.bonus')}</span><span>${t('info.bonus.value', { n: Math.round(building.def.provides.productionBonus * 100) })}</span></div>`;
        }
        html += `<div class="stat"><span class="stat-label">${t('info.built')}</span><span>${t('info.day', { n: building.dayPlaced })}</span></div>`;
        els.infoContent.innerHTML = html;

        els.infoActions.innerHTML = '';
        if (building.type !== 'castle') {
            const refund = ['wood', 'stone', 'iron']
                .map(r => [r, Math.floor(building.def.cost[r] * DEMOLISH_REFUND)])
                .filter(([, a]) => a > 0)
                .map(([r, a]) => `+${a} ${resName(r)}`).join(', ');
            const btn = document.createElement('button');
            btn.className = 'danger-btn';
            btn.textContent = refund ? t('info.demolish.refund', { r: refund }) : t('info.demolish');
            btn.title = t('info.demolish.title');
            btn.addEventListener('click', () => tryDemolish(building.id));
            els.infoActions.appendChild(btn);
        }
        els.infoPanel.classList.remove('hidden');
    }

    function tryDemolish(id) {
        const b = BuildingManager.getById(id);
        if (!b) return;
        const ok = Game.demolishBuilding(id);
        if (ok) {
            AudioSys.play('demolish');
            Effects.dust(b.pixelX, b.pixelY, b.width, b.height);
            hideInfo();
        } else {
            AudioSys.play('error');
        }
    }

    function hideInfo() {
        selectedPlaced = null;
        els.infoPanel.classList.add('hidden');
    }

    // ---------- resources ----------
    function updateResources() {
        const gs = Game.getState();
        const rates = Game.getRates();
        const foodNet = rates.food - Game.getFoodConsumption();

        function fmt(val, rate) {
            const v = Math.floor(val);
            let s = `${v}`;
            const r = Math.round(rate * 10) / 10;
            if (r > 0) s += ` <span class="rate up">+${r}</span>`;
            else if (r < 0) s += ` <span class="rate down">${r}</span>`;
            return s;
        }

        els.resWood.innerHTML = fmt(gs.resources.wood, rates.wood);
        els.resStone.innerHTML = fmt(gs.resources.stone, rates.stone);
        els.resIron.innerHTML = fmt(gs.resources.iron, rates.iron);
        els.resFood.innerHTML = fmt(gs.resources.food, foodNet);
        els.resPop.textContent = `${gs.populationUsed} / ${gs.populationCap}`;
        els.resDay.textContent = t('res.day', { n: gs.day });
        if (els.storageLabel) els.storageLabel.textContent = `${gs.maxStorage}`;

        ['wood', 'stone', 'iron', 'food'].forEach(r => {
            const el = els['res' + r[0].toUpperCase() + r.slice(1)];
            el.parentElement.classList.toggle('full', gs.resources[r] >= gs.maxStorage - 0.01);
            el.parentElement.title = t('res.storage.value', { name: t('res.' + r[0].toUpperCase() + r.slice(1)), v: Math.floor(gs.resources[r]), max: gs.maxStorage });
        });
        els.resFood.parentElement.classList.toggle('danger', gs.starvationDays > 0 || (foodNet < 0 && gs.resources.food < -foodNet * 3));
        els.resPop.parentElement.title = t('res.pop.title', { used: gs.populationUsed, cap: gs.populationCap, free: Game.getFreeWorkers() });

        const next = Game.getNextMilestone();
        if (els.goalText) {
            els.goalText.textContent = next ? t('ms.' + next.id) : t('menu.goal.done');
            els.goalCount.textContent = `${gs.milestones.length}/${MILESTONES.length}`;
        }

        updateBuildingButtons();
        syncSpeedButtons();
    }

    // ---------- notifications ----------
    const notifSounds = { warning: 'warning', danger: 'warning', success: null, grown: 'grown', info: null };
    function showNotification(message, type = 'info') {
        const existing = Array.from(els.notifications.children).find(n => n.dataset.msg === message);
        if (existing) existing.remove();
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.dataset.msg = message;
        div.textContent = message;
        els.notifications.appendChild(div);
        const maxNotes = isCompact() ? 2 : 4;
        while (els.notifications.children.length > maxNotes) els.notifications.firstChild.remove();
        const life = type === 'danger' ? 4500 : 3200;
        div.style.animationDuration = `0.3s, 0.5s`;
        div.style.animationDelay = `0s, ${(life - 500) / 1000}s`;
        setTimeout(() => div.remove(), life);
        const snd = notifSounds[type];
        if (snd) AudioSys.play(snd);
    }

    function showMilestone(m) {
        const div = document.createElement('div');
        div.className = 'notification milestone';
        div.innerHTML = `<span class="m-label">${t('g.milestone')}</span> ${t('ms.' + m.id)}`;
        els.notifications.appendChild(div);
        div.style.animationDelay = `0s, 4.5s`;
        setTimeout(() => div.remove(), 5000);
        AudioSys.play('milestone');
        updateResources();
    }

    // ---------- overlays ----------
    function showGameOver() {
        const gs = Game.getState();
        els.gameOverStats.innerHTML = `
            <div class="stat"><span class="stat-label">${t('go.days')}</span><span>${gs.day}</span></div>
            <div class="stat"><span class="stat-label">${t('go.built')}</span><span>${gs.stats.built}</span></div>
            <div class="stat"><span class="stat-label">${t('go.pop')}</span><span>${gs.stats.maxPop}</span></div>
            <div class="stat"><span class="stat-label">${t('go.ms')}</span><span>${gs.milestones.length} / ${MILESTONES.length}</span></div>
        `;
        els.gameOver.classList.remove('hidden');
        deselectBuilding(true);
        hideInfo();
        AudioSys.play('gameOver');
    }

    function hideWelcome() {
        els.welcome.classList.add('hidden');
    }

    function showWelcome() {
        const info = Game.getSaveInfo();
        if (info) {
            els.continueBtn.classList.remove('hidden');
            els.continueBtn.textContent = t('w.continue', { day: info.day, n: info.buildings });
        } else {
            els.continueBtn.classList.add('hidden');
        }
        els.welcome.classList.remove('hidden');
    }

    function getPlacementPreview() { return placementPreview; }
    function getHoverInfo() { return { building: hoveredBuilding, selected: selectedPlaced }; }

    function getStartBtn() { return els.startBtn; }
    function getContinueBtn() { return els.continueBtn; }
    function getRestartBtn() { return els.restartBtn; }
    function getGameOverEl() { return els.gameOver; }

    return {
        init,
        tick,
        selectBuilding,
        deselectBuilding,
        updateResources,
        updateBuildingButtons,
        showNotification,
        showMilestone,
        showGameOver,
        hideWelcome,
        showWelcome,
        hideInfo,
        getPlacementPreview,
        getHoverInfo,
        getStartBtn,
        getContinueBtn,
        getRestartBtn,
        getGameOverEl,
        setNewGameHandler,
        syncSpeedButtons,
        updateZoomLabel,
        updateInsets,
    };
})();
