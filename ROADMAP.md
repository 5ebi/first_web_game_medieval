# Roadmap and status

_Last updated: 2026-11-04_

## Where things stand

- `main` is the original game. GitHub Pages deploys `main` (`.github/workflows/deploy.yml`).
- Branch `claude/medieval-castle-game-FPCZC` → **PR #4 (draft), not merged yet.** It contains:
  autosave, the background-tab fix and render-on-change, the mobile-first HUD, placement feedback
  with the touch flow, daily-loop feedback, the MCP testing setup and the browser tests.
- `sh tests/run-all.sh` runs every browser test (53 checks plus screenshots on 4 devices). All green.

## Product direction

- Medieval builder game, mobile first. If playtesting is fun it becomes a native app (not planned
  yet). Keep vanilla JS + canvas without a build step, so wrapping it (PWA, later e.g. Capacitor)
  stays easy.
- The owner writes in (Swiss) German: reply in German. Code, UI text, commits and docs stay English.

## Decisions (keep them unless there is a reason)

- Touch: tapping a card drops a ghost on the nearest free spot, tap/drag moves it, **Build** confirms.
  Mouse: the ghost follows the cursor, a click places.
- Buildings can't stand on forest or rock tiles. Producers need their resource within
  `RESOURCE_RADIUS` (5) tiles. The map's center clearing has no unbuildable tiles.
- Time does not pass while the page is hidden (no offline progress, starvation would punish).
  The frame delta is clamped (`MAX_FRAME_MS`).
- Rendering is on demand. The static layer (terrain, trees, rocks) is cached per map; anything that
  animates must keep the renderer dirty (`Renderer.markDirty()`; floaters do this).
- Save: `localStorage` key `lordsOfTheKeep.save`, `VERSION = 1`. Population, workers and storage are
  recalculated on load. Changing the format → bump the version and migrate old saves.
- Font: Jersey 10 (bundled, OFL). In Pixelify Sans "5" and "S" look the same.
- Pause keeps the chosen speed (Space resumes at 2×/3×).

## TODO (in priority order)

1. Review and merge PR #4, then play it on a real iPhone (Safari) and Android phone (Chrome).
   Emulation is not Safari.
2. PWA: `manifest.webmanifest`, a service worker for offline play, 192/512 px PNG icons (from the
   castle sprite), standalone display. The cheapest step toward a native app.
3. Pinch-zoom (wheel/trackpad zoom on desktop): needs a zoom factor in `Renderer` (screenToWorld,
   camera clamp, static layer drawing) and two-pointer handling in `UI`.
4. Balancing:
   - Iron is produced but no building uses it yet.
   - A new house adds 5 mouths at once (+5 food/day), before anyone works there.
   - Start: 40 food against 10 eaten per day = 4 days; the orchard needs 5 days to grow.
   - The warehouse is free.
5. Missing basics: demolish/move buildings (`BuildingManager.remove` exists, no UI), manual worker
   assignment, sound and music, haptics (`navigator.vibrate`) on phones.
6. Bigger direction, decide with the owner (Stronghold / Thronefall style): night raids and
   defense, walls and towers, roads, building upgrades.
7. CI: run `tests/run-all.sh` in GitHub Actions on pull requests.
8. Native app (later): wrap with Capacitor; test with `mobile-mcp` (simulators, devices) or the
   BrowserStack connector (real devices).

## Known issues and gotchas

- Opening `index.html` via `file://` in Chrome blocks the font (monospace fallback). Serve over http.
- The MCP servers in `.mcp.json` must be approved by the owner once. Pre-approving them in
  `.claude/settings.json` is blocked for Claude; don't retry.
- Force-pushing this branch is blocked. Integrate with normal (fast-forward) pushes.
- Headless Chromium renders in software, so its frame times are not phone numbers.
- Tests: Playwright won't tap `aria-disabled` cards, so tests use `{ force: true }` (real users can
  tap them to see what is missing). A synthetic tap right after a fast synthetic drag may not
  produce a click (fling), so tests wait ~400 ms first.
