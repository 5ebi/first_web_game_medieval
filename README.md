# Lords of the Keep

A medieval castle builder game in the browser. Inspired by Stronghold, Civilization, and Thronefall.

## Play

Open `index.html` in any modern browser — no build step or dependencies needed.
Turn your sound on: music, ambience and effects are all synthesized in the browser.

## How to Play

- **Place your Castle** first (it is pre-selected, just click the map). The calendar starts once it stands.
- **Drag** the map to scroll, **mouse wheel** / trackpad pinch / **+** / **-** to zoom, **WASD** or **arrow keys** to pan, click the **minimap** to jump
- On touch screens: tap the map to position the building, tap it again to build; the bar above the menu cancels
- **Right-click**, **Escape** or the ✕ in the placement bar cancels placement
- **Space** to pause/unpause, **1/2/3** for speed, **M** mute, **H** help, **C** center on the Castle
- Every building has a **hotkey** (shown in the menu)
- Click a placed building for details or to **demolish** it (50% refund, **Del** key)
- Progress is **saved automatically**; use *Continue* on the title screen
- **Weather** changes every few days: clear, cloudy, rain with thunder, or fog. The sun icon in the top bar shows the current sky.
- **Settings** (gear icon or **O**): language (English / Deutsch), music on/off, sound effects on/off, weather & atmosphere on/off. The language follows your browser the first time and is remembered afterwards.

### Buildings

| Building | Cost | Workers | Effect |
|---|---|---|---|
| Castle | Free | — | +10 villagers |
| Warehouse | Free (limit 1) | — | +300 storage |
| House | 15 wood, 10 stone | — | +5 villagers |
| Tavern | 20 wood, 10 stone, 5 iron | — | +8 villagers |
| Lumberjack | 10 wood | 2 | +6 wood/day (near forest) |
| Stone Quarry | 10 wood | 2 | +4 stone/day (near stone) |
| Iron Mine | 15 wood, 10 stone | 2 | +2 iron/day (near stone) |
| Blacksmith | 20 wood, 15 stone, 10 iron | 1 | +25% wood, stone and iron production (limit 1) |
| Chicken Hut | 10 wood, 5 stone | 1 | +3 food/day |
| Apple Orchard | 15 wood | 1 | +6 food/day after 6 days |
| Wheat Farm | 20 wood, 10 stone | 2 | +10 food/day after 4 days |

### Tips

- Every **working** villager eats **1 food/day**. Idle villagers feed themselves, so housing alone is safe.
- **3 consecutive days** without food = game over. The food counter turns red while you are in danger.
- Lumberjacks, quarries and mines must be within **5 tiles** of forest / stone deposits. The dashed box while placing shows the radius.
- Resources are capped by **storage** (shown in the top bar). Build the Warehouse before your stockpiles fill up.
- The **goal box** above the minimap always shows your next milestone.

## Custom art

Every sprite can be replaced with your own PNG without touching code. See [`assets/README.md`](assets/README.md) (German) for the file layout, sizes and editor tips; `assets/templates/` contains the current art at the exact sizes as a starting point.

## Tech

Pure HTML5 Canvas + vanilla JS. All pixel art is procedurally generated and all audio is synthesized with the Web Audio API — no external assets.

Modules in `js/`:

| File | Purpose |
|---|---|
| `constants.js` | Balance, building definitions, milestones, palettes |
| `settings.js` | Persisted preferences (language, audio) |
| `i18n.js` | English and German strings, `t()` helper |
| `audio.js` | Procedural sound effects, ambient wind/birds, music loop |
| `sprites.js` | Pixel-art tiles, buildings, villagers, icons |
| `map.js` | Seeded terrain generation |
| `buildings.js` | Placed buildings, save/load serialization |
| `villagers.js` | Cosmetic walking workers |
| `effects.js` | Smoke, dust, sparks, floating text |
| `atmosphere.js` | Weather (clear, cloudy, rain, fog), pixel clouds and shadows, fog banks, birds, butterflies, fireflies, leaves, light halos, vignette |
| `game.js` | Economy, day ticks, milestones, save/load |
| `renderer.js` | Camera (pan/zoom, HiDPI), world rendering, minimap |
| `ui.js` | Menus, tooltips, input, notifications |
| `main.js` | Bootstrap and game loop |

## Deploy

Push to `main` and the included workflow deploys to GitHub Pages. Set the Pages source once by hand to **GitHub Actions** (repository Settings → Pages → Build and deployment → Source), otherwise GitHub additionally runs its legacy branch build on every push.
