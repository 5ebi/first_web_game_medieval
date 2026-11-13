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
