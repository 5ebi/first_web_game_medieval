// ============================================
// Audio - procedural sound effects & music (Web Audio API)
// No external files: everything is synthesized at runtime.
// ============================================

const AudioSys = (() => {
    let ctx = null;
    let master, sfxGain, musicGain, ambientGain;
    let muted = false;
    let musicOn = true;
    let sfxOn = true;
    let started = false;

    // Music scheduler state
    let musicTimer = null;
    let nextNoteTime = 0;
    let step = 0;
    let ambientNodes = [];
    let birdTimer = null;

    const BPM = 84;
    const STEP = 60 / BPM / 2; // eighth notes

    // D dorian: D E F G A B C
    const SCALE = [146.83, 164.81, 174.61, 196.00, 220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00];

    // Melody patterns (indices into SCALE, -1 = rest). Two phrases, alternated with variation.
    const PHRASES = [
        [0, -1, 2, 4, -1, 4, 5, 4, 2, -1, 0, -1, 2, 0, -1, -1],
        [4, -1, 5, 7, -1, 7, 9, 7, 5, -1, 4, -1, 2, 4, -1, -1],
        [7, -1, 5, 4, -1, 2, 4, 5, 4, -1, 2, -1, 0, -1, -1, -1],
        [2, -1, 4, 5, -1, 7, -1, 5, 4, -1, 2, 0, -1, 2, -1, -1],
    ];
    const BASS = [0, 0, 4, 4, 2, 2, 0, 0]; // one per bar, index into SCALE (low)

    function loadSettings() {
        muted = !!Settings.get('muted');
        musicOn = Settings.get('musicOn') !== false;
        sfxOn = Settings.get('sfxOn') !== false;
    }

    function saveSettings() {
        Settings.set('muted', muted);
        Settings.set('musicOn', musicOn);
        Settings.set('sfxOn', sfxOn);
    }

    // Must be called from a user gesture (autoplay policy)
    function init() {
        if (ctx) {
            if (ctx.state === 'suspended') ctx.resume();
            return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();

        master = ctx.createGain();
        master.gain.value = muted ? 0 : 1;
        master.connect(ctx.destination);

        sfxGain = ctx.createGain();
        sfxGain.gain.value = sfxOn ? 0.5 : 0;
        sfxGain.connect(master);

        musicGain = ctx.createGain();
        musicGain.gain.value = musicOn ? 0.16 : 0;
        musicGain.connect(master);

        ambientGain = ctx.createGain();
        ambientGain.gain.value = 0.35;
        ambientGain.connect(master);

        started = true;
        startAmbient();
        startMusic();
    }

    function isReady() { return !!ctx; }

    // ---------- helpers ----------
    function now() { return ctx ? ctx.currentTime : 0; }

    function tone({ freq = 440, type = 'sine', dur = 0.1, vol = 0.3, attack = 0.005, decay = null, dest = null, slideTo = null, t = null }) {
        if (!ctx) return;
        const start = t ?? now();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + dur);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.linearRampToValueAtTime(vol, start + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, start + (decay ?? dur));
        osc.connect(g);
        g.connect(dest || sfxGain);
        osc.start(start);
        osc.stop(start + (decay ?? dur) + 0.05);
    }

    let noiseBuffer = null;
    function getNoiseBuffer() {
        if (noiseBuffer) return noiseBuffer;
        const len = ctx.sampleRate * 2;
        noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        return noiseBuffer;
    }

    function noise({ dur = 0.2, vol = 0.3, filterFreq = 1000, type = 'lowpass', q = 1, t = null, dest = null }) {
        if (!ctx) return;
        const start = t ?? now();
        const src = ctx.createBufferSource();
        src.buffer = getNoiseBuffer();
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = filterFreq;
        f.Q.value = q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, start);
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        src.connect(f);
        f.connect(g);
        g.connect(dest || sfxGain);
        src.start(start);
        src.stop(start + dur + 0.05);
    }

    // ---------- sound effects ----------
    const sfx = {
        click() {
            tone({ freq: 880, type: 'square', dur: 0.04, vol: 0.08 });
        },
        select() {
            tone({ freq: 520, type: 'triangle', dur: 0.06, vol: 0.15 });
            tone({ freq: 780, type: 'triangle', dur: 0.08, vol: 0.12, t: now() + 0.05 });
        },
        deselect() {
            tone({ freq: 620, type: 'triangle', dur: 0.06, vol: 0.1 });
            tone({ freq: 420, type: 'triangle', dur: 0.08, vol: 0.08, t: now() + 0.05 });
        },
        place() {
            // hammer thud + wooden knocks
            const t0 = now();
            noise({ dur: 0.12, vol: 0.5, filterFreq: 400, t: t0 });
            tone({ freq: 140, type: 'sine', dur: 0.15, vol: 0.5, slideTo: 60, t: t0 });
            [0.16, 0.28].forEach((d, i) => {
                noise({ dur: 0.05, vol: 0.25, filterFreq: 1800, type: 'bandpass', q: 2, t: t0 + d });
                tone({ freq: 320 - i * 40, type: 'triangle', dur: 0.07, vol: 0.18, t: t0 + d });
            });
        },
        demolish() {
            const t0 = now();
            noise({ dur: 0.45, vol: 0.5, filterFreq: 300, t: t0 });
            noise({ dur: 0.3, vol: 0.2, filterFreq: 2500, type: 'bandpass', t: t0 + 0.05 });
            tone({ freq: 90, type: 'sine', dur: 0.4, vol: 0.4, slideTo: 40, t: t0 });
        },
        error() {
            tone({ freq: 220, type: 'sawtooth', dur: 0.12, vol: 0.12, slideTo: 150 });
            tone({ freq: 165, type: 'sawtooth', dur: 0.16, vol: 0.1, slideTo: 110, t: now() + 0.1 });
        },
        success() {
            const t0 = now();
            [523.25, 659.25, 783.99].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.14, t: t0 + i * 0.07 }));
        },
        warning() {
            const t0 = now();
            tone({ freq: 330, type: 'square', dur: 0.14, vol: 0.08, t: t0 });
            tone({ freq: 262, type: 'square', dur: 0.2, vol: 0.08, t: t0 + 0.18 });
        },
        milestone() {
            const t0 = now();
            [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
                tone({ freq: f, type: 'triangle', dur: i === 4 ? 0.5 : 0.14, vol: 0.16, t: t0 + i * 0.09 }));
            tone({ freq: 196, type: 'sine', dur: 0.8, vol: 0.12, t: t0 + 0.3 });
        },
        gameOver() {
            const t0 = now();
            [392, 349.23, 311.13, 261.63].forEach((f, i) =>
                tone({ freq: f, type: 'sawtooth', dur: 0.45, vol: 0.1, t: t0 + i * 0.35 }));
            tone({ freq: 65, type: 'sine', dur: 1.8, vol: 0.25, t: t0 + 1.2 });
        },
        tick() {
            tone({ freq: 1200, type: 'sine', dur: 0.03, vol: 0.04 });
        },
        grown() {
            const t0 = now();
            tone({ freq: 660, type: 'sine', dur: 0.1, vol: 0.1, t: t0 });
            tone({ freq: 880, type: 'sine', dur: 0.18, vol: 0.1, t: t0 + 0.09 });
        },
        start() {
            const t0 = now();
            // short horn call
            [261.63, 329.63, 392].forEach((f, i) => tone({ freq: f, type: 'sawtooth', dur: 0.25, vol: 0.08, attack: 0.03, t: t0 + i * 0.18 }));
            tone({ freq: 523.25, type: 'sawtooth', dur: 0.7, vol: 0.1, attack: 0.04, t: t0 + 0.54 });
        },
    };

    function play(name) {
        if (!ctx || muted || !sfxOn) return;
        if (ctx.state === 'suspended') ctx.resume();
        const fn = sfx[name];
        if (fn) fn();
    }

    // ---------- ambient (wind + birds) ----------
    function startAmbient() {
        if (!ctx) return;
        // Wind: lowpassed noise with slow LFO on gain
        const src = ctx.createBufferSource();
        src.buffer = getNoiseBuffer();
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 420;
        const g = ctx.createGain();
        g.gain.value = 0.05;

        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.09;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.035;
        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);

        // Wind strength follows the weather
        windAmp = ctx.createGain();
        windAmp.gain.value = 0.9;

        src.connect(f);
        f.connect(g);
        g.connect(windAmp);
        windAmp.connect(ambientGain);
        src.start();
        lfo.start();

        // Rain: band-limited noise, silent until it rains
        const rsrc = ctx.createBufferSource();
        rsrc.buffer = getNoiseBuffer();
        rsrc.loop = true;
        rsrc.playbackRate.value = 0.93; // decorrelate from the wind noise
        const rhp = ctx.createBiquadFilter();
        rhp.type = 'highpass';
        rhp.frequency.value = 900;
        const rlp = ctx.createBiquadFilter();
        rlp.type = 'lowpass';
        rlp.frequency.value = 6500;
        rainGain = ctx.createGain();
        rainGain.gain.value = 0;
        rsrc.connect(rhp);
        rhp.connect(rlp);
        rlp.connect(rainGain);
        rainGain.connect(ambientGain);
        rsrc.start();

        ambientNodes = [src, lfo, rsrc];

        scheduleBird();
        scheduleCricket();
    }

    // ---------- weather-driven ambience ----------
    let windAmp = null, rainGain = null;
    let atm = { rain: 0, wind: 0.3, night: 0 };
    let lastAtm = { rain: -1, wind: -1 };

    function setAtmosphere(rain, wind, night) {
        atm = { rain, wind, night };
        if (!ctx || !rainGain) return;
        if (Math.abs(rain - lastAtm.rain) > 0.02) {
            rainGain.gain.setTargetAtTime(rain * 0.11, now(), 0.4);
            lastAtm.rain = rain;
        }
        if (Math.abs(wind - lastAtm.wind) > 0.02) {
            windAmp.gain.setTargetAtTime(0.5 + wind * 1.4, now(), 0.6);
            lastAtm.wind = wind;
        }
    }

    let cricketTimer = null;
    function scheduleCricket() {
        if (cricketTimer) clearTimeout(cricketTimer);
        cricketTimer = setTimeout(() => {
            if (ctx && !muted && document.visibilityState === 'visible' && atm.night > 0.5 && atm.rain < 0.3) cricket();
            scheduleCricket();
        }, 600 + Math.random() * 1200);
    }

    function cricket() {
        const t0 = now();
        const f = 4200 + Math.random() * 600;
        for (let i = 0; i < 3; i++) {
            tone({ freq: f, type: 'sine', dur: 0.025, vol: 0.022 * atm.night, t: t0 + i * 0.055, dest: ambientGain });
        }
    }

    function thunder() {
        if (!ctx || muted) return;
        const t0 = now();
        noise({ dur: 0.25, vol: 0.25, filterFreq: 900, type: 'bandpass', q: 0.8, t: t0, dest: ambientGain });
        noise({ dur: 2.6, vol: 0.55, filterFreq: 140, t: t0 + 0.05, dest: ambientGain });
        noise({ dur: 1.6, vol: 0.3, filterFreq: 260, t: t0 + 0.6, dest: ambientGain });
    }

    function scheduleBird() {
        if (birdTimer) clearTimeout(birdTimer);
        birdTimer = setTimeout(() => {
            if (ctx && !muted && document.visibilityState === 'visible' && atm.night < 0.3 && atm.rain < 0.2) bird();
            scheduleBird();
        }, 2500 + Math.random() * 6000);
    }

    function bird() {
        const t0 = now();
        const base = 1800 + Math.random() * 1200;
        const chirps = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < chirps; i++) {
            const t = t0 + i * (0.09 + Math.random() * 0.06);
            tone({ freq: base, type: 'sine', dur: 0.07, vol: 0.05, slideTo: base * (1.2 + Math.random() * 0.3), t, dest: ambientGain });
        }
    }

    // ---------- music ----------
    function startMusic() {
        if (!ctx || musicTimer) return;
        nextNoteTime = now() + 0.1;
        step = 0;
        musicTimer = setInterval(scheduler, 100);
    }

    function scheduler() {
        if (!ctx) return;
        while (nextNoteTime < now() + 0.25) {
            playStep(step, nextNoteTime);
            nextNoteTime += STEP;
            step++;
        }
    }

    function pluck(freq, t, vol = 0.5, dur = 0.5) {
        // plucked string: two detuned triangles with fast decay
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = 'triangle';
        osc2.type = 'sine';
        osc1.frequency.value = freq;
        osc2.frequency.value = freq * 2.005;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const g2 = ctx.createGain();
        g2.gain.value = 0.25;
        osc1.connect(g);
        osc2.connect(g2);
        g2.connect(g);
        g.connect(musicGain);
        osc1.start(t); osc2.start(t);
        osc1.stop(t + dur + 0.05); osc2.stop(t + dur + 0.05);
    }

    function drone(freq, t, dur) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 500;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.18, t + 0.3);
        g.gain.setValueAtTime(0.18, t + dur - 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(f);
        f.connect(g);
        g.connect(musicGain);
        osc.start(t);
        osc.stop(t + dur + 0.05);
    }

    function tambour(t, accent) {
        noise({ dur: accent ? 0.12 : 0.06, vol: accent ? 0.35 : 0.15, filterFreq: accent ? 180 : 900, type: accent ? 'lowpass' : 'highpass', t, dest: musicGain });
        if (accent) tone({ freq: 110, type: 'sine', dur: 0.12, vol: 0.4, slideTo: 60, t, dest: musicGain });
    }

    function playStep(s, t) {
        const bar = Math.floor(s / 16);
        const inBar = s % 16;
        const phrase = PHRASES[bar % PHRASES.length];

        // Drone every bar (two bars long for smooth overlap)
        if (inBar === 0) {
            const bassIdx = BASS[bar % BASS.length];
            drone(SCALE[bassIdx] / 2, t, STEP * 16 + 0.3);
        }
        // Percussion: soft tambour on beats 1 and 3, lighter on others
        if (inBar % 4 === 0) tambour(t, inBar === 0 || inBar === 8);
        else if (inBar % 2 === 0 && Math.random() < 0.3) tambour(t, false);

        // Melody
        const n = phrase[inBar];
        if (n >= 0) {
            const octaveUp = bar % 8 >= 4 ? 2 : 1;
            pluck(SCALE[n] * octaveUp, t, 0.4, 0.6);
            // occasional harmony a third below
            if (inBar % 4 === 0 && Math.random() < 0.5 && n >= 2) pluck(SCALE[n - 2] * octaveUp, t, 0.2, 0.5);
        }
    }

    // ---------- controls ----------
    function setMuted(m) {
        muted = m;
        if (master) master.gain.setTargetAtTime(muted ? 0 : 1, now(), 0.02);
        saveSettings();
    }

    function toggleMute() {
        setMuted(!muted);
        return muted;
    }

    function setMusic(on) {
        musicOn = on;
        if (musicGain) musicGain.gain.setTargetAtTime(on ? 0.16 : 0, now(), 0.05);
        saveSettings();
    }

    function toggleMusic() {
        setMusic(!musicOn);
        return musicOn;
    }

    function setSfx(on) {
        sfxOn = on;
        if (sfxGain) sfxGain.gain.setTargetAtTime(on ? 0.5 : 0, now(), 0.02);
        saveSettings();
    }

    function toggleSfx() {
        setSfx(!sfxOn);
        return sfxOn;
    }

    function isMuted() { return muted; }
    function isMusicOn() { return musicOn; }
    function isSfxOn() { return sfxOn; }

    // Pause ambient/music when tab hidden (saves CPU, avoids surprise noise)
    document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.visibilityState === 'hidden') ctx.suspend();
        else ctx.resume();
    });

    loadSettings();

    return {
        init,
        isReady,
        play,
        toggleMute,
        setMuted,
        isMuted,
        toggleMusic,
        setMusic,
        isMusicOn,
        toggleSfx,
        setSfx,
        isSfxOn,
        setAtmosphere,
        thunder,
    };
})();
