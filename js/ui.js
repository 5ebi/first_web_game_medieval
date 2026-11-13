// ============================================
// UI Manager
// ============================================

const UI = (() => {
    let selectedBuilding = null;   // building type to place
    let selectedPlaced = null;     // placed building shown in the info panel
    let selectedVillager = null;   // villager shown in the info panel
    let selectedUnit = null;       // soldier shown in the info panel
    let activeCat = 'castle';      // open building category
    let bodyOpen = true;           // phones: the building strip can be folded away
    let hoveredBuilding = null;
    let placementPreview = null;
    let pointerOverCanvas = false;
    let justPlaced = null;      // building placed last; no ghost while the cursor is still on it
    let pendingTouch = null;    // touch: ghost position waiting for a confirming second tap
    let lastInputTouch = false;
    let wheelAcc = 0, wheelT = 0;
    let lastPointer = { x: 0, y: 0 };
    let isDragging = false;     // a mouse button / finger is down on the map
    const keys = new Set();
    const EDGE_PX = 12;         // mouse this close to the map area's edge scrolls the camera
    const EDGE_SPEED = 700;     // screen px per second at the very edge
    const noHover = window.matchMedia ? window.matchMedia('(hover: none)') : { matches: false };

    // DOM elements
    let els = {};

    function $(id) { return document.getElementById(id); }

    function init() {
        els = {
            resWood: $('res-wood'),
            resStone: $('res-stone'),
            resIron: $('res-iron'),
            resFood: $('res-food'),
            foodRes: $('food-res'),
            foodPop: $('food-pop'),
            resPop: $('res-pop'),
            resDay: $('res-day'),
            dayProgress: $('day-progress'),
            storageLabel: $('res-storage'),
            commandPanel: $('command-panel'),
            cpCats: $('cp-cats'),
            cpBuild: $('cp-build'),
            cpBody: $('cp-body'),
            infoPortrait: $('info-portrait'),
            infoPanel: $('info-panel'),
            infoTitle: $('info-title'),
            infoContent: $('info-content'),
            infoClose: $('info-close'),
            infoActions: $('info-actions'),
            infoControls: $('info-controls'),
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
            toggleEdge: $('toggle-edge'),
            dayRes: $('day-res'),
            iconDay: $('icon-day'),
            seasonRes: $('season-res'),
            iconSeason: $('icon-season'),
            resSeason: $('res-season'),
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
        setupFoodPop();
        updateInsets();
        window.addEventListener('resize', updateInsets);

        els.infoClose.addEventListener('click', () => hideInfo());
        els.placeCancel.addEventListener('click', () => deselectBuilding());
        if (window.ResizeObserver) new ResizeObserver(updateInsets).observe(els.commandPanel);
        // links inside the info scroll (e.g. a villager's workplace)
        els.infoContent.addEventListener('click', (e) => {
            const only = e.target.closest('[data-seltype]');
            if (only) {
                // narrow the selection to one kind of soldier
                Units.select(Units.getSelected().filter(u => u.type === only.dataset.seltype).map(u => u.id));
                AudioSys.play('click');
                showSelection();
                return;
            }
            const go = e.target.closest('[data-goto]');
            if (!go) return;
            const b = BuildingManager.getById(Number(go.dataset.goto));
            if (!b) return;
            AudioSys.play('click');
            Renderer.centerOn(b.pixelX + b.width / 2, b.pixelY + b.height / 2);
            showBuildingInfo(b);
        });
        // smith product toggle and barracks recruit buttons
        els.infoControls.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (btn && btn.dataset.order) { onOrderButton(btn.dataset.order); return; }
            if (!btn || !selectedPlaced) return;
            if (btn.dataset.product) {
                if (Game.setSmithProduct(selectedPlaced.id, btn.dataset.product)) AudioSys.play('click');
            } else if (btn.dataset.recruit) {
                const reason = Game.getRecruitReason(btn.dataset.recruit);
                if (reason) { showNotification(reason, 'warning'); AudioSys.play('error'); return; }
                if (Game.recruit(selectedPlaced.id, btn.dataset.recruit)) {
                    AudioSys.play('buildDone');
                    // the first soldier: tell how to command him
                    if (Units.getAll().length === 1) showNotification(t(lastInputTouch ? 'sel.tip.touch' : 'sel.tip.mouse'), 'info');
                }
            }
            refreshControls(true);
            infoRefreshT = 0;
        });
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
        // the top bar wraps into two rows on phones: toasts and panels must start below it
        document.documentElement.style.setProperty('--bar-bottom', top + 'px');
        const bottom = els.commandPanel.offsetHeight || 0;
        document.documentElement.style.setProperty('--panel-top', bottom + 'px');
        Renderer.setInsets({ top, right: 0, bottom, left: 0 });
    }

    // ---------- language ----------
    function onLanguageChanged() {
        Lang.applyDom();
        buildBuildingMenu();
        updateResources();
        updateMuteButton();
        if (selectedPlaced) showBuildingInfo(selectedPlaced);
        else if (unitView) showSelection();
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
    // Categories are always visible as tabs; one click shows their buildings.
    const CATEGORIES = [
        { id: 'castle', icon: 'castle', types: ['castle', 'warehouse'] },
        { id: 'industry', icon: 'wood', types: ['lumberjack', 'quarry', 'iron_mine'] },
        { id: 'food', icon: 'food', types: ['hunter'] },
        { id: 'town', icon: 'pop', types: ['house', 'tavern'] },
        { id: 'military', icon: 'sword', types: ['weaponsmith', 'barracks'] },
    ];
    const catOf = type => (CATEGORIES.find(c => c.types.includes(type)) || CATEGORIES[0]).id;
    const GOAL_BUILDING = {
        castle: 'castle', warehouse: 'warehouse', lumberjack: 'lumberjack', hunter: 'hunter', quarry: 'quarry',
        houses2: 'house', workers15: 'house', winter1: 'hunter', iron20: 'iron_mine', weaponsmith: 'weaponsmith', soldier1: 'barracks', pop30: 'house',
    };

    const iconUrls = {};
    function iconUrl(name) {
        if (!iconUrls[name]) iconUrls[name] = Sprites.drawIcon(name).toDataURL();
        return iconUrls[name];
    }
    function ic(name) { return `<img class="ic" src="${iconUrl(name)}" alt="">`; }

    function thumbUrl(type, size) {
        const key = 'thumb_' + type + size;
        if (!iconUrls[key]) iconUrls[key] = Sprites.getBuildingThumb(type, size).toDataURL();
        return iconUrls[key];
    }

    function buildBuildingMenu() {
        els.cpCats.innerHTML = '';
        CATEGORIES.forEach(cat => {
            const tab = document.createElement('button');
            tab.className = 'cp-cat';
            tab.dataset.cat = cat.id;
            tab.setAttribute('role', 'tab');
            tab.innerHTML = `<img class="cat-ic" src="${cat.id === 'castle' ? thumbUrl('castle', 32) : iconUrl(cat.icon)}" alt=""><span class="cat-name">${t('cat.' + cat.id)}</span><span class="cat-dot"></span>`;
            tab.addEventListener('click', () => openCategory(cat.id, true));
            els.cpCats.appendChild(tab);
        });

        els.cpBuild.innerHTML = '';
        CATEGORIES.forEach(cat => cat.types.forEach(type => {
            const def = BUILDINGS[type];
            const btn = document.createElement('button');
            btn.className = 'cp-bld';
            btn.dataset.type = type;
            btn.dataset.cat = cat.id;
            btn.innerHTML = `
                <span class="bld-pic"><img src="${thumbUrl(type, 56)}" alt=""></span>
                <span class="bld-text">
                    <span class="bld-name">${bName(def)}<span class="b-key">${def.hotkey}</span></span>
                    <span class="b-cost"></span>
                    <span class="b-info">${infoHtml(def)}</span>
                    <span class="b-lock"></span>
                </span>
                <span class="b-badge">${t('b.goal')}</span>`;
            btn.addEventListener('click', () => {
                if (btn.classList.contains('disabled')) {
                    showNotification(Game.getUnavailableReason(type) || t('g.notavailable'), 'warning');
                    AudioSys.play('error');
                    btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
                    return;
                }
                selectBuilding(type);
            });
            btn.addEventListener('mouseenter', () => showBuildingTooltip(btn, type));
            btn.addEventListener('mouseleave', hideTooltip);
            els.cpBuild.appendChild(btn);
        }));
        openCategory(activeCat, false);
        updateBuildingButtons();
    }

    // Show a category's buildings. Clicking the open tab again on a phone folds the strip.
    function openCategory(id, fromClick) {
        const infoOpen = !els.infoPanel.classList.contains('hidden');
        if (fromClick) {
            AudioSys.play('click');
            if (isCompact() && id === activeCat && bodyOpen && !infoOpen) bodyOpen = false;
            else bodyOpen = true;
            if (infoOpen) hideInfo();
        }
        activeCat = id;
        els.cpBuild.querySelectorAll('.cp-bld').forEach(btn => {
            btn.classList.toggle('in-cat', btn.dataset.cat === id);
        });
        syncBody();
    }

    function syncBody() {
        const infoOpen = !els.infoPanel.classList.contains('hidden');
        const open = bodyOpen || !isCompact() || infoOpen;
        els.commandPanel.classList.toggle('folded', !open);
        els.commandPanel.classList.toggle('info-open', infoOpen);
        syncTabs(infoOpen);
        updateInsets();
    }

    // While the scroll shows a building, villager or soldiers no category is open,
    // so no tab may look open either (one tap on any tab goes back to building).
    function syncTabs(infoOpen) {
        els.cpCats.querySelectorAll('.cp-cat').forEach(tab => {
            const on = tab.dataset.cat === activeCat && !infoOpen && (bodyOpen || !isCompact());
            tab.classList.toggle('active', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
        });
    }

    // Cost with resource icons; amounts you cannot pay yet are red
    function costIconsHtml(type) {
        const cost = Game.getCost(type);
        const res = Game.getState().resources;
        const parts = ['wood', 'stone', 'iron'].filter(r => cost[r] > 0)
            .map(r => `<span class="ci${res[r] < cost[r] ? ' missing' : ''}">${ic(r)}${cost[r]}</span>`);
        return parts.length ? parts.join('') : `<span class="c-free">${t('free')}</span>`;
    }

    // Workers and what the building gives, as compact icon chips
    function infoHtml(def) {
        const parts = [];
        if (def.workers > 0) parts.push(`<span class="ci">${ic('pop')}${def.workers}</span>`);
        if (def.production) {
            const p = def.production;
            parts.push(`<span class="ci up">${ic(p.resource)}+${fmtNum(p.amount * 60 / p.cycle)}/min</span>`);
        }
        if (def.provides.populationCap) parts.push(`<span class="ci up">+${def.provides.populationCap} ${ic('pop')}</span>`);
        if (def.provides.storage) parts.push(`<span class="ci up">${ic('storage')}+${def.provides.storage}</span>`);
        if (def.crafts) parts.push(`<span class="ci up">${Object.keys(WEAPONS).map(w => ic(w)).join('')}</span>`);
        if (def.recruits) parts.push(`<span class="ci up">${ic('shield')}</span>`);
        return parts.join('');
    }

    // Short reason on the card itself (the full one is shown when tapping it)
    function shortReason(type) {
        const def = BUILDINGS[type];
        if (def.limit !== null && BuildingManager.countByType(type) >= def.limit) return t('b.built');
        if (type !== 'castle' && !Game.hasCastle()) return t('lock.castle');
        if (type !== 'castle' && type !== 'warehouse' && !Game.hasWarehouse()) return t('lock.warehouse');
        const cost = Game.getCost(type), res = Game.getState().resources;
        const missing = ['wood', 'stone', 'iron'].filter(r => cost[r] > res[r])
            .map(r => `${Math.ceil(cost[r] - res[r])} ${resName(r)}`);
        if (missing.length) return t('lock.missing', { list: missing.join(', ') });
        const free = Game.getFreeWorkers();
        if (def.workers > free) return t('lock.workers', { n: def.workers, have: free });
        return '';
    }

    function costHtml(def) {
        const parts = [];
        const cost = Game.getCost(def.key);
        if (cost.wood > 0) parts.push(`<span class="c-wood">${cost.wood} ${resName('wood')}</span>`);
        if (cost.stone > 0) parts.push(`<span class="c-stone">${cost.stone} ${resName('stone')}</span>`);
        if (cost.iron > 0) parts.push(`<span class="c-iron">${cost.iron} ${resName('iron')}</span>`);
        return parts.length ? parts.join(' · ') : `<span class="c-free">${t('free')}</span>`;
    }

    function infoString(def) {
        const parts = [];
        if (def.workers > 0) parts.push(t(def.workers > 1 ? 'menu.workers' : 'menu.worker', { n: def.workers }));
        if (def.provides.populationCap) parts.push(t('menu.villagers', { n: def.provides.populationCap }));
        if (def.provides.storage) parts.push(t('menu.storage', { n: def.provides.storage }));
        if (def.crafts) parts.push(`${t('info.forges')}: ${Object.keys(WEAPONS).map(w => wName(w, 2)).join(', ')}`);
        if (def.production) {
            parts.push(t('menu.prod', { n: fmtNum(def.production.amount * 60 / def.production.cycle), res: resName(def.production.resource) }));
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
        if (def.workers) html += `<div class="tt-row"><span>${t('tt.workers')}</span><span>${t('tt.eats', { n: def.workers, f: fmtNum(FOOD_PER_WORKER_PER_MIN) })}</span></div>`;
        if (def.production) {
            const p = def.production;
            html += `<div class="tt-row"><span>${t('info.production')}</span><span>${t('tt.batch', { a: p.amount, res: resName(p.resource), s: p.cycle })}</span></div>`;
        }
        if (def.onStone) html += `<div class="tt-row"><span>${t('tt.needs')}</span><span>${t('tt.onstone')}</span></div>`;
        if (def.production?.resource === 'food') {
            const wm = SEASONS.find(s => s.id === 'winter').food[def.key];
            if (wm !== undefined && wm !== 1) html += `<div class="tt-row"><span>${t('tt.winter')}</span><span>${wm === 0 ? t('season.rest') : '×' + fmtNum(wm)}</span></div>`;
        }
        if (def.production?.requires) html += `<div class="tt-row"><span>${t('tt.needs')}</span><span>${def.production.requires === 'FOREST' ? t('tt.forest') : t('tt.stone')}</span></div>`;
        if (reason) html += `<div class="tt-reason">${reason}</div>`;
        html += `<div class="tt-hint">${t('tt.hotkey', { k: def.hotkey })}</div>`;
        els.tooltip.innerHTML = html;
        els.tooltip.classList.remove('hidden');
        const r = btn.getBoundingClientRect();
        const tw = els.tooltip.offsetWidth;
        const th = els.tooltip.offsetHeight;
        let x = Math.max(6, Math.min(window.innerWidth - tw - 6, r.left + r.width / 2 - tw / 2));
        let y = Math.max(6, r.top - th - 10);
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
        if (catOf(type) !== activeCat) openCategory(catOf(type), false);
        if (isCompact()) { bodyOpen = false; openCategory(activeCat, false); }
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
        document.getElementById('game-container').classList.toggle('is-placing', !!selectedBuilding);
        if (!selectedBuilding) { els.placeBanner.classList.add('hidden'); return; }
        const touch = lastInputTouch || window.matchMedia('(pointer: coarse)').matches;
        els.placeText.textContent = t('pl.placing', { name: bName(selectedBuilding) });
        els.placeHint.textContent = touch ? t('pl.hint.touch') : t('pl.hint.mouse');
        els.placeCancel.title = t('pl.cancel');
        els.placeBanner.classList.remove('hidden');
    }

    function updateBuildingButtons() {
        const next = Game.getNextMilestone();
        const goalType = next ? GOAL_BUILDING[next.id] : null;
        const readyCats = new Set();
        els.cpBuild.querySelectorAll('.cp-bld').forEach(btn => {
            const type = btn.dataset.type;
            const def = BUILDINGS[type];
            const available = Game.isBuildingAvailable(type);
            const done = def.limit !== null && BuildingManager.countByType(type) >= def.limit;
            btn.classList.toggle('disabled', !available);
            btn.classList.toggle('done', done);
            btn.classList.toggle('selected', type === selectedBuilding);
            btn.classList.toggle('recommended', type === goalType && !done);
            btn.setAttribute('aria-disabled', available ? 'false' : 'true');
            // the castle disappears from the menu once it stands
            btn.classList.toggle('gone', type === 'castle' && done);
            const costEl = btn.querySelector('.b-cost');
            const costHtmlNow = costIconsHtml(type);
            if (costEl.innerHTML !== costHtmlNow) costEl.innerHTML = costHtmlNow;
            const lockEl = btn.querySelector('.b-lock');
            const reason = available ? '' : shortReason(type);
            if (lockEl.textContent !== reason) lockEl.textContent = reason;
            if (type === goalType && available) readyCats.add(btn.dataset.cat);
        });
        els.cpCats.querySelectorAll('.cp-cat').forEach(tab => tab.classList.toggle('goal', readyCats.has(tab.dataset.cat)));
        const castleBtn = els.cpBuild.querySelector('.cp-bld[data-type="castle"]');
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
        els.toggleEdge.addEventListener('click', () => {
            Settings.set('edgeScroll', !Settings.get('edgeScroll'));
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
        setToggle(els.toggleEdge, !!Settings.get('edgeScroll'));
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

    // ---------- soldiers: selection and orders ----------
    // Desktop: click / shift-click / double-click / left-drag box select, right-click moves,
    // right- or middle-drag pans (left-drag pans too while you have no soldiers).
    // Phones: tap selects, double tap selects the type, long press + drag draws a box,
    // tap on the ground moves, one-finger drag always pans.
    let orderMode = null;      // null | 'move' | 'patrol' | 'patrolAdd': waits for a target point
    let unitView = false;      // the info scroll shows the soldier selection
    let selBox = null;         // { x0, y0, x1, y1 } screen rect while box-selecting
    let orderMarker = null;    // { x, y, t, kind } last order's destination
    let lastClick = { t: 0, x: 0, y: 0, type: null };

    function setOrderMode(mode) {
        orderMode = mode;
        els.canvas.classList.toggle('ordering', !!mode);
        if (unitView) { refreshControls(true); infoRefreshT = 0; }
    }

    // Visible part of the map in world coordinates (between the top bar and the panel)
    function visibleWorldRect() {
        const top = els.resourceBar.offsetHeight || 0;
        const bottom = window.innerHeight - (els.commandPanel.offsetHeight || 0);
        const a = Renderer.screenToWorld(0, top), b = Renderer.screenToWorld(window.innerWidth, Math.max(top + 1, bottom));
        return [a.x, a.y, b.x, b.y];
    }

    function selectTypeOnScreen(type, add) {
        const ids = Units.inRect(...visibleWorldRect()).filter(u => u.type === type).map(u => u.id);
        Units.select(ids, add);
    }

    function issueOrder(kind, w, keep) {
        const sel = Units.getSelected();
        if (!sel.length) { setOrderMode(null); return false; }
        let n;
        if (kind === 'stop') { Units.stop(); AudioSys.play('click'); setOrderMode(null); infoRefreshT = 0; return true; }
        if (kind === 'patrol' || kind === 'patrolAdd') n = Units.patrolTo(null, w.x, w.y, kind === 'patrolAdd');
        else n = Units.moveTo(null, w.x, w.y);
        if (!n) {
            AudioSys.play('error');
            showNotification(t('sel.noway'), 'warning');
        } else {
            AudioSys.play('click');
            orderMarker = { x: w.x, y: w.y, t: performance.now(), kind: kind === 'move' ? 'move' : 'patrol' };
        }
        // shift keeps adding patrol points
        setOrderMode(keep && kind !== 'move' ? 'patrolAdd' : null);
        infoRefreshT = 0;
        return n > 0;
    }

    function setupEventListeners() {
        isDragging = false;
        let dragMode = 'pan';      // 'pan' | 'box'
        let dragStart = { x: 0, y: 0 };
        let cameraStart = { x: 0, y: 0 };
        let dragDistance = 0;
        let pinchDist = 0;
        let longPress = null;
        let dragButton = 0;

        function cancelLongPress() { if (longPress) { clearTimeout(longPress); longPress = null; } }

        function onPointerDown(e) {
            const btn = e.button === undefined ? 0 : e.button;
            if (btn > 2) return;
            if (e.touches && e.touches.length === 2) {
                pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                isDragging = false;
                selBox = null;
                cancelLongPress();
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
            dragButton = btn;
            // Mouse: left-drag draws a selection box once you have soldiers (Stronghold style)
            dragMode = !e.touches && btn === 0 && !selectedBuilding && !orderMode && Units.getAll().length > 0 ? 'box' : 'pan';
            const cam = Renderer.getCamera();
            cameraStart = { x: cam.x, y: cam.y };
            pointerOverCanvas = true;
            lastPointer = p;
            cancelLongPress();
            if (e.touches && !selectedBuilding && Units.getAll().length > 0) {
                // Touch: hold still, then drag, to draw a selection box
                longPress = setTimeout(() => {
                    longPress = null;
                    if (!isDragging || dragDistance >= 8) return;
                    dragMode = 'box';
                    selBox = { x0: dragStart.x, y0: dragStart.y, x1: dragStart.x, y1: dragStart.y };
                    try { window.getSelection()?.removeAllRanges(); } catch (_) { /* no selection API */ }
                    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (_) { /* not allowed */ } }
                    AudioSys.play('select');
                }, 420);
            }
            if (btn === 1) e.preventDefault();
            if (e.touches) e.preventDefault();
        }

        function onPointerMove(e) {
            // Touches that did not start on the map (menu, dialogs) must scroll normally
            if (e.touches && !isDragging && !pinchDist) return;
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
                if (dragDistance >= 8) cancelLongPress();
                if (dragMode === 'box') {
                    if (dragDistance >= 8 || selBox) selBox = { x0: dragStart.x, y0: dragStart.y, x1: p.x, y1: p.y };
                } else {
                    const z = Renderer.getZoom();
                    Renderer.setCamera(cameraStart.x + dx / z, cameraStart.y + dy / z);
                    if (dragDistance > 8) els.canvas.classList.add('dragging');
                }
            }

            if (pointerOverCanvas) {
                const tile = Renderer.screenToTile(p.x, p.y);
                hoveredBuilding = selectedBuilding || orderMode ? null : (BuildingManager.getBuildingAt(tile.x, tile.y) || null);
            } else {
                hoveredBuilding = null;
            }
            refreshPreview();
            if (e.touches) e.preventDefault();
        }

        function finishBox(e) {
            const a = Renderer.screenToWorld(selBox.x0, selBox.y0), b = Renderer.screenToWorld(selBox.x1, selBox.y1);
            selBox = null;
            const ids = Units.inRect(a.x, a.y, b.x, b.y).map(u => u.id);
            const add = e.shiftKey || e.ctrlKey || e.metaKey;
            Units.select(ids, add);
            if (Units.getSelected().length) { AudioSys.play('click'); showSelection(); }
            else if (unitView) hideInfo();
        }

        function onPointerUp(e) {
            if (e.touches && e.touches.length > 0) return;
            pinchDist = 0;
            cancelLongPress();
            if (!isDragging) return;
            isDragging = false;
            els.canvas.classList.remove('dragging');
            const btn = dragButton;

            if (selBox) { finishBox(e); return; }

            if (dragDistance < 8) {
                const p = getPointerPos(e);
                lastPointer = p;
                pointerOverCanvas = true;
                refreshPreview();
                const tile = Renderer.screenToTile(p.x, p.y);

                if (btn !== 0) {
                    // right click: move the selected soldiers, otherwise cancel
                    if (btn === 2) {
                        if (Units.getSelected().length && !selectedBuilding) issueOrder('move', Renderer.screenToWorld(p.x, p.y));
                        else if (selectedBuilding) deselectBuilding();
                        else hideInfo();
                    }
                    return;
                }

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
                        if (result.type === 'castle' && !Game.hasWarehouse()) {
                            // Guided start: the warehouse comes next and starts the clock
                            selectBuilding('warehouse');
                            showNotification(t('g.aftercastle'), 'info');
                        } else if (result.type === 'warehouse' && BuildingManager.countByType('warehouse') === 1) {
                            deselectBuilding(true);
                        } else if ((def.limit !== null && BuildingManager.countByType(selectedBuilding) >= def.limit) ||
                            !Game.isBuildingAvailable(selectedBuilding)) {
                            deselectBuilding(true);
                        }
                        updateBuildingButtons();
                        refreshPreview();
                    } else {
                        AudioSys.play('error');
                    }
                } else {
                    const w = Renderer.screenToWorld(p.x, p.y);
                    const add = e.shiftKey || e.ctrlKey || e.metaKey;
                    if (orderMode) { issueOrder(orderMode, w, add && !e.changedTouches); return; }
                    const unit = Units.pick(w.x, w.y);
                    if (unit) {
                        const now = performance.now();
                        const dbl = now - lastClick.t < 380 && Math.hypot(p.x - lastClick.x, p.y - lastClick.y) < 24 && lastClick.type === unit.type;
                        lastClick = { t: dbl ? 0 : now, x: p.x, y: p.y, type: unit.type };
                        if (dbl) selectTypeOnScreen(unit.type, add);
                        else if (add) Units.toggle(unit.id);
                        else Units.select([unit.id]);
                        AudioSys.play('click');
                        showSelection();
                        return;
                    }
                    // Phones: with soldiers selected, a tap on the map sends them there
                    if (e.changedTouches && Units.getSelected().length) { issueOrder('move', w); return; }
                    const villager = Villagers.pick(w.x, w.y);
                    const building = BuildingManager.getBuildingAt(tile.x, tile.y);
                    if (villager) {
                        AudioSys.play('click');
                        showVillagerInfo(villager);
                    } else if (building) {
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

        // right click is handled on mouse up (it can also be a drag that pans the map)
        els.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        // iOS: a long press must never select text or open the callout (it draws a box)
        els.canvas.addEventListener('selectstart', (e) => e.preventDefault());
        document.addEventListener('selectstart', (e) => { if (isDragging) e.preventDefault(); });
        window.addEventListener('blur', () => { pointerOverCanvas = false; });
        document.addEventListener('mouseleave', () => { pointerOverCanvas = false; });
        els.canvas.addEventListener('auxclick', (e) => e.preventDefault());

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
                else if (orderMode) setOrderMode(null);
                else hideInfo();
            } else if ((k === 'p' || k === 'P') && Units.getSelected().length) {
                setOrderMode(orderMode === 'patrol' ? null : 'patrol');
                AudioSys.play('click');
            } else if ((k === 'l' || k === 'L') && Units.getSelected().length) {
                issueOrder('stop');
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

    // Desktop edge scrolling: the mouse within EDGE_PX of the visible map area (screen sides,
    // just below the top bar, just above the panel) moves the camera that way, faster the
    // closer it is. Mouse only: never on touch, while dragging, over UI or outside the window.
    function edgeDir(pos, lo, hi) {
        if (pos < lo + EDGE_PX) return -Math.min(1, (lo + EDGE_PX - pos) / EDGE_PX);
        if (pos > hi - EDGE_PX) return Math.min(1, (pos - (hi - EDGE_PX)) / EDGE_PX);
        return 0;
    }
    function edgeScrollActive() {
        return !!Settings.get('edgeScroll') && pointerOverCanvas && !isDragging && !lastInputTouch && !noHover.matches
            && !anyOverlayOpen() && els.settingsScreen.classList.contains('hidden');
    }
    function edgeScroll(dtSec) {
        if (!edgeScrollActive()) return;
        const top = els.resourceBar.offsetHeight || 0;
        const bottom = window.innerHeight - (els.commandPanel.offsetHeight || 0);
        const ex = edgeDir(lastPointer.x, 0, window.innerWidth);
        const ey = edgeDir(lastPointer.y, top, bottom);
        if (!ex && !ey) return;
        // moveCamera divides by zoom: the map slides by the same screen distance at any zoom
        const step = EDGE_SPEED * Math.min(dtSec, 0.1);
        Renderer.moveCamera(ex * (0.4 + 0.6 * Math.abs(ex)) * step, ey * (0.4 + 0.6 * Math.abs(ey)) * step);
        refreshPreview();
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
        } else {
            edgeScroll(dtSec);
        }
        if (els.minimap && !els.minimap.classList.contains('hidden')) {
            minimapFrame = (minimapFrame + 1) % 3;
            if (minimapFrame === 0) Renderer.renderMinimap(minimapCtx, els.minimap.width, els.minimap.height);
        }
        refreshInfo(dtSec);
        const gs = Game.getState();
        if (els.dayProgress) els.dayProgress.style.width = (gs.dayProgress * 100).toFixed(1) + '%';
        updateSky(gs);
    }

    // ---------- sky / weather indicator ----------
    let lastSkyIcon = '', lastSkyTitle = '';
    let lastSeasonKey = '';
    function updateSeason(gs) {
        if (!els.seasonRes) return;
        const s = Game.getSeason();
        const toWinterMin = Math.ceil(s.secondsToWinter / 60);
        const leftMin = Math.ceil(s.secondsLeft / 60);
        const key = `${s.id}|${leftMin}|${toWinterMin}|${s.year}|${Lang.get()}`;
        if (key === lastSeasonKey) return;
        if (!lastSeasonKey.startsWith(s.id + '|')) {
            els.iconSeason.innerHTML = '';
            els.iconSeason.appendChild(Sprites.drawIcon(s.id));
        }
        lastSeasonKey = key;
        els.resSeason.textContent = t('season.' + s.id);
        els.seasonRes.title = s.id === 'winter'
            ? t('season.tip.winter', { year: s.year, left: leftMin })
            : t('season.tip', { name: t('season.' + s.id), year: s.year, left: leftMin, winter: toWinterMin });
        els.seasonRes.classList.toggle('winter-soon', Game.isClockRunning() && s.id !== 'winter' && s.secondsToWinter <= WINTER_WARNING_SECONDS);
    }

    function updateSky(gs) {
        updateSeason(gs);
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

    // ---------- info panel (replaces the building strip, like a scroll) ----------
    let infoKey = '';
    function openInfoView() {
        els.cpBuild.classList.add('hidden');
        els.infoPanel.classList.remove('hidden');
        hideTooltip();
        syncBody();
    }

    function setPortrait(canvas, scale) {
        els.infoPortrait.innerHTML = '';
        const img = document.createElement('img');
        img.src = canvas.toDataURL();
        img.style.width = Math.round(canvas.width * scale) + 'px';
        img.style.height = Math.round(canvas.height * scale) + 'px';
        els.infoPortrait.appendChild(img);
    }

    // wide: a long value gets two columns of the scroll so it stays on one line
    function stat(label, value, cls = '', wide = false) {
        return `<div class="stat${wide ? ' stat-wide' : ''}"><span class="stat-label">${label}</span><span class="${cls}">${value}</span></div>`;
    }

    function bar(frac, color, label) {
        const pct = Math.max(0, Math.min(1, frac)) * 100;
        return `<div class="pbar"><div class="pbar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div>${label ? `<span class="pbar-label">${label}</span>` : ''}</div>`;
    }

    // Goods in store: one row per resource with a fill bar against the capacity
    function stockHtml() {
        const gs = Game.getState();
        const rates = Game.getRates();
        const net = { wood: rates.wood, stone: rates.stone, iron: rates.iron, food: rates.food - Game.getFoodConsumption() };
        let html = `<div class="stock-grid">`;
        ['wood', 'stone', 'iron', 'food'].forEach(r => {
            const v = Math.floor(gs.resources[r]);
            const rate = Math.round(net[r] * 10) / 10;
            const rateHtml = rate > 0 ? `<span class="rate up">+${fmtNum(rate)}/min</span>` : rate < 0 ? `<span class="rate down">${fmtNum(rate)}/min</span>` : '';
            html += `<div class="stock-item${v >= gs.maxStorage ? ' full' : ''}" title="${t('res.' + r[0].toUpperCase() + r.slice(1))}">
                <span class="stock-ic">${ic(r)}</span>
                <span class="stock-name">${t('res.' + r[0].toUpperCase() + r.slice(1))}</span>
                <span class="stock-val">${v}<span class="stock-max"> / ${gs.maxStorage}</span> ${rateHtml}</span>
                ${bar(v / gs.maxStorage, COLORS[r] || '#c8a050')}
            </div>`;
        });
        Object.keys(WEAPONS).forEach(w => {
            const v = gs.weapons[w] || 0;
            html += `<div class="stock-item${v >= WEAPON_STOCK_MAX ? ' full' : ''}" title="${cap(wName(w, 2))}">
                <span class="stock-ic">${ic(w)}</span>
                <span class="stock-name">${cap(wName(w, 2))}</span>
                <span class="stock-val">${v}<span class="stock-max"> / ${WEAPON_STOCK_MAX}</span></span>
                ${bar(v / WEAPON_STOCK_MAX, '#9aa4b8')}
            </div>`;
        });
        return html + `</div>`;
    }

    function cap(str) { return str ? str[0].toUpperCase() + str.slice(1) : str; }

    // "3 bows · 1 sword" with icons
    function weaponsInline() {
        const gs = Game.getState();
        return Object.keys(WEAPONS).map(w => `<span class="nowrap">${ic(w)} ${gs.weapons[w] || 0}</span>`).join(' &nbsp;');
    }

    function weaponCostHtml(w) {
        const cost = WEAPONS[w].cost, res = Game.getState().resources;
        return Object.keys(cost).map(r => `<span class="${res[r] < cost[r] ? 'bad' : ''}">${ic(r)} ${cost[r]} ${resName(r)}</span>`).join(' ');
    }

    function smithInfoHtml(b) {
        const w = Game.getProduct(b);
        const wd = WEAPONS[w];
        const st = Game.getSmithStatus(b);
        let status;
        if (b.buildStart && st === 'working') status = `<span>${t('info.building')}</span>`;
        else if (st === 'noworkers') status = `<span class="bad">${t('info.noworkers')}</span>`;
        else if (st === 'full') status = `<span class="bad">${t('smith.full', { max: WEAPON_STOCK_MAX })}</span>`;
        else if (st === 'noinput') {
            const res = Game.getState().resources;
            const list = Object.entries(wd.cost).filter(([r, a]) => res[r] < a).map(([r, a]) => `${Math.ceil(a - res[r])} ${resName(r)}`).join(', ');
            status = `<span class="bad">${t('smith.noinput', { list })}</span>`;
        } else if (st === 'notime') status = `<span class="bad">${t('res.notime')}</span>`;
        else status = `<span class="ok">${t('smith.working')}</span>`;
        let html = stat(t('info.forges'), `${ic(w)} ${cap(wName(w, 1))}`);
        html += stat(t('info.weaponcost'), weaponCostHtml(w));
        html += stat(t('info.status'), status);
        if (st === 'working' || b.inputPaid) {
            const left = Math.max(0, Math.ceil((1 - (b.progress || 0)) * wd.cycle));
            html += `<div class="stat stat-bar"><span class="stat-label">${t('info.delivery')}</span>${bar(b.progress || 0, '#9aa4b8', t('smith.next', { w: wName(w, 1), s: left }))}</div>`;
        }
        html += stat(t('info.weapons'), weaponsInline());
        return html;
    }

    function barracksInfoHtml() {
        let html = stat(t('info.weapons'), weaponsInline());
        html += stat(t('info.free'), `${ic('pop')} ${Game.getFreeWorkers()}`, Game.getFreeWorkers() > 0 ? '' : 'bad');
        const soldiers = Object.keys(WEAPONS).map(w => WEAPONS[w].unit)
            .map(u => `<span class="nowrap">${t('unit.' + u)} ${Units.countByType(u)}</span>`).join(' · ');
        html += stat(t('info.soldiers'), soldiers);
        return html;
    }

    // Buttons above the info text: the smith's product, the barracks' recruits.
    // Only rebuilt when they change, so a click is never lost to a refresh.
    let controlsKey = '';
    function controlsHtml(b) {
        if (unitView) return orderButtonsHtml();
        if (!b) return '';
        if (b.def.crafts) {
            const cur = Game.getProduct(b);
            return `<span class="ctl-label">${t('info.choose')}</span>` + Object.keys(WEAPONS).map(w =>
                `<button class="ctl-btn${w === cur ? ' active' : ''}" data-product="${w}" aria-pressed="${w === cur}">${ic(w)} ${cap(wName(w, 1))}</button>`).join('');
        }
        if (b.def.recruits) {
            return Object.keys(WEAPONS).map(w => {
                const unit = WEAPONS[w].unit;
                const reason = Game.getRecruitReason(unit);
                const short = !reason ? '' : Game.getFreeWorkers() < 1 ? t('recruit.nofree') : t('recruit.noweapon', { w: wName(w, 1) });
                return `<button class="ctl-btn recruit${reason ? ' off' : ''}" data-recruit="${unit}"${reason ? ` aria-disabled="true" title="${reason}"` : ''}>` +
                    `${ic(w)} <span>${t('recruit.btn', { name: t('unit.' + unit), w: wName(w, 1) })}${short ? `<small>${short}</small>` : ''}</span></button>`;
            }).join('');
        }
        return '';
    }

    function refreshControls(force) {
        const html = controlsHtml(selectedPlaced);
        if (!force && html === controlsKey) return;
        controlsKey = html;
        els.infoControls.innerHTML = html;
    }

    function buildingInfoHtml(building) {
        const def = building.def;
        let html = `<p class="info-desc">${bDesc(def)}</p>`;

        if (building.maxWorkers > 0) {
            let people = '';
            for (let i = 0; i < building.maxWorkers; i++) people += `<span class="worker${i < building.workers ? '' : ' empty'}">${ic('pop')}</span>`;
            html += stat(t('info.workers'), `${people} ${building.workers} / ${building.maxWorkers}`);
        }
        if (def.production) {
            const prod = def.production;
            const out = Game.getBuildingOutput(building);
            const resting = prod.resource === 'food' && Game.getSeasonMultiplier(building.type) === 0;
            const status = building.buildStart ? `<span>${t('info.building')}</span>`
                : !building.active ? `<span class="bad">${t('info.noworkers')}</span>`
                : resting ? `<span class="bad">${t('season.rest')}</span>`
                : !Game.isClockRunning() ? `<span class="bad">${t('res.notime')}</span>`
                : `<span class="ok">${t('info.active')}</span>`;
            const base = prod.amount * 60 / prod.cycle;
            const cls = out > base + 0.01 ? 'ok' : out < base - 0.01 ? 'bad' : '';
            html += stat(t('info.production'), `${ic(prod.resource)} ${t('menu.prod', { n: fmtNum(out), res: resName(prod.resource) })}`, cls);
            html += stat(t('info.status'), status);
            if (building.active && !resting) {
                const mult = out / base || 1;
                const left = Math.max(0, Math.ceil((1 - (building.progress || 0)) * prod.cycle / mult));
                html += `<div class="stat stat-bar"><span class="stat-label">${t('info.delivery')}</span>${bar(building.progress || 0, COLORS[prod.resource] || '#ffd24a', t('info.next', { a: prod.amount, res: resName(prod.resource), s: left }))}</div>`;
            }
            if (prod.resource === 'food') {
                const season = Game.getSeason();
                const m = Game.getSeasonMultiplier(building.type, season);
                html += stat(t('info.season'), `${t('season.' + season.id)} ${m === 0 ? '· ' + t('season.rest') : '×' + fmtNum(m)}`, m > 1 ? 'ok' : m < 1 ? 'bad' : '');
            }
        }
        if (def.provides.populationCap) {
            html += stat(t('info.housing'), `${ic('pop')} ${t('menu.villagers', { n: def.provides.populationCap })}`);
        }
        if (def.crafts) html += smithInfoHtml(building);
        if (def.recruits) html += barracksInfoHtml();
        // Warehouse and keep show the stockpile
        if (def.provides.storage || building.type === 'castle') {
            if (building.type === 'castle') {
                const gs = Game.getState();
                html += stat(t('info.people'), `${ic('pop')} ${t('info.people.value', { used: gs.populationUsed, cap: gs.populationCap, free: Game.getFreeWorkers() })}`, '', true);
            }
            html += `<div class="stock-head">${t('info.stock')}${def.provides.storage ? ` · ${t('info.storage.this', { n: def.provides.storage })}` : ''}</div>`;
            html += stockHtml();
        }
        html += stat(t('info.built'), t('info.day', { n: building.dayPlaced }));
        return html;
    }

    function showBuildingInfo(building) {
        leaveUnitView();
        selectedPlaced = building;
        selectedVillager = null;
        els.infoTitle.textContent = bName(building.def);
        refreshControls(true);
        const spr = Sprites.getBuilding(building.type, { grown: building.grown });
        if (spr) setPortrait(spr, Math.min(1.5, 84 / spr.height, 120 / spr.width));
        els.infoContent.innerHTML = buildingInfoHtml(building);
        infoKey = '';

        els.infoActions.innerHTML = '';
        if (building.type !== 'castle') {
            const refund = ['wood', 'stone', 'iron']
                .map(r => [r, Math.floor((building.paid || building.def.cost)[r] * DEMOLISH_REFUND)])
                .filter(([, a]) => a > 0)
                .map(([r, a]) => `+${a} ${resName(r)}`).join(', ');
            const btn = document.createElement('button');
            btn.className = 'danger-btn';
            btn.textContent = refund ? t('info.demolish.refund', { r: refund }) : t('info.demolish');
            btn.title = t('info.demolish.title');
            btn.addEventListener('click', () => tryDemolish(building.id));
            els.infoActions.appendChild(btn);
        }
        openInfoView();
        keepInView(building.pixelX + building.width / 2, building.pixelY + building.height / 2, building.height);
    }

    // The scroll may cover what was clicked: move the camera so it stays visible
    function keepInView(wx, wy, h = 32) {
        const s = Renderer.worldToScreen(wx, wy);
        const panelTop = window.innerHeight - (els.commandPanel.offsetHeight || 0);
        const z = Renderer.getZoom();
        if (s.y + h * z / 2 > panelTop - 8 || s.y < (els.resourceBar.offsetHeight || 48) + 8) Renderer.centerOn(wx, wy);
    }

    function villagerInfoHtml(v) {
        const b = BuildingManager.getById(v.buildingId);
        let html = `<p class="info-desc">${t('vil.desc.' + v.job)}</p>`;
        html += stat(t('vil.activity'), t(Villagers.activity(v)));
        if (v.carry) html += stat(t('vil.carrying'), `${ic(v.carry)} ${t('res.' + v.carry[0].toUpperCase() + v.carry.slice(1))}`);
        if (b) html += stat(t('vil.workplace'), `<button class="link-btn" data-goto="${b.id}">${bName(b.def)}</button>`);
        html += stat(t('vil.eats'), `${ic('food')} ${t('vil.eats.value', { n: fmtNum(FOOD_PER_WORKER_PER_MIN) })}`);
        return html;
    }

    function showVillagerInfo(v) {
        leaveUnitView();
        selectedVillager = v;
        selectedPlaced = null;
        refreshControls(true);
        els.infoTitle.textContent = `${v.name} · ${t('vil.job.' + v.job)}`;
        setPortrait(Sprites.drawVillager(4, v.palette, false, v.tool), 3.5);
        els.infoContent.innerHTML = villagerInfoHtml(v);
        infoKey = '';
        els.infoActions.innerHTML = '';
        openInfoView();
        keepInView(v.x, v.y - 10, 24);
    }

    function unitInfoHtml(u) {
        let html = `<p class="info-desc">${t('unit.' + u.type + '.desc')}</p>`;
        html += `<div class="stat stat-bar"><span class="stat-label">${t('unit.hp')}</span>${bar(u.hp / u.maxHp, '#c84a3a', `${Math.ceil(u.hp)} / ${u.maxHp}`)}</div>`;
        html += stat(t('unit.state'), t('unit.state.' + u.state));
        const w = UNIT_WEAPON[u.type];
        html += stat(t('info.weapons'), `${ic(w)} ${cap(wName(w, 1))}`);
        const b = BuildingManager.getById(u.barracksId);
        if (b) html += stat(t('unit.from'), `<button class="link-btn" data-goto="${b.id}">${bName(b.def)}</button>`);
        html += stat(t('vil.eats'), `${ic('food')} ${t('vil.eats.value', { n: fmtNum(FOOD_PER_WORKER_PER_MIN) })}`);
        return html;
    }

    // ---------- soldier selection scroll ----------
    function leaveUnitView() {
        unitView = false;
        Units.clearSelection();
        setOrderMode(null);
        selBox = null;
    }

    function orderButtonsHtml() {
        const sel = Units.getSelected();
        const patrolling = sel.some(u => u.state === 'patrol');
        // keyboard hints are hidden on touch screens (css .hk)
        const b = (order, label, title, active, key) =>
            `<button class="ctl-btn order${active ? ' active' : ''}" data-order="${order}" aria-pressed="${!!active}" title="${title}">${label}${key ? ` <span class="hk">${key}</span>` : ''}</button>`;
        return b('move', t('sel.move'), t('sel.move.title'), orderMode === 'move') +
            b('patrol', t('sel.patrol'), t('sel.patrol.title'), orderMode === 'patrol', 'P') +
            (patrolling ? b('patrolAdd', t('sel.addpoint'), t('sel.addpoint.title'), orderMode === 'patrolAdd') : '') +
            b('stop', t('sel.stop'), t('sel.stop.title'), false, 'L') +
            b('deselect', t('sel.deselect'), t('sel.deselect.title'), false, 'Esc');
    }

    function onOrderButton(order) {
        if (order === 'deselect') { AudioSys.play('deselect'); hideInfo(); return; }
        if (order === 'stop') { issueOrder('stop'); return; }
        setOrderMode(orderMode === order ? null : order);
        AudioSys.play('click');
    }

    function selectionHtml() {
        const sel = Units.getSelected();
        let html = '';
        if (orderMode) html += `<p class="order-hint">${t(orderMode === 'move' ? 'sel.pick.move' : orderMode === 'patrol' ? 'sel.pick.patrol' : 'sel.pick.add')}</p>`;
        if (sel.length === 1) return html + unitInfoHtml(sel[0]);
        const types = Object.keys(WEAPONS).map(w => WEAPONS[w].unit);
        const chips = types.map(ty => [ty, sel.filter(u => u.type === ty).length]).filter(([, n]) => n > 0)
            .map(([ty, n]) => `<button class="link-btn sel-chip" data-seltype="${ty}" title="${t('sel.only')}">${ic(UNIT_WEAPON[ty])} ${t('unit.' + ty)} ×${n}</button>`).join(' ');
        html += stat(t('sel.units'), chips);
        const states = ['idle', 'move', 'patrol'].map(st => [st, sel.filter(u => u.state === st).length]).filter(([, n]) => n > 0)
            .map(([st, n]) => `${t('unit.state.' + st)} ${n}`).join(' · ');
        html += stat(t('unit.state'), states);
        return html;
    }

    function showSelection() {
        const sel = Units.getSelected();
        if (!sel.length) { hideInfo(); return; }
        selectedPlaced = null;
        selectedVillager = null;
        selectedUnit = sel.length === 1 ? sel[0] : null;
        unitView = true;
        refreshControls(true);
        els.infoTitle.textContent = sel.length === 1 ? t('unit.' + sel[0].type) : t('sel.title', { n: sel.length });
        setPortrait(Sprites.drawSoldier(sel[0].type, 0, false), 3.5);
        els.infoContent.innerHTML = selectionHtml();
        infoKey = '';
        els.infoActions.innerHTML = '';
        openInfoView();
        const cx = sel.reduce((a, u) => a + u.x, 0) / sel.length, cy = sel.reduce((a, u) => a + u.y, 0) / sel.length;
        keepInView(cx, cy - 10, 24);
    }

    // Keep the open scroll up to date (progress bars, stock, what a villager is doing)
    let infoRefreshT = 0;
    function refreshInfo(dt) {
        if (els.infoPanel.classList.contains('hidden')) return;
        infoRefreshT -= dt;
        if (infoRefreshT > 0) return;
        infoRefreshT = 0.25;
        let html = null;
        if (selectedPlaced) {
            if (!BuildingManager.getById(selectedPlaced.id)) { hideInfo(); return; }
            html = buildingInfoHtml(selectedPlaced);
            refreshControls();
        } else if (unitView) {
            if (!Units.getSelected().length) { hideInfo(); return; }
            html = selectionHtml();
            refreshControls();
        } else if (selectedVillager) {
            if (!Villagers.getById(selectedVillager.id)) { hideInfo(); return; }
            html = villagerInfoHtml(selectedVillager);
        }
        if (html !== null && html !== infoKey) { els.infoContent.innerHTML = html; infoKey = html; }
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
        leaveUnitView();
        selectedPlaced = null;
        selectedVillager = null;
        selectedUnit = null;
        refreshControls(true);
        els.infoPanel.classList.add('hidden');
        els.cpBuild.classList.remove('hidden');
        syncBody();
    }

    // ---------- resources ----------
    function updateResources() {
        const gs = Game.getState();
        const rates = Game.getRates();
        const foodNet = rates.food - Game.getFoodConsumption();

        // value plus its net rate per minute; the rate is always visible (phones drop the "/min")
        function fmt(val, rate, always) {
            const r = Math.round(rate * 10) / 10;
            let s = `<span class="num">${Math.floor(val)}</span>`;
            if (r !== 0 || always) s += ' ' + rateHtml(r);
            return s;
        }

        els.resWood.innerHTML = fmt(gs.resources.wood, rates.wood);
        els.resStone.innerHTML = fmt(gs.resources.stone, rates.stone);
        els.resIron.innerHTML = fmt(gs.resources.iron, rates.iron);
        // meat: the net balance is shown even at zero once anyone produces or eats
        els.resFood.innerHTML = fmt(gs.resources.food, foodNet, rates.food > 0 || Game.getFoodConsumption() > 0);
        els.resPop.textContent = `${gs.populationUsed} / ${gs.populationCap}`;
        els.resDay.textContent = Game.isClockRunning() ? t('res.daytime', { n: gs.day, time: clockText() }) : t('res.notime');
        if (els.storageLabel) els.storageLabel.textContent = `${gs.maxStorage}`;

        ['wood', 'stone', 'iron', 'food'].forEach(r => {
            const el = els['res' + r[0].toUpperCase() + r.slice(1)];
            el.parentElement.classList.toggle('full', gs.resources[r] >= gs.maxStorage - 0.01);
            el.parentElement.title = t('res.storage.value', { name: t('res.' + r[0].toUpperCase() + r.slice(1)), v: Math.floor(gs.resources[r]), max: gs.maxStorage });
        });
        els.foodRes.title = t('res.storage.value', { name: t('res.Food'), v: Math.floor(gs.resources.food), max: gs.maxStorage }) + '\n' + t('res.food.more');
        if (foodPopOpen) renderFoodPop();
        els.resFood.parentElement.classList.toggle('danger', gs.starving > 0 || (foodNet < 0 && gs.resources.food < -foodNet * 2));
        els.resPop.parentElement.title = t('res.pop.title', { used: gs.populationUsed, cap: gs.populationCap, free: Game.getFreeWorkers() });

        const next = Game.getNextMilestone();
        if (els.goalText) {
            els.goalText.textContent = next ? t('ms.' + next.id) : t('menu.goal.done');
            els.goalCount.textContent = `${gs.milestones.length}/${MILESTONES.length}`;
        }

        updateBuildingButtons();
        syncSpeedButtons();
        if (els.resourceBar.offsetHeight !== lastBarHeight) { lastBarHeight = els.resourceBar.offsetHeight; updateInsets(); }
    }
    let lastBarHeight = 0;

    // "+1.5/min", "−2/min" (real minus sign) or "±0/min"; the unit is hidden on phones
    function rateHtml(r) {
        const cls = r > 0 ? 'up' : r < 0 ? 'down' : 'zero';
        const sign = r > 0 ? '+' : r < 0 ? '\u2212' : '\u00b1';
        return `<span class="rate ${cls}">${sign}${fmtNum(Math.abs(r))}<span class="rate-unit">/min</span></span>`;
    }

    // ---------- meat breakdown popover (click / tap on the meat counter) ----------
    let foodPopOpen = false;
    function setupFoodPop() {
        const toggle = () => { AudioSys.play('click'); setFoodPop(!foodPopOpen); };
        els.foodRes.addEventListener('click', toggle);
        els.foodRes.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });
        // any press outside closes it (the canvas stays usable underneath)
        document.addEventListener('pointerdown', (e) => {
            if (foodPopOpen && !els.foodRes.contains(e.target) && !els.foodPop.contains(e.target)) setFoodPop(false);
        }, true);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && foodPopOpen) setFoodPop(false); });
        window.addEventListener('resize', () => { if (foodPopOpen) placeFoodPop(); });
    }

    function setFoodPop(open) {
        foodPopOpen = open;
        els.foodPop.classList.toggle('hidden', !open);
        els.foodRes.classList.toggle('open', open);
        els.foodRes.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) renderFoodPop();
    }

    function renderFoodPop() {
        const gs = Game.getState();
        const made = Game.getRates().food;
        const eaten = Game.getFoodConsumption();
        const net = made - eaten;
        const hunters = BuildingManager.getProductionBuildings().filter(b => b.def.production.resource === 'food').length;
        const r1 = (x) => Math.round(x * 10) / 10;
        let html = `<div class="fp-title">${t('food.pop.title')}</div>`
            + `<div class="fp-row"><span>${t('food.pop.made', { n: hunters })}</span>${rateHtml(r1(made))}</div>`
            + `<div class="fp-row"><span>${t('food.pop.eaten', { n: gs.populationUsed })}</span>${rateHtml(-r1(eaten))}</div>`
            + `<div class="fp-row fp-net"><span>${t('food.pop.net')}</span>${rateHtml(r1(net))}</div>`;
        if (net < 0) html += `<div class="fp-warn">${t('food.pop.lasts', { m: fmtNum(Math.max(0, gs.resources.food) / -net) })}</div>`;
        html += `<div class="fp-hint">${t('food.pop.hint', { f: fmtNum(FOOD_PER_WORKER_PER_MIN) })}</div>`;
        els.foodPop.innerHTML = html;
        placeFoodPop();
    }

    // below the bar, centred on the meat counter, kept on screen
    function placeFoodPop() {
        const r = els.foodRes.getBoundingClientRect();
        const bar = els.resourceBar.getBoundingClientRect();
        const w = els.foodPop.offsetWidth;
        const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
        els.foodPop.style.left = Math.round(left) + 'px';
        els.foodPop.style.top = Math.round(bar.bottom + 6) + 'px';
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

    function fmtNum(m) {
        return Number(m).toLocaleString(Lang.get() === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 1 });
    }

    function clockText() {
        const h = Game.getHour();
        const hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }

    // Big banner when a new season starts
    function showSeason(season) {
        const div = document.createElement('div');
        div.className = `notification season season-${season.id}`;
        div.innerHTML = `<span class="s-icon"></span><span class="s-text"><span class="s-name">${t('season.' + season.id)}</span><span class="s-sub">${t('season.start.' + season.id)}</span></span>`;
        // copy the cached icon canvas (a DOM node can only live in one place)
        const src = Sprites.drawIcon(season.id);
        const icon = document.createElement('canvas');
        icon.width = src.width; icon.height = src.height;
        icon.getContext('2d').drawImage(src, 0, 0);
        div.querySelector('.s-icon').appendChild(icon);
        els.notifications.appendChild(div);
        div.style.animationDelay = `0s, 5s`;
        setTimeout(() => div.remove(), 5500);
        AudioSys.play('season', { id: season.id });
        updateResources();
        if (selectedPlaced) showBuildingInfo(selectedPlaced);
    }

    function showMilestone(m) {
        const div = document.createElement('div');
        div.className = 'notification milestone';
        div.innerHTML = `<span class="m-label">${t('g.milestone')}</span> ${t('ms.' + m.id)}`;
        els.notifications.appendChild(div);
        const maxNotes = isCompact() ? 2 : 4;
        while (els.notifications.children.length > maxNotes) els.notifications.firstChild.remove();
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
    const hoverInfo = {};
    function getHoverInfo() {
        hoverInfo.building = hoveredBuilding;
        hoverInfo.selected = selectedPlaced;
        hoverInfo.villager = selectedVillager;
        hoverInfo.unit = selectedUnit;
        hoverInfo.box = selBox;
        hoverInfo.marker = orderMarker;
        hoverInfo.orderHint = orderMode && pointerOverCanvas && !lastInputTouch
            ? t(orderMode === 'move' ? 'sel.pick.move' : orderMode === 'patrol' ? 'sel.pick.patrol' : 'sel.pick.add') : null;
        hoverInfo.pointer = lastPointer;
        return hoverInfo;
    }

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
        showSeason,
        showGameOver,
        hideWelcome,
        showWelcome,
        hideInfo,
        showSelection,
        getOrderMode: () => orderMode,
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
