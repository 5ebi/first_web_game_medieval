// Shared helpers for the browser tests (Playwright). Run them all with tests/run-all.sh.
const fs = require('fs');
const path = require('path');

// Game URL; run-all.sh starts a static server on this port if none is running
const URL = process.env.GAME_URL || 'http://127.0.0.1:8123/index.html';

// Screenshots and logs (git-ignored)
const OUT_DIR = path.join(__dirname, 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });
const out = (name) => path.join(OUT_DIR, name);

function assert(cond, msg) {
  if (!cond) {
    console.log('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok  :', msg);
  }
}

// Deterministic map: the game seeds its map from Math.random.
// Use as page.addInitScript(seedRandom, 4242)
function seedRandom(seed) {
  let s = seed;
  Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;
}

module.exports = { URL, OUT_DIR, out, assert, seedRandom };
