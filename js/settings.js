// ============================================
// Settings - persisted user preferences (language, audio, input)
// ============================================

const Settings = (() => {
    const defaults = {
        lang: (navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en',
        muted: false,
        musicOn: true,
        sfxOn: true,
        fxOn: true,
        edgeScroll: true,   // desktop: mouse at the map edge scrolls
    };
    let data = Object.assign({}, defaults);

    function load() {
        try {
            const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            data = Object.assign({}, defaults, raw);
        } catch (e) { /* ignore */ }
        return data;
    }

    function save() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
        } catch (e) { /* ignore */ }
    }

    function get(key) { return data[key]; }

    function set(key, value) {
        data[key] = value;
        save();
    }

    load();

    return { get, set, load };
})();
