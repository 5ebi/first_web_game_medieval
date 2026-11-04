// ============================================
// Main Entry Point
// ============================================

(function() {
    const canvas = document.getElementById('game-canvas');

    // Initialize systems
    Renderer.init(canvas);
    UI.init();

    // Time only runs while the player is actually in the game (no overlay open)
    let running = false;

    function randomSeed() {
        return 1 + Math.floor(Math.random() * 99999);
    }

    function newGame() {
        SaveGame.clear();
        Game.reset();
        GameMap.generate(randomSeed());
        Renderer.invalidateTerrainCache();
        Renderer.centerCamera();
        UI.refreshAll();
    }

    function loadGame(saved) {
        GameMap.generate(saved.seed);
        Renderer.invalidateTerrainCache();
        Game.load(saved.game);
        if (saved.camera && Number.isFinite(saved.camera.x) && Number.isFinite(saved.camera.y)) {
            Renderer.setCamera(saved.camera.x, saved.camera.y);
        }
        UI.refreshAll();
    }

    // Setup game callbacks
    Game.setCallbacks({
        onDayTick: () => {
            UI.updateResources();
            SaveGame.save();
        },
        onResourceChange: () => {
            UI.updateResources();
        },
        onNotification: (msg, type) => {
            UI.showNotification(msg, type);
        },
        onGameOver: () => {
            running = false;
            SaveGame.clear();
            UI.showGameOver();
        },
        onBuildingPlaced: () => {
            SaveGame.save();
        },
        onDayReport: (report) => {
            UI.showDayReport(report);
        },
    });

    // Resume a saved settlement, or prepare a fresh map behind the welcome screen
    const saved = SaveGame.load();
    if (saved) {
        loadGame(saved);
    } else {
        newGame();
    }
    UI.showWelcome(saved ? { day: Game.getState().day } : null);

    UI.onContinue(() => {
        UI.hideWelcome();
        running = true;
        UI.updateResources();
        UI.showNotification(`Welcome back, my lord. Day ${Game.getState().day}.`, 'info');
    });

    UI.onNewGame(() => {
        if (saved) newGame();
        UI.hideWelcome();
        running = true;
        // Don't start the day timer yet — it begins when the castle is placed
        UI.updateResources();
        UI.showNotification('Place your Castle to begin!', 'info');
    });

    // Restart after defeat
    UI.getRestartBtn().addEventListener('click', () => {
        newGame();
        UI.getGameOverEl().classList.add('hidden');
        running = true;
        // Don't start the day timer yet — it begins when the castle is placed
        UI.showNotification('New game! Place your Castle.', 'info');
    });

    // Main game loop
    let lastTime = performance.now();

    // Save whenever the page may go away (tab switch, app switch, close).
    // pagehide/visibilitychange are the events mobile browsers reliably fire.
    // Time does not pass while the game is hidden: on return we start counting
    // from "now" instead of catching up on every missed day at once.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') SaveGame.save();
        else lastTime = performance.now();
    });
    window.addEventListener('pagehide', () => SaveGame.save());

    function gameLoop(time) {
        // Clamp: a stalled or throttled frame never advances more than MAX_FRAME_MS
        const delta = Math.min(Math.max(time - lastTime, 0), MAX_FRAME_MS);
        lastTime = time;

        // Update game logic
        if (running) Game.update(delta);
        UI.tick();

        // Render
        Renderer.render(UI.getPlacementPreview());

        requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame(gameLoop);
})();
