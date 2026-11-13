// ============================================
// Audio - sound effects, ambience and music (Web Audio API)
// SFX and ambience are synthesized at runtime. Music is the licensed recordings in
// assets/music/ (shuffled playlist); the procedural composer below is only a fallback
// for when a track can't be loaded (offline, 404).
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
    let ambientNodes = [];
    let birdTimer = null;

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
            if (musicAudible()) resumeTrack();   // retry a play() blocked by autoplay rules
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
        musicGain.gain.value = 0;   // set by startTracks / fallbackToSynth
        musicGain.connect(master);

        ambientGain = ctx.createGain();
        ambientGain.gain.value = 0.35;
        ambientGain.connect(master);

        started = true;
        startAmbient();
        startTracks();
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

    let brownBuffer = null;
    function getBrownBuffer() {
        if (brownBuffer) return brownBuffer;
        const len = ctx.sampleRate * 3;
        brownBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = brownBuffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
            last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
            d[i] = last * 3.2;
        }
        // crossfade the loop seam
        const fade = 2000;
        for (let i = 0; i < fade; i++) d[len - fade + i] = d[len - fade + i] * (1 - i / fade) + d[i] * (i / fade);
        return brownBuffer;
    }

    // Single raindrops on leaves, roofs and puddles: tiny filtered ticks at random times
    let dropTimer = null;
    function scheduleDrops() {
        if (dropTimer) clearTimeout(dropTimer);
        const r = atm.rain;
        dropTimer = setTimeout(() => {
            if (ctx && !muted && r > 0.05 && document.visibilityState === 'visible') {
                const t0 = now();
                const n = 1 + Math.floor(r * 4);
                for (let i = 0; i < n; i++) {
                    const f = 1800 + Math.random() * 4200;
                    noise({ dur: 0.012 + Math.random() * 0.02, vol: 0.05 + Math.random() * 0.08, filterFreq: f, type: 'bandpass', q: 6, t: t0 + Math.random() * 0.08, dest: dropGain });
                    if (Math.random() < 0.15) tone({ freq: 900 + Math.random() * 900, type: 'sine', dur: 0.05, vol: 0.03, slideTo: 1600 + Math.random() * 800, t: t0 + Math.random() * 0.08, dest: dropGain });
                }
            }
            scheduleDrops();
        }, r > 0.05 ? 40 + Math.random() * 90 : 600);
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
        buildStart() {
            const t0 = now();
            tone({ freq: 120, type: 'sine', dur: 0.28, vol: 0.55, slideTo: 48, t: t0 });
            noise({ dur: 0.3, vol: 0.4, filterFreq: 500, t: t0 });
            noise({ dur: 0.18, vol: 0.18, filterFreq: 1600, type: 'bandpass', q: 1.5, t: t0 + 0.08 }); // shovel scrape
        },
        hammer(o = {}) {
            const t0 = now();
            const v = 0.85 + Math.random() * 0.3; // pitch variation so it never sounds like a machine gun
            if (o.material === 'stone') {
                noise({ dur: 0.035, vol: 0.32, filterFreq: 3400 * v, type: 'bandpass', q: 4, t: t0 });
                tone({ freq: 1350 * v, type: 'square', dur: 0.04, vol: 0.06, t: t0 });
                tone({ freq: 2050 * v, type: 'sine', dur: 0.09, vol: 0.05, t: t0 });
            } else if (o.material === 'soil') {
                noise({ dur: 0.09, vol: 0.32, filterFreq: 650 * v, t: t0 });
                tone({ freq: 130 * v, type: 'sine', dur: 0.1, vol: 0.22, slideTo: 70, t: t0 });
            } else {
                noise({ dur: 0.045, vol: 0.38, filterFreq: 1700 * v, type: 'bandpass', q: 3, t: t0 });
                tone({ freq: 290 * v, type: 'triangle', dur: 0.07, vol: 0.22, slideTo: 220 * v, t: t0 });
            }
        },
        buildDone() {
            const t0 = now();
            tone({ freq: 95, type: 'sine', dur: 0.22, vol: 0.4, slideTo: 55, t: t0 });
            [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => {
                tone({ freq: f, type: 'triangle', dur: i === 3 ? 0.45 : 0.18, vol: 0.12, t: t0 + 0.05 + i * 0.065 });
                tone({ freq: f * 2.01, type: 'sine', dur: i === 3 ? 0.5 : 0.15, vol: 0.035, t: t0 + 0.05 + i * 0.065 });
            });
            [2637, 3136, 2794].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.05, vol: 0.035, t: t0 + 0.38 + i * 0.07 }));
        },
        season(o = {}) {
            // A short motif per season: bright for spring/summer, mellow for autumn, cold for winter
            const motifs = {
                spring: [523.25, 659.25, 783.99, 1046.5],
                summer: [587.33, 739.99, 880, 1174.66],
                autumn: [440, 523.25, 659.25, 587.33],
                winter: [659.25, 587.33, 493.88, 392],
            };
            const notes = motifs[o.id] || motifs.spring;
            const t0 = now();
            notes.forEach((f, i) => {
                tone({ freq: f, type: 'triangle', dur: i === notes.length - 1 ? 0.6 : 0.22, vol: 0.11, t: t0 + i * 0.13 });
                tone({ freq: f * 2, type: 'sine', dur: 0.3, vol: o.id === 'winter' ? 0.05 : 0.025, t: t0 + i * 0.13 });
            });
            tone({ freq: notes[0] / 2, type: 'sine', dur: 1.0, vol: 0.12, t: t0 });
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

    function play(name, opts) {
        if (!ctx || muted || !sfxOn) return;
        if (ctx.state === 'suspended') ctx.resume();
        const fn = sfx[name];
        if (fn) fn(opts);
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

        // Rain: a soft, low "body" (brown-ish noise) plus a quiet airy layer and
        // individual droplets (see scheduleDrops). Much calmer than plain white noise.
        rainGain = ctx.createGain();
        rainGain.gain.value = 0;
        rainGain.connect(ambientGain);
        const rsrc = ctx.createBufferSource();
        rsrc.buffer = getBrownBuffer();
        rsrc.loop = true;
        const rbody = ctx.createBiquadFilter();
        rbody.type = 'lowpass'; rbody.frequency.value = 1400; rbody.Q.value = 0.3;
        const rbodyG = ctx.createGain(); rbodyG.gain.value = 0.9;
        rsrc.connect(rbody); rbody.connect(rbodyG); rbodyG.connect(rainGain);
        const rair = ctx.createBufferSource();
        rair.buffer = getNoiseBuffer();
        rair.loop = true;
        rair.playbackRate.value = 0.87;
        const rairF = ctx.createBiquadFilter();
        rairF.type = 'bandpass'; rairF.frequency.value = 3200; rairF.Q.value = 0.5;
        const rairG = ctx.createGain(); rairG.gain.value = 0.12;
        // slow swells, like gusts pushing the rain around
        const rlfo = ctx.createOscillator(); rlfo.frequency.value = 0.13;
        const rlfoG = ctx.createGain(); rlfoG.gain.value = 0.05;
        rlfo.connect(rlfoG); rlfoG.connect(rairG.gain);
        rair.connect(rairF); rairF.connect(rairG); rairG.connect(rainGain);
        rsrc.start(); rair.start(); rlfo.start();
        dropGain = ctx.createGain();
        dropGain.gain.value = 0;
        dropGain.connect(ambientGain);
        scheduleDrops();

        ambientNodes = [src, lfo, rsrc, rair, rlfo];

        scheduleBird();
        scheduleCricket();
    }

    // ---------- weather-driven ambience ----------
    let windAmp = null, rainGain = null, dropGain = null;
    let atm = { rain: 0, wind: 0.3, night: 0, season: 'spring' };
    let lastAtm = { rain: -1, wind: -1 };

    function setAtmosphere(rain, wind, night, season = 'spring') {
        atm = { rain, wind, night, season };
        if (!ctx || !rainGain) return;
        if (Math.abs(rain - lastAtm.rain) > 0.02) {
            rainGain.gain.setTargetAtTime(rain * 0.05, now(), 0.8);
            dropGain.gain.setTargetAtTime(rain * 0.5, now(), 0.8);
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
            if (ctx && !muted && document.visibilityState === 'visible' && atm.night > 0.5 && atm.rain < 0.3 && (atm.season === 'spring' || atm.season === 'summer')) cricket();
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
        noise({ dur: 0.3, vol: 0.12, filterFreq: 700, type: 'bandpass', q: 0.7, t: t0, dest: ambientGain });
        noise({ dur: 3.2, vol: 0.4, filterFreq: 110, t: t0 + 0.08, dest: ambientGain });
        noise({ dur: 2.0, vol: 0.22, filterFreq: 220, t: t0 + 0.7, dest: ambientGain });
    }

    function scheduleBird() {
        if (birdTimer) clearTimeout(birdTimer);
        birdTimer = setTimeout(() => {
            if (ctx && !muted && document.visibilityState === 'visible' && atm.night < 0.3 && atm.rain < 0.2 && atm.season !== 'winter') bird();
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
    // A small procedural composer in the spirit of medieval "knight" scores:
    // plucked lute (Karplus-Strong), shawm / recorder melodies, a hurdy-gurdy drone,
    // frame drum and tambourine, all through a hall reverb. Every piece gets its own
    // key, mode, tempo, chord progression and motif, and is built from sections
    // (intro, theme, answer, march, interlude) so it never loops the same 8 bars.
    const MODES = {
        dorian:     [0, 2, 3, 5, 7, 9, 10],
        aeolian:    [0, 2, 3, 5, 7, 8, 10],
        mixolydian: [0, 2, 4, 5, 7, 9, 10],
    };
    const ROOTS = { D: 146.83, E: 164.81, G: 196.0, A: 220.0, C: 130.81 };
    // chord roots as scale degrees (0-based), one per bar
    const PROGRESSIONS = [
        [0, 6, 0, 4], [0, 3, 6, 0], [0, 6, 5, 6], [0, 4, 3, 0], [0, 2, 6, 4], [5, 6, 0, 0], [0, 3, 4, 0],
    ];

    let musicFx = null;      // { dry, verbIn }
    let piece = null;        // current piece (plan of bars)
    let barIndex = 0;
    let restUntil = 0;
    const ksCache = new Map();

    function makeImpulse(seconds, decay) {
        const sr = ctx.sampleRate, len = Math.floor(sr * seconds);
        const buf = ctx.createBuffer(2, len, sr);
        for (let ch = 0; ch < 2; ch++) {
            const d = buf.getChannelData(ch);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
        return buf;
    }

    function ensureMusicFx() {
        if (musicFx) return musicFx;
        const dry = ctx.createGain(); dry.gain.value = 0.8;
        const verbIn = ctx.createGain(); verbIn.gain.value = 1;
        const conv = ctx.createConvolver();
        conv.buffer = makeImpulse(2.6, 2.8);
        const verbOut = ctx.createGain(); verbOut.gain.value = 0.32;
        // gentle "room" EQ so nothing is harsh
        const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 5200;
        dry.connect(tone);
        verbIn.connect(conv); conv.connect(verbOut); verbOut.connect(tone);
        tone.connect(musicGain);
        musicFx = { dry, verbIn };
        return musicFx;
    }

    // Plucked string, rendered once per pitch with Karplus-Strong
    function ksBuffer(freq, bright) {
        const key = Math.round(freq * 10) + '_' + bright;
        if (ksCache.has(key)) return ksCache.get(key);
        const sr = ctx.sampleRate, dur = 2.2, len = Math.floor(sr * dur);
        const buf = ctx.createBuffer(1, len, sr);
        const out = buf.getChannelData(0);
        const N = Math.max(2, Math.round(sr / freq));
        const ring = new Float32Array(N);
        let prev = 0;
        for (let i = 0; i < N; i++) { // pluck: noise, low-passed for a warmer gut-string attack
            const n = Math.random() * 2 - 1;
            prev = prev + (n - prev) * bright;
            ring[i] = prev;
        }
        const damp = 0.4985 + 0.0012 * Math.min(1, 220 / freq);
        let idx = 0;
        for (let i = 0; i < len; i++) {
            const nxt = (idx + 1) % N;
            const v = ring[idx];
            out[i] = v;
            ring[idx] = (v + ring[nxt]) * damp;
            idx = nxt;
        }
        // short fade at the end
        for (let i = len - 2000; i < len; i++) out[i] *= (len - i) / 2000;
        ksCache.set(key, buf);
        return buf;
    }

    function lute(freq, t, vol, dur = 1.6, bright = 0.5) {
        const fx = ensureMusicFx();
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.setTargetAtTime(0.0001, t + dur * 0.7, dur * 0.25);
        const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 420; body.gain.value = 4; body.Q.value = 1;
        // a lute course: two strings, a hair apart
        [1, 1.003].forEach((k, i) => {
            const src = ctx.createBufferSource();
            src.buffer = ksBuffer(freq * k, bright);
            const sg = ctx.createGain(); sg.gain.value = i ? 0.55 : 1;
            src.connect(sg); sg.connect(body);
            src.start(t + i * 0.006);
            src.stop(t + dur + 0.3);
        });
        body.connect(g);
        g.connect(fx.dry);
        const send = ctx.createGain(); send.gain.value = 0.35;
        g.connect(send); send.connect(fx.verbIn);
    }

    // Reed / flute voice with breath, vibrato and a soft attack
    function wind(freq, t, dur, vol, kind) {
        const fx = ensureMusicFx();
        const osc = ctx.createOscillator();
        osc.type = kind === 'shawm' ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        const vib = ctx.createOscillator(); vib.frequency.value = 5.2 + Math.random() * 0.6;
        const vibG = ctx.createGain(); vibG.gain.setValueAtTime(0, t); vibG.gain.linearRampToValueAtTime(freq * 0.006, t + Math.min(0.4, dur * 0.6));
        vib.connect(vibG); vibG.connect(osc.frequency);
        const f = ctx.createBiquadFilter();
        if (kind === 'shawm') { f.type = 'bandpass'; f.frequency.value = Math.min(2600, freq * 3.2); f.Q.value = 0.9; }
        else { f.type = 'lowpass'; f.frequency.value = freq * 2.5; }
        const g = ctx.createGain();
        const a = kind === 'shawm' ? 0.05 : 0.07;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + a);
        g.gain.setValueAtTime(vol * 0.85, t + Math.max(a, dur - 0.08));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
        osc.connect(f); f.connect(g);
        // breath noise for the recorder
        if (kind !== 'shawm') {
            const n = ctx.createBufferSource(); n.buffer = getNoiseBuffer(); n.loop = true;
            const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = freq * 2; nf.Q.value = 2;
            const ng = ctx.createGain(); ng.gain.value = 0.06;
            n.connect(nf); nf.connect(ng); ng.connect(g);
            n.start(t, Math.random()); n.stop(t + dur + 0.2);
        }
        g.connect(fx.dry);
        const send = ctx.createGain(); send.gain.value = 0.5;
        g.connect(send); send.connect(fx.verbIn);
        osc.start(t); vib.start(t);
        osc.stop(t + dur + 0.2); vib.stop(t + dur + 0.2);
    }

    // Hurdy-gurdy style drone: root + fifth, slowly breathing filter
    function gurdy(freq, t, dur, vol) {
        const fx = ensureMusicFx();
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.25);
        g.gain.setValueAtTime(vol, t + dur - 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2;
        f.frequency.setValueAtTime(380, t);
        f.frequency.linearRampToValueAtTime(620, t + dur / 2);
        f.frequency.linearRampToValueAtTime(400, t + dur);
        [[1, 1], [1.5, 0.55], [0.5, 0.5]].forEach(([k, v]) => {
            const o = ctx.createOscillator(); o.type = 'sawtooth';
            o.frequency.value = freq * k; o.detune.value = (Math.random() - 0.5) * 8;
            const og = ctx.createGain(); og.gain.value = v;
            o.connect(og); og.connect(f);
            o.start(t); o.stop(t + dur + 0.3);
        });
        f.connect(g); g.connect(fx.dry);
        const send = ctx.createGain(); send.gain.value = 0.3; g.connect(send); send.connect(fx.verbIn);
    }

    function frameDrum(t, accent) {
        const fx = ensureMusicFx();
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(accent ? 95 : 120, t);
        o.frequency.exponentialRampToValueAtTime(52, t + 0.18);
        const g = ctx.createGain();
        g.gain.setValueAtTime(accent ? 0.75 : 0.35, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (accent ? 0.45 : 0.25));
        o.connect(g); g.connect(fx.dry);
        const send = ctx.createGain(); send.gain.value = 0.4; g.connect(send); send.connect(fx.verbIn);
        o.start(t); o.stop(t + 0.5);
        noise({ dur: 0.05, vol: accent ? 0.2 : 0.1, filterFreq: 700, type: 'bandpass', q: 1.2, t, dest: fx.dry });
    }

    function tek(t, vol) { // rim tap
        noise({ dur: 0.03, vol, filterFreq: 2400, type: 'bandpass', q: 3, t, dest: ensureMusicFx().dry });
    }

    function tambourine(t, vol) {
        const fx = ensureMusicFx();
        for (let i = 0; i < 3; i++) noise({ dur: 0.05, vol: vol * (1 - i * 0.3), filterFreq: 7500, type: 'highpass', q: 0.7, t: t + i * 0.012, dest: fx.dry });
    }

    // ---- composition ----
    function rngFrom(seed) {
        let a = seed | 0;
        return () => {
            a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function newPiece() {
        const r = rngFrom((Math.random() * 1e9) | 0);
        const pick = arr => arr[Math.floor(r() * arr.length)];
        const winter = atm.season === 'winter';
        const night = atm.night > 0.5;
        const modeName = winter ? 'aeolian' : pick(['dorian', 'dorian', 'aeolian', 'mixolydian']);
        const rootName = pick(Object.keys(ROOTS));
        const calm = night || winter || r() < 0.3;
        const bpm = calm ? 66 + Math.floor(r() * 12) : 88 + Math.floor(r() * 18);
        const prog = pick(PROGRESSIONS);
        const prog2 = pick(PROGRESSIONS);
        // a 2-bar motif: rhythm (eighths; 1 = note, 2 = held) and contour (scale steps)
        const rhythms = [
            [1, 0, 1, 1, 1, 0, 1, 0], [1, 2, 2, 1, 1, 1, 1, 0], [1, 0, 1, 0, 1, 1, 1, 0],
            [1, 1, 1, 0, 1, 2, 1, 0], [1, 2, 1, 1, 1, 2, 2, 0], [1, 1, 1, 1, 1, 2, 2, 2],
        ];
        const motif = [pick(rhythms), pick(rhythms)];
        const contour = Array.from({ length: 16 }, () => pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]));
        const lead = calm ? 'recorder' : pick(['shawm', 'recorder', 'shawm']);
        // section plan
        const S = (type, bars, progUsed) => ({ type, bars, prog: progUsed });
        const plan = calm
            ? [S('intro', 4, prog), S('theme', 8, prog), S('answer', 8, prog2), S('theme', 8, prog), S('outro', 2, [0, 0])]
            : [S('intro', 2, prog), S('theme', 8, prog), S('march', 8, prog2), S('answer', 8, prog2), S('interlude', 4, prog), S('theme', 8, prog), S('outro', 2, [0, 0])];
        const bars = [];
        plan.forEach(sec => { for (let i = 0; i < sec.bars; i++) bars.push({ sec, i }); });
        return { r, mode: MODES[modeName], root: ROOTS[rootName], bpm, motif, contour, lead, calm, bars };
    }

    function degFreq(pc, deg, octave) {
        const m = pc.mode;
        const o = Math.floor(deg / 7);
        const d = ((deg % 7) + 7) % 7;
        return pc.root * Math.pow(2, (m[d] + 12 * (o + octave)) / 12);
    }

    function scheduleBar(pc, bar, t) {
        const eighth = 60 / pc.bpm / 2;
        const { sec, i } = bar;
        const chord = sec.prog[i % sec.prog.length];
        const r = pc.r;
        const last = sec.type === 'outro' && i === sec.bars - 1;

        // drone (not in the march: the drums carry it)
        if (sec.type !== 'march' || i % 2 === 0) gurdy(degFreq(pc, 0, -1), t, eighth * 8 * (sec.type === 'march' ? 2 : 1), sec.type === 'intro' ? 0.05 : 0.07);

        // lute: broken chord patterns, root-fifth-octave-third
        const triad = [chord, chord + 2, chord + 4, chord + 7];
        const pattern = sec.type === 'march' ? [0, 2, 1, 2, 0, 2, 1, 3]
            : pc.calm ? [0, -1, 2, -1, 3, -1, 1, -1] : [0, 1, 2, 3, 2, 1, 2, 1];
        pattern.forEach((pi, k) => {
            if (pi < 0) return;
            if (last && k > 0) return;
            const accent = k === 0 || k === 4;
            lute(degFreq(pc, triad[pi], pi === 0 ? -1 : 0), t + k * eighth + (r() - 0.5) * 0.008, accent ? 0.5 : 0.32, last ? 3 : 1.4, accent ? 0.55 : 0.4);
        });

        // percussion
        if (!pc.calm && sec.type !== 'intro' && sec.type !== 'outro') {
            const groove = sec.type === 'march'
                ? [2, 0, 1, 1, 2, 0, 1, 0]
                : [2, 0, 0, 1, 2, 0, 1, 0];
            groove.forEach((g, k) => {
                if (g === 2) frameDrum(t + k * eighth, true);
                else if (g === 1) tek(t + k * eighth, 0.12);
            });
            if (sec.type === 'march' || sec.type === 'answer') { tambourine(t + 2 * eighth, 0.06); tambourine(t + 6 * eighth, 0.06); }
        } else if (sec.type === 'interlude' || (pc.calm && sec.type !== 'intro' && i % 2 === 0)) {
            frameDrum(t, true);
        }

        // melody
        if (sec.type === 'theme' || sec.type === 'answer' || sec.type === 'march') {
            const rhythm = pc.motif[i % 2];
            const voice = sec.type === 'answer' ? (pc.lead === 'shawm' ? 'recorder' : 'shawm') : pc.lead;
            const octave = voice === 'recorder' ? 1 : 0;
            // the answer runs the contour upside down; every 4th bar cadences to a chord tone
            let deg = chord + (sec.type === 'answer' ? 4 : 2);
            for (let k = 0; k < 8; k++) {
                if (rhythm[k] !== 1) continue;
                let len = 1;
                while (k + len < 8 && rhythm[k + len] === 2) len++;
                let step = pc.contour[(i % 2) * 8 + k];
                if (sec.type === 'answer') step = -step;
                if (i % 4 === 3 && k >= 4) { deg = chord + (k >= 6 ? 0 : 2); }
                else deg += step;
                // keep it in a singable range around the chord
                if (deg > chord + 9) deg -= 7;
                if (deg < chord - 3) deg += 7;
                // occasional ornament (quick upper neighbour)
                const vol = voice === 'shawm' ? 0.12 : 0.16;
                if (len === 1 && r() < 0.12 && !pc.calm) {
                    wind(degFreq(pc, deg + 1, octave), t + k * eighth, eighth * 0.4, vol, voice);
                    wind(degFreq(pc, deg, octave), t + k * eighth + eighth * 0.45, eighth * 0.5, vol, voice);
                } else {
                    wind(degFreq(pc, deg, octave), t + k * eighth, eighth * len * 0.95, vol, voice);
                }
            }
        }
        return eighth * 8;
    }

    // ---------- recorded tracks ----------
    // One <audio> element, reused for every track (iOS only lets an element play
    // without a gesture once a gesture has started it). It is routed through
    // musicGain, so the music toggle, mute and the hidden-tab suspend apply to it.
    // preload="none" and a src set only when a track starts: phones fetch one track
    // at a time, never the whole folder.
    const TRACKS = [
        'merry-on-the-moor', 'highland-hymn', 'river-walk',
        'dawn-of-the-long-road', 'winds-of-aetheria',
    ];
    const MUSIC_DIR = 'assets/music/';
    const TRACK_LEVEL = 0.32;          // musicGain level for recordings (synth uses 0.16)
    const SYNTH_LEVEL = 0.16;
    let trackEl = null;
    let trackBag = [];                 // shuffled names still to play this round
    let lastTrack = null;
    let currentTrack = null;
    let gapTimer = null;
    let pendingNext = false;           // a gap ended while music was off/muted/hidden
    let pauseTimer = null;
    let useSynth = false;              // a track failed: procedural fallback for this session
    const played = [];                 // track history (getMusicState, tests)

    function musicLevel() { return useSynth ? SYNTH_LEVEL : TRACK_LEVEL; }
    function musicAudible() { return musicOn && !muted && document.visibilityState !== 'hidden'; }

    function pickTrack() {
        if (!trackBag.length) {
            trackBag = TRACKS.slice();
            for (let i = trackBag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [trackBag[i], trackBag[j]] = [trackBag[j], trackBag[i]];
            }
            // never the same track twice in a row across rounds
            if (trackBag.length > 1 && trackBag[trackBag.length - 1] === lastTrack) {
                [trackBag[0], trackBag[trackBag.length - 1]] = [trackBag[trackBag.length - 1], trackBag[0]];
            }
        }
        return trackBag.pop();
    }

    function startTracks() {
        if (!ctx || trackEl || useSynth) return;
        if (typeof Audio === 'undefined' || !ctx.createMediaElementSource) { fallbackToSynth(); return; }
        trackEl = new Audio();
        trackEl.preload = 'none';
        try {
            const src = ctx.createMediaElementSource(trackEl);
            src.connect(musicGain);
        } catch (e) { trackEl = null; fallbackToSynth(); return; }
        trackEl.addEventListener('ended', onTrackEnded);
        trackEl.addEventListener('error', onTrackError);
        musicGain.gain.value = musicOn ? TRACK_LEVEL : 0;
        playNextTrack();
    }

    function playNextTrack() {
        if (!trackEl || useSynth) return;
        pendingNext = false;
        if (!musicAudible()) { pendingNext = true; return; }
        currentTrack = pickTrack();
        lastTrack = currentTrack;
        played.push(currentTrack);
        trackEl.src = MUSIC_DIR + currentTrack + '.mp3';
        resumeTrack();
    }

    function resumeTrack() {
        if (!trackEl || useSynth) return;
        clearTimeout(pauseTimer);
        if (pendingNext) { playNextTrack(); return; }
        if (!currentTrack || !trackEl.paused || trackEl.ended) return;
        const p = trackEl.play();
        if (p && p.catch) p.catch(e => {
            // blocked by autoplay rules: try again on the next gesture (init / toggle)
            if (e && e.name === 'NotAllowedError') return;
            if (e && e.name !== 'AbortError') fallbackToSynth();
        });
    }

    // pause once the gain fade is done, so nothing is cut hard
    function pauseTrackSoon() {
        if (!trackEl) return;
        clearTimeout(pauseTimer);
        pauseTimer = setTimeout(() => { if (!musicAudible()) trackEl.pause(); }, 700);
    }

    function onTrackEnded() {
        currentTrack = null;
        clearTimeout(gapTimer);
        // a breath of silence between tracks, like between the procedural pieces
        gapTimer = setTimeout(playNextTrack, (5 + Math.random() * 10) * 1000);
    }

    // A track that never started (offline, 404, can't decode) -> procedural fallback.
    // One that breaks after playing a while (connection dropped mid-stream) just counts
    // as finished; if the next one can't load either, the fallback takes over then.
    function onTrackError() {
        if (!trackEl || useSynth || !trackEl.getAttribute('src')) return;
        if (currentTrack && trackEl.currentTime > 1) onTrackEnded();
        else fallbackToSynth();
    }

    function fallbackToSynth() {
        if (useSynth) return;
        useSynth = true;
        clearTimeout(gapTimer);
        clearTimeout(pauseTimer);
        if (trackEl) {
            trackEl.pause();
            trackEl.removeAttribute('src');
            trackEl.load();
        }
        currentTrack = null;
        if (musicGain) musicGain.gain.setTargetAtTime(musicOn ? SYNTH_LEVEL : 0, now(), 0.05);
        startMusic();
    }

    function startMusic() {
        if (!ctx || musicTimer || !useSynth) return;
        nextNoteTime = now() + 0.3;
        piece = null;
        musicTimer = setInterval(scheduler, 150);
    }

    function scheduler() {
        if (!ctx || !musicOn || muted) { if (ctx) nextNoteTime = Math.max(nextNoteTime, now() + 0.2); return; }
        while (nextNoteTime < now() + 0.5) {
            if (now() < restUntil) { nextNoteTime = restUntil; return; }
            if (!piece || barIndex >= piece.bars.length) {
                if (piece) { // a breath of silence between pieces
                    restUntil = nextNoteTime + 6 + Math.random() * 10;
                    piece = null;
                    nextNoteTime = restUntil;
                    return;
                }
                piece = newPiece();
                barIndex = 0;
            }
            nextNoteTime += scheduleBar(piece, piece.bars[barIndex], nextNoteTime);
            barIndex++;
        }
    }

    // ---------- controls ----------
    function setMuted(m) {
        muted = m;
        if (master) master.gain.setTargetAtTime(muted ? 0 : 1, now(), 0.02);
        if (musicAudible()) resumeTrack(); else pauseTrackSoon();
        saveSettings();
    }

    function toggleMute() {
        setMuted(!muted);
        return muted;
    }

    function setMusic(on) {
        musicOn = on;
        // ~0.2 s time constant: a soft fade, never a hard cut
        if (musicGain) musicGain.gain.setTargetAtTime(on ? musicLevel() : 0, now(), 0.2);
        if (musicAudible()) resumeTrack(); else pauseTrackSoon();
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
        if (document.visibilityState === 'hidden') {
            ctx.suspend();
            if (trackEl) trackEl.pause();     // the element would keep running silently
        } else {
            ctx.resume();
            if (musicAudible()) resumeTrack();
        }
    });

    // Browsers only allow sound after a user gesture. Start audio (and with it the
    // music) on the very first tap / click / key anywhere, e.g. already on the title
    // screen, not only on the Start button. init() is idempotent.
    const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'];
    function unlockOnGesture() {
        init();
        if (ctx && ctx.state !== 'suspended') UNLOCK_EVENTS.forEach(e => document.removeEventListener(e, unlockOnGesture, true));
    }
    UNLOCK_EVENTS.forEach(e => document.addEventListener(e, unlockOnGesture, true));

    // for tests / debugging
    function getMusicState() {
        return {
            mode: useSynth ? 'synth' : 'tracks',
            track: currentTrack,
            playing: !!(trackEl && !trackEl.paused && !trackEl.ended),
            time: trackEl ? trackEl.currentTime : 0,
            gain: musicGain ? musicGain.gain.value : null,
            synthRunning: !!musicTimer,
            played: played.slice(),
        };
    }

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
        getMusicState,
        toggleSfx,
        setSfx,
        isSfxOn,
        setAtmosphere,
        thunder,
    };
})();
