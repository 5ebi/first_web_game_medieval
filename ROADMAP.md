# Roadmap and status

_Last updated: 2026-11-13_

## Where things stand

- `main` is the original game. GitHub Pages deploys `main` (`.github/workflows/deploy.yml`).
- Branch `claude/medieval-castle-game-FPCZC` → **PR #4 (draft), not merged yet.** It contains:
  autosave, the background-tab fix and render-on-change, the mobile-first HUD, placement feedback
  with the touch flow, daily-loop feedback, the MCP testing setup and the browser tests.
- Branch `claude/dazzling-pascal-kjxuwg` builds on it: this roadmap, then the "Now" block below.
- `sh tests/run-all.sh` runs every browser test (53 checks plus screenshots on 4 devices). All green.

## Product direction

- Medieval builder game, mobile first. If playtesting is fun it becomes a native app (not planned
  yet). Keep vanilla JS + canvas without a build step, so wrapping it (PWA, later e.g. Capacitor)
  stays easy.
- The owner writes in (Swiss) German: reply in German. Code, UI text, commits and docs stay English.
- Proposed (not decided yet): the Thronefall formula. Build by day, defend at night, runs of
  10 to 15 minutes with a score. It fits phones, a small scope and the Stronghold wish.

## Playtest 2026-11-13 (15 minutes, phone view, to day 27)

The tech and controls are solid, the game itself is missing: everything is seen after about 90
seconds, after that there is no decision left, only waiting.

- Minute 0–1: every building type except House and Iron Mine was already built.
- Minute 1–4: wood at 0. One day is 60 s, a Lumberjack gives 6 wood, so about 2 minutes of waiting
  per House with nothing to do. The player switches to 3× at once.
- Day 3–6: the first House adds 5 mouths at once (food −11/day, "2d" in red). The only tense
  moment of the whole session, and the best one.
- Day 7–22: solved. A script with three rules (food low → Orchard, no free workers → House,
  otherwise production) grew the village to 53 buildings and 65 villagers. If a three-rule bot
  plays optimally, there are no interesting decisions. **This is the core problem.**
- Day 23–27: 10 Houses at once → game over after 3 starving days, the save is deleted. At that
  moment there were 241 wood, 50 idle villagers and six Orchards about to produce.

What works: placement feedback (reason text, visible range), the HUD (rate per day, food runway
"6d"), the pixel style and font, save/Continue, no console errors.

What is missing:

1. No goal: no win, no tasks, no score, no "2 more houses until…".
2. No threat: iron is useless (156 piled up), stone nearly. Hunger is the only danger and is solved
   by "more Orchards".
3. The world is dead: no villagers, no movement, no smoke, no sound. Numbers float up once a minute.
4. Position does not matter beyond the 5-tile radius. Water, the map and neighbours do nothing.
5. No depth: no upgrades, no production chains, no unlocks. All 8 buildings are there from second 1.
6. Failing is only punishment: no demolish, no way to react, no end statistics, save gone.
7. Small things: the same message appears three times (toast, tooltip, bar); six identical
   "Apple Orchard is now producing!" toasts in a row; the info panel covers half the phone map and
   offers no action; the Warehouse is free and storage never mattered.

## Reference games (use them for ideas)

| Game | What it does right | What to take |
|---|---|---|
| **Civilization** | While placing a district or city, every tile shows its yield and is tinted from red (poor) to green (great); adjacency bonuses are spelled out before you commit. | **The owner's reference for placement feedback.** Show the yield of a spot while the ghost moves, colour the map red to green for the selected building, list the bonuses that make up the number. |
| **Stronghold** | Visible chains (wheat → mill → bakery), people carry goods. Popularity as a lever (taxes, rations). Sieges give stone and iron a purpose. Missions with goals. | Chains, villagers, trade-offs, enemies, missions. |
| **Thronefall** | Build by day, defend at night. Few but weighty decisions. 10–15 minutes per run, score, perks. | The rhythm of tension and rest, an end to a run. |
| **Clash Royale** | 3-minute matches. Elixir forces a decision every few seconds. Collecting and upgrading cards, trophies, strong feedback on every action. | Decision density, progress across runs, juice. **Not** the timers, loot boxes and loss-aversion tricks. |
| **Islanders / Dorfromantik** | Every placement scores points depending on its neighbours. No combat, ideal on phones. | Placement as a puzzle. |

Why they work (check new features against these):

- **Competence:** I get better and the game shows it (score, stars, rank). We have no yardstick yet.
- **Meaningful choice:** either-or instead of both. Today the player simply builds everything.
- **Goals on three time scales:** seconds (tap, feedback), minutes (next building, next night),
  days (unlocks, best score). Today only the middle one exists, and it is waiting.
- **Open loops and varying rewards:** "one more night until the tower" pulls players back; events
  keep it fresh.

## Decisions (keep them unless there is a reason)

- Buildings are placed freely (world pixels, no tile grid) wherever there is room. Terrain stays a
  tile grid. _(Being implemented, see "Now".)_
- Touch: tapping a card drops a ghost on the nearest free spot, tap/drag moves it, **Build** confirms.
  Mouse: the ghost follows the cursor, a click places.
- Buildings can't stand on forest or rock tiles. Producers need their resource within
  `RESOURCE_RADIUS` (5) tiles. The map's center clearing has no unbuildable tiles.
- Placement feedback follows Civilization: yield preview and a red-to-green map tint while placing.
- Time does not pass while the page is hidden (no offline progress, starvation would punish).
  The frame delta is clamped (`MAX_FRAME_MS`).
- Rendering is on demand. The static layer (terrain, trees, rocks) is cached per map; anything that
  animates must keep the renderer dirty (`Renderer.markDirty()`; floaters do this).
- Save: `localStorage` key `lordsOfTheKeep.save`. Population, workers and storage are
  recalculated on load. Changing the format → bump the version and migrate old saves.
- Font: Jersey 10 (bundled, OFL). In Pixelify Sans "5" and "S" look the same.
- Pause keeps the chosen speed (Space resumes at 2×/3×).

## Now (ordered by the owner, 2026-11-13)

1. **Free placement**: buildings sit at pixel positions instead of tiles; save version 2 with
   migration. _In progress._
2. **Balancing**: a House fills up over days instead of at once (capacity vs. real population);
   the start gets more food buffer. _In progress._
3. **Reward placement** _(after 1)_:
   - Lumberjack yield depends on the number of trees in its radius; trees get fewer as they are
     cut (and need a way back, e.g. regrowth or a forester).
   - Neighbour bonuses, e.g. House near a well, and others in the Islanders spirit.
   - Civilization-style display while placing: the ghost shows the yield it would get at that
     spot with the bonuses listed, and the map is tinted from red to green for that building.

## Next (by effect per effort)

1. **Goal chain with unlocks** (small): "build 2 Lumberjacks → unlocks House → reach 20
   villagers → …". Gives direction, replaces the tutorial, stretches the content.
2. **Life and juice** (medium): villagers walk between home and work, smoke, chopping animation,
   sounds, haptics (`navigator.vibrate`) on build. Resources trickle in continuously instead of
   once a minute.
3. **Threat in the Thronefall rhythm** (large, the real lever; decide with the owner): a raid
   every few nights. Iron becomes weapons and towers, stone becomes walls. Both resources get a
   purpose and position matters.
4. **Fair failing and an end to a run** (small): villagers leave step by step instead of an
   instant game over; demolish/move buildings (`BuildingManager.remove` exists, no UI); an end
   screen with days, villagers and best score; don't delete the save.
5. **More balancing** (small): the Warehouse costs something; storage should matter.
6. **Depth** (medium to large): production chains (wheat → mill → bakery), building upgrades,
   roads, manual worker assignment, popularity levers (taxes, rations).
7. **Progress across runs**: score per run, map seeds, a daily challenge seed, unlockable perks.
8. **Polish from the playtest**: show a placement reason once, not three times; merge identical
   toasts ("6 Orchards are now producing"); a smaller info panel on phones, with actions.

## Platform and infrastructure

1. Review and merge PR #4, then play on a real iPhone (Safari) and Android phone (Chrome).
   Emulation is not Safari.
2. PWA: `manifest.webmanifest`, a service worker for offline play, 192/512 px PNG icons (from the
   castle sprite), standalone display. The cheapest step toward a native app.
3. Pinch-zoom (wheel/trackpad zoom on desktop): needs a zoom factor in `Renderer` (screenToWorld,
   camera clamp, static layer drawing) and two-pointer handling in `UI`.
4. CI: run `tests/run-all.sh` in GitHub Actions on pull requests.
5. Native app (later): wrap with Capacitor; test with `mobile-mcp` (simulators, devices) or the
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
- Several worktrees testing at once need their own port: `PORT=8131 sh tests/run-all.sh`.
- The Playwright MCP `browser_evaluate` call times out after 60 s; wait in shorter steps.
