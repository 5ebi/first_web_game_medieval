# Lords of the Keep

A medieval castle builder game in the browser. Inspired by Stronghold, Civilization, and Thronefall.

## Play

Open `index.html` in any modern browser — no build step or dependencies needed.

For the bundled pixel font, serve the folder instead of opening the file directly
(Chrome blocks web fonts on `file://` and falls back to a monospace font):

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Progress is saved automatically in the browser (every day, every building, and when
you leave the page). The welcome screen offers **Continue** next time.

## How to Play

Made for phones first; works the same with a mouse.

| | Phone / tablet | Mouse & keyboard |
|---|---|---|
| Choose a building | Tap it in the bar at the bottom | Click it in the right panel |
| Position it | It appears on the nearest free spot — tap or drag it to move | It follows the cursor |
| Build | Tap **Build** | Click the map |
| Cancel | Tap **×** | Right-click, **Escape** or **×** |
| Look around | Drag the map | Drag, or scroll / trackpad |
| Details | Tap a resource or a building | Hover a resource, click a building |
| Time | Pause / 1× / 2× / 3× buttons | Same, or **Space** (pause keeps the speed) and **1/2/3** |

A greyed-out building tells you what is missing when you tap it; while placing,
the bar says why a spot does not work (water, trees in the way, too far from
stone, …). Lumberjacks, quarries and mines show their 5-tile range with the
usable resource tiles highlighted.

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

- Every villager eats **1 food/day** — build food production early. New houses add mouths immediately
- **3 consecutive days** without food = game over. The food counter shows how many days are left (`-11 · 3d`)
- Lumberjacks, quarries and mines must be within **5 tiles** of forests / stone deposits, but not on top of them
- Each resource stores **100** until you build the Warehouse (+200). A full bar turns orange: production is being wasted
- A bar under the day fills up until the next day; at the end of each day the yields float up from every building

## Tech

Pure HTML5 Canvas + vanilla JS. All pixel art (map, buildings, icons) is procedurally generated.
The only asset is the [Jersey 10](https://fonts.google.com/specimen/Jersey+10) pixel font in `fonts/`
(SIL Open Font License, see `fonts/Jersey10-OFL.txt`).

- The map's static layer (terrain, trees, rocks) is drawn once; frames are only redrawn when
  something visible changes, so an idle game uses almost no CPU or battery.
- Time does not pass while the tab or app is in the background.
- The canvas renders at the device pixel ratio, so the pixel art stays sharp on phones.

## Testing with AI agents (MCP)

`.mcp.json` sets up two MCP servers that Claude Code (local or on claude.ai/code)
offers after you approve them once:

- **Playwright MCP**: drives the game in an emulated iPhone 15 (touch, high DPI):
  tap through menus, place buildings, take screenshots.
- **Chrome DevTools MCP**: desktop Chrome for performance traces (with CPU
  throttling to mimic a slower phone), console errors and Lighthouse.

Both run headless and use Google Chrome locally (or `CHROME_PATH` if set). To
watch the browser, set `PLAYWRIGHT_MCP_HEADLESS=false`; for another phone, set
`PLAYWRIGHT_MCP_DEVICE` (e.g. `"Pixel 7"`). Notes for the agent are in `CLAUDE.md`,
the plan and open TODOs in `ROADMAP.md`.

Regression tests (Playwright, phone + desktop): `sh tests/run-all.sh`.

## Deploy

Push to `main` and enable GitHub Pages (Settings → Pages → Source: GitHub Actions). The included workflow auto-deploys.
