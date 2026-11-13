# Roadmap and status

_Last updated: 2026-11-13_

## Where things stand

- `main` is live on GitHub Pages: seasons with winter, Stronghold-like economy,
  weather and atmosphere, construction animation, German/English, phone build sheet.
- **PR #5 (`claude/stronghold-ui`, draft)**: bottom command panel with always-visible
  category tabs, info scroll for buildings and villagers (warehouse shows the stock),
  sun shadows, swaying trees, new ground types and hills, rain anchored to the
  world, villagers with real work routes and a new walk cycle, quieter rain, new
  procedural music. It rewrites the build menu, info panel and much of `ui.js`/`style.css`.
  **Merge it before starting UI work**, or base UI tasks on it.
- PR #4 (`claude/medieval-castle-game-FPCZC`) is an older line (autosave, touch flow,
  test suite) that `main` has overtaken. Pick ideas from it, don't merge it as is.

## Product direction

- Medieval builder, mobile first; if playtesting is fun it becomes a native app
  (PWA, later Capacitor). Stay vanilla JS + canvas without a build step.
- Look and feel: Stronghold (incl. Stronghold 4, Dec 2026) as the main reference for
  UI layout and economy feel; stays 2D pixel art.
- Placement feedback: **Civilization** is the owner's reference. While placing, the map
  shows from red to green how good each spot is for that building, and the yield with
  its bonuses is spelled out before you commit.
- Proposed, not decided: the Thronefall formula (build by day, defend at night, runs
  with a score). It fits phones, a small scope and the soldiers that already exist.

## Playtest 2026-11-13

Played on a phone viewport: about 5 minutes in real time at 3x (to day 3), then 48 more
game minutes simulated (to day 11). An earlier 15-minute session the same day ran on
the stale PR #4 line by mistake; only findings that also hold on `main` are listed.

What works: the village feels alive (villagers, smoke, seasons, weather, music), the
"Next goal" strip gives direction, rates per minute are always visible, the info panel
has actions (demolish), no console errors.

What is missing:

1. **No interesting decisions.** A script with a fixed build order plus four rules (no
   free workers -> house, meat net low -> hunter, otherwise the next producer, recruit
   when possible) had 12 of 14 goals after 4.5 real minutes, all 14 by day 9, and by
   day 11 stood at 120 villagers with wood, stone, iron and meat all at the 400 cap.
   If a bot with four rules plays optimally, the player has nothing to weigh up.
2. **No threat.** Soldiers have no enemy; 12 archers stand next to the castle. Iron and
   weapons pile up to their caps. Winter did not bite once (meat stayed near 400).
3. **Position does not matter.** Beyond "forest within 5 tiles" and "half on stone" every
   spot is as good as any other. Trees never run out. Neighbours do nothing.
4. **Nothing after goal 14.** No score, no end of a run, no reason to continue.
5. **No depth yet:** no upgrades, no production chains, no trade-offs (everything can be
   built, nothing excludes anything).
6. **Failing is only punishment:** game over after 60 s without meat deletes the save,
   without an end screen that shows what was achieved.
7. **Bug seen:** "Storage full: meat is going to waste" appeared with about 30 of 400
   meat. Likely cause: meat is fractional, so `gained < p.amount` in `Game.simulate`
   is true by rounding (28.3 + 4 - 28.3 < 4).

## Reference games (use them for ideas)

| Game | What it does right | What to take |
|---|---|---|
| **Civilization** | While placing a district, every tile shows its yield, tinted from poor to great; adjacency bonuses are listed before you commit. | Placement feedback (see "Now"). |
| **Stronghold** | Visible chains (wheat -> mill -> bakery), people carry goods. Popularity as a lever (taxes, rations). Sieges give stone and iron a purpose. Missions with goals. | Chains, trade-offs, enemies, missions. |
| **Thronefall** | Build by day, defend at night. Few but weighty decisions. 10-15 minutes per run, score, perks. | The rhythm of tension and rest, an end to a run. |
| **Clash Royale** | 3-minute matches. Elixir forces a decision every few seconds. Collecting and upgrading, trophies, strong feedback on every action. | Decision density, progress across runs, juice. **Not** the timers, loot boxes and loss-aversion tricks. |
| **Islanders / Dorfromantik** | Every placement scores points depending on its neighbours. No combat, ideal on phones. | Placement as a puzzle. |

Why they work (check new features against these):

- **Competence:** I get better and the game shows it (score, stars, rank). We have 14
  goals, then no yardstick.
- **Meaningful choice:** either-or instead of both. Today the player simply builds
  everything.
- **Goals on three time scales:** seconds (tap, feedback), minutes (next building, next
  night), days (unlocks, best score). The last one is missing.
- **Open loops and varying rewards:** "one more night until the tower" pulls players
  back; events keep it fresh.

## Decisions (keep them unless there is a reason)

- Time only starts when castle **and** first warehouse stand. A day lasts 6 minutes at
  1×, a season one day, a year 4 days.
- Only buildings with workers produce, in batches. The lumberjack costs
  10 wood; it is free only when none stands and the player can't pay for one.
- Working villagers eat 0.5 meat/min; 60 s without meat → game over.
- Quarry must stand at least half on a stone field; lumberjack/hunter need forest,
  iron mine needs stone nearby.
- Villagers are cosmetic (they don't carry the economy), but they must look plausible.
- The blacksmith (+25% tools bonus) is gone. Iron now goes into weapons: the **weapon
  smith** forges bows (wood) or swords (iron), chosen in its info panel; the **barracks**
  turns a free villager plus a weapon into an archer or swordsman. Soldiers count as
  working villagers (they eat). Weapons are data-driven (`WEAPONS` in `constants.js`).
- Military has no enemies yet. Soldiers can be selected Stronghold style and sent
  somewhere or put on patrol (#16); paths are A* on tiles around water and buildings.
  Desktop: left-drag box-selects once you own soldiers, right/middle-drag pans, right-click
  moves, P patrol, L stop. Phones: tap selects, tap on the map moves, long press + drag
  draws a box, one-finger drag always pans. Raids and combat later.
- **Free placement** (#31): a building stands at any whole-pixel world position, not on
  the 32 px grid; terrain stays a tile grid. A spot is valid when no tile under the footprint
  is water/sand (off-map counts as water), at least half of a quarry's *area* is on stone,
  the resource for producers is within 5 tiles of any tile it touches, and it overlaps no
  other building (touching is fine). Trees/stones/flowers are cleared on tiles whose centre
  is under the footprint. Soldiers' A* treats a tile as blocked when a footprint covers any
  part of it. `pixelX`/`pixelY` are the only position (no `tileX`/`tileY`).
- **Yields depend on the spot** (#32): one function, `Game.getYield(type, x, y)`, gives the
  yield and its parts for the simulation, the top-bar rates, the winter forecast, the ghost and
  the info panel (numbers in `YIELD`, `constants.js`). Lumberjack: standing trees within
  `RESOURCE_RADIUS` (5 tiles), factor trees/60 up to ×1.25, no floor; every delivery fells the
  2 nearest trees, which regrow over 2 days (stump, sapling, tree). Hunter: forest tiles in range
  (×0.5 to ×1.25). Iron mine: stone tiles in range (×0.4 to ×1.25). Quarry: 0.25 + share of the
  footprint on stone (×0.75 to ×1.25). What a footprint clears on placement is not counted, so the
  ghost's number is what the building then produces. **Well** (1×1, 5 wood + 10 stone): houses
  within 4 tiles of its centre hold +2, taverns +3; wells don't stack; `populationCap` is
  recomputed from the buildings. While placing, the map is tinted red -> yellow -> green per tile
  (brightness rises too, for colour blindness; spots that gain nothing from a well stay untinted),
  cached until buildings or trees change. Saves store felled trees as `trees: [[id, growth]]`
  (same save version; saves without it load with every tree standing).
- Save format v5 (same `SAVE_KEY`): buildings store `x`/`y` in pixels; v4 tile positions
  are migrated (× `TILE_SIZE`), v3 saves are migrated too (a blacksmith is dropped and its
  cost refunded).
- Every reply to the owner and every PR body ends with a test link: live
  `https://5ebi.github.io/first_web_game_medieval/`, or for an unmerged branch
  `https://raw.githack.com/5ebi/first_web_game_medieval/<branch>/index.html`
  (githack caches; a fresh push can take a few minutes to appear).
- Music is licensed recordings (Epidemic Sound, `assets/music/`, see its README): a
  shuffled playlist with 5-15 s pauses, loaded one track at a time after the first
  tap, routed through `musicGain`. The procedural music is only the fallback when a
  track can't load. SFX and ambience stay synthesized. No database: saves live in
  `localStorage`; a DB only becomes relevant for accounts, cloud saves or leaderboards.

## Now (ordered by the owner on 2026-11-13; tracked as issues labelled `task`)

1. **Free placement:** buildings sit wherever there is room, not on the tile grid.
   Terrain stays a tile grid.
2. **Reward placement** (#32, PR open): lumberjack yield depends on the trees in its radius
   and trees get fewer; neighbour bonuses (house near a well); Civilization-style
   display while placing (red-to-green map tint, yield and bonuses at the ghost).
3. **Open question for the owner:** "houses fill over days, more buffer at the start"
   came from the stale build. On `main` only working villagers eat, so a new house costs
   no meat, and the start never ran short in the playtest. Villagers moving in over
   time could still be worth it for pacing.

## Ideas from the playtest (by effect per effort)

1. **Threat in the Thronefall rhythm** (large, the real lever; decide with the owner):
   a raid every few nights. Soldiers, weapons, iron and stone (walls, towers) get a
   purpose and position matters.
2. **An end to a run and a score** (small to medium): end screen with days, villagers,
   goals and best score; keep the save; villagers leave step by step instead of an
   instant game over.
3. **More goals with unlocks** (small): continue past goal 14; unlock buildings through
   goals instead of offering everything at once.
4. **Either-or choices** (medium): building upgrades, popularity levers (taxes,
   rations), limited space near resources once yields depend on position.
5. **Depth** (medium to large): production chains (wheat -> mill -> bakery), roads.
6. **Progress across runs:** map seeds, a daily challenge seed, unlockable perks.
7. **Balancing:** caps were reached for every resource by day 7; winter should bite.

## Backlog (rough priority)

1. Merge PR #5, then playtest on a real iPhone (Safari) and Android (Chrome).
2. PWA: manifest, service worker for offline play, icons.
3. Balancing: weapon costs / cycle times; new houses add mouths before workers; winter food.
4. Missing basics: move buildings, manual worker assignment, roads, haptics on phones.
5. Bigger direction (decide with the owner): night raids and defence, walls and
   towers, building upgrades, popularity / taxes like Stronghold.
6. CI: run `tests/run-all.sh` in GitHub Actions on pull requests.

Open work is tracked as GitHub issues labelled `task` (created by the planner).

## Known issues and gotchas

- Force-pushing is blocked for Claude. Integrate with normal pushes; start a new
  branch when a branch name is taken by old history.
- Headless Chromium renders in software: frame times there are not phone numbers.
- Emulated iPhone is not Safari. Test real devices before calling a UI change done.
- Playwright won't tap `aria-disabled` cards: use `{ force: true }` in tests.
