// ============================================
// UI Manager
// ============================================

const UI = (() => {
    let selectedBuilding = null; // building type to place
    let hoveredTile = null;
    let placementPreview = null;

    // DOM elements
    let els = {};

    function init() {
        els = {
            resWood: document.getElementById('res-wood'),
            resStone: document.getElementById('res-stone'),
            resIron: document.getElementById('res-iron'),
            resFood: document.getElementById('res-food'),
            resPop: document.getElementById('res-pop'),
            resDay: document.getElementById('res-day'),
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
            restartBtn: document.getElementById('restart-btn'),
            canvas: document.getElementById('game-canvas'),
        };

        buildBuildingMenu();
        setupSpeedButtons();
        setupEventListeners();

        els.infoClose.addEventListener('click', () => {
            els.infoPanel.classList.add('hidden');
        });
    }

    function buildBuildingMenu() {
        els.buildingList.innerHTML = '';
        BUILD_ORDER.forEach(type => {
            const def = BUILDINGS[type];
            const btn = document.createElement('button');
            btn.className = 'building-btn';
            btn.dataset.type = type;

            let costStr = '';
            if (def.cost.wood > 0) costStr += `Wood: ${def.cost.wood} `;
            if (def.cost.stone > 0) costStr += `Stone: ${def.cost.stone} `;
            if (def.cost.iron > 0) costStr += `Iron: ${def.cost.iron} `;
            if (costStr === '') costStr = 'Free';

            let infoStr = '';
            if (def.workers > 0) infoStr += `Workers: ${def.workers} `;
            if (def.provides.populationCap) infoStr += `+${def.provides.populationCap} pop `;
            if (def.provides.storage) infoStr += `+${def.provides.storage} storage `;
            if (def.production) {
                infoStr += `+${def.production.amount} ${def.production.resource}/day `;
                if (def.production.growthDays) infoStr += `(${def.production.growthDays}d grow) `;
            }

            btn.innerHTML = `
                <span class="b-name">${def.name}</span>
                <span class="b-cost">${costStr.trim()}</span>
                <span class="b-info">${infoStr.trim()}</span>
            `;

            btn.addEventListener('click', () => selectBuilding(type));
            els.buildingList.appendChild(btn);
        });
    }

    function selectBuilding(type) {
        if (selectedBuilding === type) {
            // Deselect
            selectedBuilding = null;
            els.canvas.classList.remove('placing');
        } else {
            selectedBuilding = type;
            els.canvas.classList.add('placing');
        }
        updateBuildingButtons();
        els.infoPanel.classList.add('hidden');
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
        Game.setSpeed(speed);
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        if (speed === 0) document.getElementById('speed-pause').classList.add('active');
        else if (speed === 1) document.getElementById('speed-1x').classList.add('active');
        else if (speed === 2) document.getElementById('speed-2x').classList.add('active');
        else if (speed === 3) document.getElementById('speed-3x').classList.add('active');
    }

    function setupEventListeners() {
        // Mouse/touch input for canvas
        let isDragging = false;
        let dragStart = { x: 0, y: 0 };
        let cameraStart = { x: 0, y: 0 };
        let dragDistance = 0;

        function onPointerDown(e) {
            const rect = els.canvas.getBoundingClientRect();
            const px = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
            const py = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;

            isDragging = true;
            dragStart = { x: px, y: py };
            dragDistance = 0;
            const cam = Renderer.getCamera();
            cameraStart = { x: cam.x, y: cam.y };

            if (e.touches) e.preventDefault();
        }

        function onPointerMove(e) {
            const rect = els.canvas.getBoundingClientRect();
            const px = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
            const py = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;

            if (isDragging) {
                const dx = dragStart.x - px;
                const dy = dragStart.y - py;
                dragDistance = Math.sqrt(dx * dx + dy * dy);
                Renderer.setCamera(cameraStart.x + dx, cameraStart.y + dy);
            }

            // Update hovered tile
            const tile = Renderer.screenToTile(px, py);
            hoveredTile = tile;

            // Update placement preview
            if (selectedBuilding) {
                const check = Game.canPlace(selectedBuilding, tile.x, tile.y);
                placementPreview = {
                    type: selectedBuilding,
                    tileX: tile.x,
                    tileY: tile.y,
                    valid: check.ok,
                };
            } else {
                placementPreview = null;
            }

            if (e.touches) e.preventDefault();
        }

        function onPointerUp(e) {
            if (!isDragging) return;
            isDragging = false;

            // If it was a click (not a drag)
            if (dragDistance < 8) {
                const rect = els.canvas.getBoundingClientRect();
                const px = (e.changedTouches ? e.changedTouches[0].clientX : e.clientX) - rect.left;
                const py = (e.changedTouches ? e.changedTouches[0].clientY : e.clientY) - rect.top;
                const tile = Renderer.screenToTile(px, py);

                if (selectedBuilding) {
                    // Try to place building
                    const result = Game.placeBuilding(selectedBuilding, tile.x, tile.y);
                    if (result) {
                        // Keep selected for rapid placement, unless it's limited
                        const def = BUILDINGS[selectedBuilding];
                        if (def.limit !== null && BuildingManager.countByType(selectedBuilding) >= def.limit) {
                            deselectBuilding();
                        }
                        updateBuildingButtons();
                    }
                } else {
                    // Click on existing building - show info
                    const building = BuildingManager.getBuildingAt(tile.x, tile.y);
                    if (building) {
                        showBuildingInfo(building);
                    } else {
                        els.infoPanel.classList.add('hidden');
                    }
                }
            }
        }

        // Mouse events
        els.canvas.addEventListener('mousedown', onPointerDown);
        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);

        // Touch events
        els.canvas.addEventListener('touchstart', onPointerDown, { passive: false });
        window.addEventListener('touchmove', onPointerMove, { passive: false });
        window.addEventListener('touchend', onPointerUp);

        // Right click to cancel
        els.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            deselectBuilding();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                deselectBuilding();
                els.infoPanel.classList.add('hidden');
            }
            if (e.key === ' ') {
                e.preventDefault();
                const gs = Game.getState();
                if (gs.paused) setSpeed(1);
                else setSpeed(0);
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

    function updateResources() {
        const gs = Game.getState();

        // Calculate production rates
        const producers = BuildingManager.getProductionBuildings();
        const rates = { wood: 0, stone: 0, iron: 0, food: 0 };
        producers.forEach(b => {
            rates[b.def.production.resource] += b.def.production.amount;
        });
        // Food consumption
        const foodNet = rates.food - gs.populationCap;

        function fmtRate(val) {
            if (val > 0) return ` (+${val})`;
            if (val < 0) return ` (${val})`;
            return '';
        }

        els.resWood.textContent = Math.floor(gs.resources.wood) + fmtRate(rates.wood);
        els.resStone.textContent = Math.floor(gs.resources.stone) + fmtRate(rates.stone);
        els.resIron.textContent = Math.floor(gs.resources.iron) + fmtRate(rates.iron);
        els.resFood.textContent = Math.floor(gs.resources.food) + fmtRate(foodNet);
        els.resPop.textContent = `${gs.populationUsed} / ${gs.populationCap}`;
        els.resDay.textContent = `Day ${gs.day}`;

        // Flash food red if starving
        els.resFood.parentElement.style.color = gs.starvationDays > 0 ? '#f88' : '';

        updateBuildingButtons();
    }

    function showNotification(message, type = 'info') {
        const div = document.createElement('div');
        div.className = `notification ${type}`;
        div.textContent = message;
        els.notifications.appendChild(div);
        setTimeout(() => div.remove(), 3000);
    }

    function showGameOver() {
        els.gameOver.classList.remove('hidden');
    }

    function hideWelcome() {
        els.welcome.classList.add('hidden');
    }

    function showWelcome() {
        els.welcome.classList.remove('hidden');
    }

    function getPlacementPreview() {
        return placementPreview;
    }

    function getStartBtn() { return els.startBtn; }
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
        getPlacementPreview,
        getStartBtn,
        getRestartBtn,
        getGameOverEl,
        updateBuildingButtons,
    };
})();
