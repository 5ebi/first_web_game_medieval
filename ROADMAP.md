# Roadmap and status

_Last updated: 2026-11-06_

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
- Only buildings with workers produce, in batches. The lumberjack is always free.
- Working villagers eat 0.5 meat/min; 60 s without meat → game over.
- Quarry must stand at least half on a stone field; lumberjack/hunter need forest,
  iron mine needs stone nearby.
- Villagers are cosmetic (they don't carry the economy), but they must look plausible.
- Music and sound are synthesized; no database. Saves live in `localStorage`. A DB
  only becomes relevant for accounts, cloud saves or leaderboards.

## Backlog (rough priority)

1. Merge PR #5, then playtest on a real iPhone (Safari) and Android (Chrome).
2. PWA: manifest, service worker for offline play, icons.
3. Balancing: iron has few uses; new houses add mouths before workers; winter food.
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
