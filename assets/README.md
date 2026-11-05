# Eigene Grafiken / Custom art

Das Spiel zeichnet alles prozedural. Jede PNG-Datei, die du hier ablegst, **ersetzt** die eingebaute Grafik.
Fehlt eine Datei, wird automatisch die eingebaute Version benutzt. Du kannst also mit einer einzigen Datei anfangen.

The game draws everything procedurally. Any PNG you put here **replaces** the built-in art; missing files fall back automatically.

## Schnellstart

1. Öffne `templates/` – dort liegt jede aktuelle Grafik als PNG in exakt der richtigen Größe.
2. Kopiere die Datei, die du ändern willst, eine Ebene höher (z. B. `templates/tiles.png` → `assets/tiles.png`).
3. Übermale sie in einem Pixel-Editor. Größe nicht ändern (Ausnahme: Gebäude, siehe unten).
4. Trag den Dateinamen in `manifest.json` ein, z. B. `["tiles.png"]`.
5. Spiel neu laden.

Kostenlose Pixel-Editoren: **Piskel** (piskelapp.com, im Browser), **Lospec Pixel Editor** (im Browser),
**LibreSprite** oder **Aseprite** (Desktop).

## Dateien

| Datei | Größe | Inhalt |
|---|---|---|
| `tiles.png` | 128 × 256 | Bodenkacheln, 32 × 32 pro Feld, siehe `templates/tiles_guide.png` |
| `buildings/<typ>.png` | siehe Tabelle | ein Gebäude |
| `nature/tree_oak.png` | 32 × 48 | Laubbaum |
| `nature/tree_pine.png` | 32 × 56 | Nadelbaum |
| `nature/stone_pile.png` | 32 × 24 | Steinhaufen auf Steinvorkommen |
| `icons/<name>.png` | 32 × 32 | Symbole oben: wood, stone, iron, food, pop, day, storage |

### `tiles.png` – Bodenkacheln

8 Zeilen × 4 Spalten, jede Zelle 32 × 32 Pixel. Die 4 Spalten sind Varianten derselben Kachel;
das Spiel mischt sie, damit der Boden nicht gekachelt aussieht. Mach die Ränder jeder Kachel nahtlos.

| Zeile | Gelände |
|---|---|
| 1 | Gras |
| 2 | dunkles Gras |
| 3 | Wasser |
| 4 | Sand |
| 5 | Erde |
| 6 | Waldboden (Bäume werden darüber gezeichnet) |
| 7 | Steinvorkommen (Steinhaufen werden darüber gezeichnet) |
| 8 | Blumenwiese (Blumen werden darüber gezeichnet) |

Hast du weniger als 4 Spalten, werden die vorhandenen wiederholt.

### Gebäude

| Datei | Grundfläche | Standardgröße |
|---|---|---|
| `castle.png` | 4 × 4 Felder | 128 × 128 |
| `warehouse.png` | 3 × 2 | 96 × 64 |
| `house.png` | 2 × 2 | 64 × 64 |
| `tavern.png` | 2 × 2 | 64 × 64 |
| `lumberjack.png` | 2 × 2 | 64 × 64 |
| `hunter.png` | 2 × 2 | 64 × 64 |
| `quarry.png` | 2 × 2 | 64 × 64 |
| `iron_mine.png` | 2 × 2 | 64 × 64 |
| `blacksmith.png` | 2 × 2 | 64 × 64 |

Gebäude werden **unten mittig** auf ihre Grundfläche gesetzt. Du darfst sie also höher machen
(z. B. ein Turm mit 64 × 96), dann ragen sie nach oben über ihr Feld hinaus, wie in vielen Aufbauspielen.
Transparente Bereiche bleiben durchsichtig, der Schatten wird automatisch aus der Silhouette berechnet.

## `manifest.json`

Listet, welche Dateien geladen werden sollen:

```json
["tiles.png", "buildings/house.png", "icons/wood.png"]
```

Ohne Manifest probiert das Spiel jede mögliche Datei aus. Das funktioniert auch, erzeugt aber
viele 404-Meldungen in der Browser-Konsole.

## Lokal testen

Für `manifest.json` muss das Spiel über einen kleinen Webserver laufen, nicht per Doppelklick:

```bash
python3 -m http.server 8000
```

Dann http://localhost:8000 öffnen. Per Doppelklick (`file://`) wird das Manifest ignoriert und jede Datei probiert.

## Tipps für einen stimmigen Look

- Bleib bei **echten Pixeln** im 1-Pixel-Raster: kein Weichzeichnen, kein Antialiasing, keine Verläufe. Das Spiel zeichnet alles mit 1 Pixel pro Spielpixel.
- Eine **feste Palette** von 16 bis 32 Farben hält alles zusammen. Gute fertige Paletten gibt es auf lospec.com/palette-list (z. B. „Endesga 32“ oder „Resurrect 64“).
- **Licht kommt von oben links**: helle Kante oben/links, dunkle Kante unten/rechts.
- Gras eher **ruhig und wenig kontrastreich**, damit Gebäude und Bewohner sich abheben.
