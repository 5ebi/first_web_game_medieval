// ============================================
// Save / Load (localStorage autosave)
// ============================================

const SaveGame = (() => {
    const KEY = 'lordsOfTheKeep.save';
    const VERSION = 1;

    // localStorage can be missing or throw (private mode, blocked storage)
    function storage() {
        try {
            return window.localStorage || null;
        } catch (e) {
            return null;
        }
    }

    function save() {
        const ls = storage();
        if (!ls) return false;
        const gs = Game.getState();
        // Nothing worth keeping before the castle stands, nothing to resume after defeat
        if (!gs.started || gs.gameOver) return false;

        const data = {
            version: VERSION,
            savedAt: Date.now(),
            seed: GameMap.getSeed(),
            camera: Renderer.getCamera(),
            game: Game.serialize(),
        };
        try {
            ls.setItem(KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            return false;
        }
    }

    function load() {
        const ls = storage();
        if (!ls) return null;
        try {
            const raw = ls.getItem(KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (!data || data.version !== VERSION || !Number.isFinite(data.seed) || !data.game) return null;
            return data;
        } catch (e) {
            return null;
        }
    }

    function clear() {
        const ls = storage();
        if (!ls) return;
        try {
            ls.removeItem(KEY);
        } catch (e) {
            // ignore
        }
    }

    return { save, load, clear };
})();
