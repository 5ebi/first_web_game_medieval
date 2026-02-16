// ============================================
// Main Entry Point
// ============================================

(function() {
    const canvas = document.getElementById('game-canvas');

    // Initialize systems
    Renderer.init(canvas);
    UI.init();

    // Generate map
    GameMap.generate(Math.floor(Math.random() * 100000));

    // Setup game callbacks
    Game.setCallbacks({
        onDayTick: () => {
            UI.updateResources();
        },
        onResourceChange: () => {
            UI.updateResources();
        },
        onNotification: (msg, type) => {
            UI.showNotification(msg, type);
        },
        onGameOver: () => {
            UI.showGameOver();
        },
    });

    // Welcome screen
    UI.getStartBtn().addEventListener('click', () => {
        UI.hideWelcome();
        // Don't start the day timer yet — it begins when the castle is placed
        UI.updateResources();
        UI.showNotification('Place your Castle to begin!', 'info');
    });

    // Restart
    UI.getRestartBtn().addEventListener('click', () => {
        Game.reset();
        GameMap.generate(Math.floor(Math.random() * 100000));
        Renderer.invalidateTerrainCache();
        UI.getGameOverEl().classList.add('hidden');
        UI.updateResources();
        UI.updateBuildingButtons();
        // Don't start the day timer yet — it begins when the castle is placed
        UI.showNotification('New game! Place your Castle.', 'info');
        // Re-center camera
        Renderer.setCamera(
            MAP_PIXEL_W / 2 - window.innerWidth / 2,
            MAP_PIXEL_H / 2 - window.innerHeight / 2
        );
    });

    // Main game loop
    let lastTime = performance.now();

    function gameLoop(time) {
        const delta = time - lastTime;
        lastTime = time;

        // Update game logic
        Game.update(delta);

        // Render
        Renderer.render(UI.getPlacementPreview());

        requestAnimationFrame(gameLoop);
    }

    requestAnimationFrame(gameLoop);
})();
