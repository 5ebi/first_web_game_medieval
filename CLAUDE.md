# Lords of the Keep: notes for Claude

Vanilla JS + HTML5 canvas game, no build step, mobile-first. Scripts are classic
`<script>` files sharing globals (see the order in `index.html`).

The owner writes in (Swiss) German: reply in German. Code, UI text, commits and
docs are English.

Status, decisions, open TODOs and gotchas: @ROADMAP.md

## Run

```sh
python3 -m http.server 8123   # http://127.0.0.1:8123/index.html
```

Prefer http over `file://`: Chrome blocks the bundled font on `file://`.

## Regression tests

```sh
sh tests/run-all.sh   # starts a server if needed; logs and screenshots in tests/out/
```

Plain Playwright scripts (pre-installed in cloud sessions), one per area: `save`,
`touch`, `mouse`, `placement`, `feedback`, `e2e-phone`, `perf`, `screenshots`.
Shared helpers in `tests/helpers.js` (`URL` from `GAME_URL`, `assert`, `out()`,
`seedRandom` for a fixed map). Add checks there when you change behaviour.

## Explore with the MCP servers in `.mcp.json`

| Server | Browser | Use it for |
|---|---|---|
| `playwright` | iPhone 15 emulation (touch, DPR 3), headless | UI and touch flows: `browser_snapshot` for HUD, menus and overlays; `browser_take_screenshot` for the canvas; `browser_mouse_*_xy` to tap and drag on the map |
| `chrome-devtools` | desktop 1280×800, headless | performance (`emulate` with `cpuThrottlingRate: 4`, then `performance_start_trace` / `performance_stop_trace`), console errors, `lighthouse_audit` |

Both use a fresh, isolated profile (no saved game). Chrome DevTools tools need
`pageId` (get it from `list_pages`).

The map is a canvas, so the accessibility tree only shows the HUD, menus and
overlays. For the game world, read state with `browser_evaluate` /
`evaluate_script`:

- `Game`: `getState()`, `canPlace(type, x, y)`, `placeBuilding(type, x, y)`,
  `update(ms)`. `Game.update(60000)` advances one day at 1×.
- `BuildingManager`, `GameMap`, `SaveGame`.
- `UI`: `selectBuilding(type)`, `getPlacementPreview()`.
- `Renderer`: `getCamera()`, `setCamera(x, y)`, `getViewport()`, `centerOn(x, y)`.
  Tile to screen: `tileX * 32 - Renderer.getCamera().x` (TILE_SIZE = 32).

## Before pushing UI changes

- `sh tests/run-all.sh` passes.
- Phone portrait, phone landscape and desktop: no console errors, nothing cut off.
- Touch: tap a card → ghost on a free spot → **Build**; drag the map; swipe the building bar.
- Reload → **Continue** restores buildings, day and speed.
