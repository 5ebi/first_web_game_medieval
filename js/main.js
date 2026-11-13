// ============================================
// Main Entry Point
// ============================================

(async function() {
    const canvas = document.getElementById('game-canvas');

    // Optional custom art from assets/ (falls back to procedural sprites)
    const customArt = await Sprites.loadAssets();
    if (customArt.length) console.info('Custom art loaded:', customArt.join(', '));

    // Initialize systems
    Lang.applyDom();
    Renderer.init(canvas);
    UI.init();

    // Generate map
    GameMap.generate(Math.floor(Math.random() * 100000));

    // Setup game callbacks
    Game.setCallbacks({
        onDayTick: () => UI.updateResources(),
        onResourceChange: () => UI.updateResources(),
        onNotification: (msg, type) => UI.showNotification(msg, type),
        onGameOver: () => UI.showGameOver(),
        onMilestone: (m) => UI.showMilestone(m),
        onSeasonChange: (season) => UI.showSeason(season),
        onClockStart: () => setTimeout(() => UI.showNotification(t('g.tiplumber'), 'info'), 1200),
        onProduce: (b, res, amount) => {
            if (amount <= 0) return;
            const shown = Math.round(amount * 10) / 10;
            Effects.floatText(b.pixelX + b.width / 2, b.pixelY - 4, `+${shown}`, COLORS[res] || '#fff');
        },
        onBuildingsChanged: () => UI.updateBuildingButtons(),
    });

    function beginNewGame() {
        Game.reset();
        Game.clearSave();
        Villagers.reset();
        Effects.reset();
        GameMap.generate(Math.floor(Math.random() * 100000));
        Renderer.invalidateTerrainCache();
        Renderer.setZoom(1);
        Renderer.centerCamera();
        UI.hideInfo();
        UI.deselectBuilding(true);
        UI.getGameOverEl().classList.add('hidden');
        UI.hideWelcome();
        Game.start();
        UI.updateResources();
        UI.updateZoomLabel();
        UI.selectBuilding('castle');
        UI.showNotification(t('g.start'), 'info');
    }

    function continueGame() {
        if (!Game.load()) {
            beginNewGame();
            return;
        }
        Villagers.reset();
        Effects.reset();
        Renderer.invalidateTerrainCache();
        Renderer.setZoom(1);
        const castle = BuildingManager.getAll().find(b => b.type === 'castle');
        if (castle) Renderer.centerOn(castle.pixelX + castle.width / 2, castle.pixelY + castle.height / 2);
        else Renderer.centerCamera();
        UI.hideWelcome();
        UI.getGameOverEl().classList.add('hidden');
        UI.updateResources();
        UI.updateZoomLabel();
        UI.showNotification(t('g.welcomeback'), 'success');
    }

    // Welcome screen
    UI.getStartBtn().addEventListener('click', () => {
        AudioSys.init();
        AudioSys.play('start');
        beginNewGame();
    });
    UI.getContinueBtn().addEventListener('click', () => {
        AudioSys.init();
        AudioSys.play('start');
        continueGame();
    });

    // Restart after game over
    UI.getRestartBtn().addEventListener('click', () => {
        AudioSys.init();
        AudioSys.play('start');
        beginNewGame();
    });

    UI.setNewGameHandler(() => {
        AudioSys.play('start');
        beginNewGame();
    });

    // Save when leaving the page
    window.addEventListener('beforeunload', () => Game.save());
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') Game.save();
    });

    UI.showWelcome();
    UI.updateResources();
    UI.updateZoomLabel();

    // Main game loop
    let lastTime = performance.now();

    function gameLoop(time) {
        const delta = Math.min(250, time - lastTime); // clamp: tab switches shouldn't fast-forward
        lastTime = time;

        // Schedule first so a single faulty frame can never freeze the game
        requestAnimationFrame(gameLoop);

        try {
            Game.update(delta);
            UI.tick(delta / 1000);
            Renderer.render(UI.getPlacementPreview(), UI.getHoverInfo());
        } catch (e) {
            if (!loopErrorLogged) { console.error(e); loopErrorLogged = true; }
        }
    }
    let loopErrorLogged = false;

    requestAnimationFrame(gameLoop);
})();
