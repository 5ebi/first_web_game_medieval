# Lords of the Keep: notes for Claude

Medieval castle builder. Vanilla JS + HTML5 canvas, no build step, no dependencies,
mobile first. GitHub Pages deploys `main` (`.github/workflows/deploy.yml`).

The owner writes in (Swiss) German: **reply in German**. Code, UI text (English and
German live in `js/i18n.js`), commits, PRs and docs are **English**.

Status, decisions, open TODOs and gotchas: @ROADMAP.md

## How work is organised

Big requests are not done in one chat. A **planner** session splits them into
GitHub issues and starts one **worker** session per issue (fresh context,
Opus 5.5, medium effort via `.claude/settings.json`).

- Planner: `/plan-and-dispatch <the owner's message>` (`.claude/skills/plan-and-dispatch/`)
- Worker: `/work-task <issue number>` (`.claude/skills/work-task/`)

A worker only does its own issue, on its own branch from `main`, and opens its
own draft PR (`Closes #N`). Anything outside the issue goes into a new issue or
the PR notes, not into the code.

## Run

```sh
python3 -m http.server 8123   # http://127.0.0.1:8123/index.html
```

Serve over http rather than `file://` (custom PNG art in `assets/` is blocked on `file://`).

## Check before pushing

```sh
sh tests/run-all.sh    # starts a server if needed; screenshots + logs in tests/out/
```

`tests/smoke.js` (Playwright, pre-installed in cloud sessions, `require('playwright')`)
plays a short game on desktop, phone portrait and phone landscape. It fails on console
errors, on a broken save/continue, or when the panel covers the whole screen. Look at
the screenshots in `tests/out/` yourself: the canvas can't be checked by the
accessibility tree. Add a check to `tests/smoke.js` when you change behaviour.

## Code map (scripts share globals; load order in `index.html`)

| File | Area | What lives there |
|---|---|---|
| `js/constants.js` | balance | map size, `TERRAIN`, `BUILDINGS` (cost, workers, production), `SEASONS`, `MILESTONES`, `SAVE_KEY` |
| `js/settings.js` | settings | persisted options (`lotk_settings_v1`) |
| `js/i18n.js` | text | `t(key, vars)`, `bName`, `resName`; every UI string in `en` **and** `de` |
| `js/audio.js` | audio | `AudioSys`: synthesized SFX, ambience (wind, rain, birds), procedural music |
| `js/sprites.js` | art | `Sprites`: procedural pixel art (tiles, trees, buildings, villagers, icons), caches, custom PNG loading from `assets/` |
| `js/map.js` | world gen | `GameMap`: seeded terrain, trees, stones, elevation |
| `js/buildings.js` | state | `BuildingManager`: placed buildings, save/load of buildings |
| `js/villagers.js` | life | `Villagers`: workers walking work routes (cosmetic), click info |
| `js/effects.js` | fx | `Effects`: particles, floating texts |
| `js/atmosphere.js` | fx | `Atmosphere`: weather, clouds, fog, rain/snow, birds, night lights |
| `js/game.js` | rules | `Game`: economy tick, placement rules, seasons, milestones, save |
| `js/renderer.js` | drawing | `Renderer`: camera, terrain cache, sun shadows, depth-sorted sprites, minimap |
| `js/ui.js` | UI | `UI`: HUD, build menu, info panel, input (mouse, touch, keys) |
| `js/main.js` | boot | start / continue / new game, main loop |
| `css/style.css` | UI | all styles, phone layouts at the end |

**Hot files** (many features touch them, so parallel work conflicts here):
`js/ui.js`, `css/style.css`, `js/renderer.js`, `js/i18n.js`, `index.html`.

## Useful handles (browser console / Playwright `page.evaluate`)

- `Game.getState()`, `Game.canPlace(type, x, y)`, `Game.placeBuilding(type, x, y)`,
  `Game.update(ms)` (`Game.update(60000)` = one game minute at 1×; a day is 6 minutes).
- `UI.selectBuilding(type)`, `UI.deselectBuilding()`, `UI.getPlacementPreview()`.
- `Renderer.getCamera()`, `Renderer.setZoom(z)`, `Renderer.centerOn(wx, wy)`,
  `Renderer.worldToScreen(wx, wy)`. Tile → world: `tile * TILE_SIZE` (32).
- `Atmosphere.setWeather('rain', true)`, `Villagers.getAll()`.

## Conventions

- Pixel art stays crisp: whole pixels, `imageSmoothingEnabled = false`, procedural (no
  copied art from other games). Inspiration from Stronghold etc. is fine for layout and
  feel, never for assets, names or text.
- Every new string: add it to `en` and `de` in `js/i18n.js`.
- Save format change → bump `SAVE_KEY` or migrate; old saves must not crash.
- Keep it light for phones: cache sprites, no per-frame allocations in hot loops.
- Small, focused commits. Commit messages explain the why.
