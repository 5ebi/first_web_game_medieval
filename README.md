# Lords of the Keep

A medieval castle builder game in the browser. Inspired by Stronghold, Civilization, and Thronefall.

## Play

Open `index.html` in any modern browser — no build step or dependencies needed.
Turn your sound on: music, ambience and effects are all synthesized in the browser.

## How to Play

Inspired by Stronghold, made for phones and desktop.

- **Place your Castle** (it is pre-selected), then the **Warehouse**. Time stands still until the warehouse is built; it brings the starting supplies (50 wood, 20 stone, 20 meat).
- Nothing grows by itself: **only buildings with workers produce**, in batches (a bar under each building shows the next delivery). The castle gives you 10 villagers.
- The **lumberjack is always free**, so you can never run out of wood for good.
- A **quarry** must stand at least half on a stone field. Lumberjacks and hunters need a forest nearby.
- Every working villager eats **0.5 meat per minute**. Without meat your people leave after 60 seconds.
- A **day** (full day/night cycle) lasts 6 minutes at 1x. Each **season** lasts one day: hunting is better in summer and autumn and halved in winter. A warning two minutes before winter tells you how much meat to store.
- **Drag** the map to scroll, **mouse wheel** / trackpad pinch / **+** / **-** to zoom, **WASD** or **arrow keys** to pan, click the **minimap** to jump
- On touch screens: tap the map to position the building, tap it again to build; the bar above the menu cancels
- **Right-click**, **Escape** or the ✕ in the placement bar cancels placement
- **Space** to pause/unpause, **1/2/3** for speed, **M** mute, **O** settings, **H** help, **C** center on the Castle
- Click a placed building for details or to **demolish** it (50% refund, **Del** key). Progress is **saved automatically**.
- **Weather** changes every few minutes: clear, cloudy, rain (snow in winter) or fog.

### Buildings (rates at 1x)

| Building | Cost | Workers | Effect |
|---|---|---|---|
| Castle | Free | — | +10 villagers |
| Warehouse | First free (+ starting supplies), then 30 wood, 20 stone | — | +300 storage |
| Lumberjack | **Always free** | 2 | 4 wood every 20 s (12/min), near forest |
| Hunter's Hut | 15 wood | 2 | 4 meat every 30 s (8/min), near forest |
| Stone Quarry | 20 wood | 3 | 4 stone every 30 s (8/min), half on a stone field |
| House | 15 wood, 10 stone | — | +5 villagers |
| Tavern | 25 wood, 15 stone, 5 iron | — | +8 villagers |
| Iron Mine | 30 wood, 15 stone | 3 | 3 iron every 40 s (4.5/min), near stone |
| Blacksmith | 30 wood, 20 stone, 10 iron | 1 | wood, stone and iron 25% faster (limit 1) |

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
