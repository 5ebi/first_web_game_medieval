# Lords of the Keep

A medieval castle builder game in the browser. Inspired by Stronghold, Civilization, and Thronefall.

## Play

Open `index.html` in any modern browser — no build step or dependencies needed.

## How to Play

- **Place your Castle** first (click it in the right panel, then click the map)
- **Drag** the map to scroll around
- **Right-click** or **Escape** to cancel placement
- **Space** to pause/unpause, **1/2/3** for speed

### Buildings

| Building | Cost | Workers | Output |
|---|---|---|---|
| Castle | Free | — | +10 population |
| Warehouse | Free (limit 1) | — | +200 storage |
| House | 15 wood, 10 stone | — | +5 population |
| Lumberjack | 10 wood | 2 | +6 wood/day (near trees) |
| Stone Quarry | 10 wood | 2 | +4 stone/day (near stone) |
| Iron Mine | 15 wood, 10 stone | 2 | +2 iron/day (near stone) |
| Chicken Hut | 10 wood, 5 stone | 1 | +4 food/day |
| Apple Orchard | 5 wood | 1 | +8 food/day (5 day grow) |

### Tips

- Every villager eats **1 food/day** — build food production early
- **3 consecutive days** without food = game over
- Lumberjacks and quarries must be placed **near** forests/stone deposits
- Resource bar shows production rates (e.g. `40 (+6)` means 40 wood, gaining 6/day)

## Tech

Pure HTML5 Canvas + vanilla JS. All pixel art is procedurally generated — no external assets.

## Deploy

Push to `main` and enable GitHub Pages (Settings → Pages → Source: GitHub Actions). The included workflow auto-deploys.
