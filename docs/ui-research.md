# UI research: Stronghold-style command panel

Notes behind the November 2026 UI rework. We take *layout and interaction
patterns* from the Stronghold series as inspiration. We don't copy its art,
icons or text: all graphics in this game stay procedural and our own.

## Sources

- Stronghold 4 official site, screenshots and feature text: https://www.stronghold4.com/
- Stronghold 4 on Steam: https://store.steampowered.com/app/2153760/Stronghold_4/
- Firefly news, "Castle Customization & Economy" (2026-10-08):
  https://fireflyworlds.com/2026/10/08/stronghold-4-castle-customization-economy-release-date-new-demo-out-now/
- GameStar preview (2026-06-07): "Wer die Klassiker kennt, wird sich schon beim User
  Interface gleich zurechtfinden": https://www.gamestar.de/artikel/stronghold-4-angespielt-preview-steam,3454071.html
- Classic Stronghold interface guide (six building categories along the bottom,
  clicking one shows its buildings in the panel):
  https://www.alteredgamer.com/stronghold/8099-how-to-play-understanding-the-game-interface
- Stronghold Definitive Edition manual (bottom bar: population, scribe's report,
  goods, objectives, building categories, options, delete, undo, minimap):
  https://www.scribd.com/document/689769748/Stronghold-Manual

None of the official Stronghold 4 screenshots show the HUD (all are clean
beauty shots). Previews say the interface follows the classics. So the
reference is the classic Stronghold layout.

## Patterns we adopted

| Stronghold pattern | Our version |
|---|---|
| One framed panel along the bottom edge holds the whole interface | `#command-panel`: carved wood frame, stone battlement trim, parchment inside |
| Building categories are always visible; one click swaps the buildings shown | Category tabs (Castle, Industry, Food, Town, Crafts) above the parchment; one click |
| Buildings appear as pictures in the panel | Cards with the building sprite, cost (red when missing), workers and output |
| Clicking a building replaces the panel content with its info (workers, state, actions) | Info "scroll" in the same spot: portrait, description, workers, status, delivery progress bar, demolish |
| Stockpile / granary panel lists goods with amounts | Warehouse and keep show every good with amount / capacity, a fill bar and the net rate |
| Minimap in the panel | Minimap on the left of the panel |
| Scribe / objectives | "Next goal" plaque on the right |
| Clicking a peasant tells you who they are | Villager info: name, trade, activity, load, workplace (link) |

## Phones

- Portrait: tabs at the bottom (thumb reach), building strip above them. Tapping
  the open tab folds the strip so the map gets the space. Choosing a building
  folds it too.
- Landscape: a slim desktop-style bar without minimap and goal column.
