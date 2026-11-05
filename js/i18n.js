// ============================================
// Internationalisation - English & German
// Usage: t('key', { n: 3 })  ->  "{n}" placeholders are replaced
// ============================================

const I18N = {
    en: {
        // --- generic / resources ---
        'res.wood': 'wood', 'res.stone': 'stone', 'res.iron': 'iron', 'res.food': 'food',
        'res.Wood': 'Wood', 'res.Stone': 'Stone', 'res.Iron': 'Iron', 'res.Food': 'Food',
        'res.storage.title': 'Storage capacity per resource. Build a Warehouse to increase it.',
        'res.storage.value': '{name}: {v} / {max} storage',
        'res.pop.title': '{used} villagers working of {cap} housed. Free: {free}. Workers eat 1 food/day.',
        'res.pop.short': 'Villagers working / housed',
        'res.day': 'Day {n}',
        'res.day.title': 'Current day',
        'free': 'Free',
        'day': 'day', 'days': 'days',

        // --- top bar ---
        'speed.pause': 'Pause (Space)', 'speed.1': 'Normal speed (1)', 'speed.2': 'Fast (2)', 'speed.3': 'Very fast (3)',
        'zoom.in': 'Zoom in (+)', 'zoom.out': 'Zoom out (-)',
        'btn.mute': 'Mute (M)', 'btn.unmute': 'Unmute (M)', 'btn.settings': 'Settings (O)', 'btn.help': 'Help (H)',
        'btn.new': 'New', 'btn.new.title': 'Start a new game',
        'pause.title': 'PAUSED', 'pause.sub': 'press Space to continue',

        // --- menu ---
        'menu.buildings': 'Buildings',
        'menu.goal': 'Next goal',
        'menu.goal.done': 'All goals achieved. Long live the Lord!',
        'menu.minimap': 'Click to move the camera',
        'menu.worker': '{n} worker', 'menu.workers': '{n} workers',
        'menu.villagers': '+{n} villagers', 'menu.storage': '+{n} storage', 'menu.bonus': '+{n}% production',
        'menu.prod': '+{n} {res}/day', 'menu.after': 'after {n}d',

        // --- tooltip ---
        'tt.size': 'Size', 'tt.tiles': '{w}×{h} tiles', 'tt.cost': 'Cost', 'tt.workers': 'Workers',
        'tt.eats': '{n} (each eats 1 food/day)', 'tt.needs': 'Needs',
        'tt.forest': 'forest nearby', 'tt.stone': 'stone deposit nearby', 'tt.hotkey': 'Hotkey: {k}',

        // --- info panel ---
        'info.workers': 'Workers', 'info.production': 'Production', 'info.status': 'Status',
        'info.active': 'Active', 'info.noworkers': 'No workers', 'info.growing': 'Growing ({a}/{b} days)',
        'info.bonus.inline': '(+{n} bonus)', 'info.housing': 'Housing', 'info.storage': 'Storage',
        'info.bonus': 'Bonus', 'info.bonus.value': '+{n}% wood, stone, iron',
        'info.built': 'Built on', 'info.day': 'Day {n}',
        'info.demolish': 'Demolish', 'info.demolish.refund': 'Demolish ({r})', 'info.demolish.title': 'Delete key',
        'info.close': 'Close (Esc)',

        // --- canvas ---
        'cv.noworkers': 'No workers', 'cv.growing': 'growing', 'cv.click': 'Click to build {name}',

        // --- game messages ---
        'g.notavailable': 'Not available',
        'g.unknown': 'Unknown building',
        'g.alreadybuilt': 'Already built',
        'g.limit': 'Limit of {n} reached',
        'g.castlefirst': 'Place your Castle first',
        'g.needmore': 'Need {list} more',
        'g.needworkers': 'Needs {n} free villagers (have {have}). Build a House.',
        'g.water': 'Cannot build on water or sand',
        'g.occupied': 'Space is occupied',
        'g.nearforest': 'Must be near a forest',
        'g.nearstone': 'Must be near stone deposits',
        'g.built': '{name} built!',
        'g.castlenodemolish': 'The Castle cannot be demolished',
        'g.stillliving': 'Villagers still live here. Free {n} workers first.',
        'g.demolished': '{name} demolished',
        'g.demolished.refund': '{name} demolished ({r})',
        'g.storagefull': 'Storage full: {res} is going to waste. Build a Warehouse!',
        'g.producing': '{name} is now producing!',
        'g.fedagain': 'Your people are fed again.',
        'g.starving': 'Your people are starving! ({a}/{b} days)',
        'g.foodout': 'Food runs out in ~{n} {unit}! Build food production.',
        'g.start': 'Place your Castle to begin! The calendar starts once it stands.',
        'g.welcomeback': 'Welcome back, my Lord.',
        'g.confirmnew': 'Start a new game? Your current village will be lost.',
        'g.milestone': 'Milestone',

        // --- overlays ---
        'w.title': 'Lords of the Keep',
        'w.subtitle': 'A Medieval Castle Builder',
        'w.intro': 'You are the lord of a new settlement. Build your castle, gather resources, and grow your village.',
        'w.li1': 'Click a building in the menu, then click the map to place it',
        'w.li2': 'Drag to scroll, mouse wheel to zoom',
        'w.li3': 'Gather wood, stone and iron to build more',
        'w.li4': 'Keep your workers fed or they will leave!',
        'w.start': 'Begin Your Reign',
        'w.continue': 'Continue (Day {day}, {n} buildings)',
        'w.fine': 'Sound on for the full experience · press H in game for help',

        'go.title': 'Your People Have Starved!',
        'go.text': 'Your village ran out of food and your people have abandoned the settlement.',
        'go.days': 'Days ruled', 'go.built': 'Buildings raised', 'go.pop': 'Most villagers at work', 'go.ms': 'Milestones',
        'go.retry': 'Try Again',

        'h.title': 'How to Play',
        'h.basics': 'Basics', 'h.controls': 'Controls',
        'h.b1': 'Pick a building on the right, then click the map to place it.',
        'h.b2': 'Lumberjacks need a <b>forest</b>, quarries and mines need <b>stone deposits</b> within 5 tiles. The dashed box shows the search radius.',
        'h.b3': 'Every <b>working</b> villager eats 1 food per day. Idle villagers feed themselves.',
        'h.b4': 'Three days without food and your people leave. Game over.',
        'h.b5': 'Resources are capped by storage. Build the <b>Warehouse</b> early.',
        'h.b6': 'Click a placed building for details or to demolish it (50% refund).',
        'h.b7': 'Your progress is saved automatically.',
        'h.c1': '<kbd>Drag</kbd> move the map',
        'h.c2': '<kbd>Wheel</kbd> <kbd>+</kbd> <kbd>-</kbd> zoom',
        'h.c3': '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>Arrows</kbd> scroll the map',
        'h.c4': '<kbd>Space</kbd> pause / resume',
        'h.c5': '<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> game speed',
        'h.c6': '<kbd>Esc</kbd> / <kbd>Right click</kbd> cancel',
        'h.c7': '<kbd>Q</kbd> <kbd>E</kbd> <kbd>R</kbd> … building hotkeys (shown in the menu)',
        'h.c8': '<kbd>Del</kbd> demolish selected building',
        'h.c9': '<kbd>C</kbd> center on the Castle',
        'h.c10': '<kbd>M</kbd> mute &nbsp; <kbd>O</kbd> settings &nbsp; <kbd>H</kbd> this help',

        's.title': 'Settings',
        's.language': 'Language',
        's.music': 'Music',
        's.sfx': 'Sound effects',
        's.on': 'On', 's.off': 'Off',
        's.close': 'Close',
        's.help': 'Show help',
        's.newgame': 'New game',
        's.fx': 'Weather & atmosphere',
        'season.spring': 'Spring', 'season.summer': 'Summer', 'season.autumn': 'Autumn', 'season.winter': 'Winter',
        'season.tip': '{name}, year {year} · {left} days left · winter in {winter} days',
        'season.tip.winter': 'Winter, year {year} · {left} days left · fields and orchards rest',
        'season.start.spring': 'Fields and orchards grow again.',
        'season.start.summer': 'Fields and orchards yield 25% more.',
        'season.start.autumn': 'Harvest time: fields and orchards +50%. Stock up for winter!',
        'season.start.winter': 'Fields and orchards rest, chickens lay less.',
        'season.warn': 'Winter comes in {n} days! Store about {food} food.',
        'season.warn.ok': 'Winter comes in {n} days. Your stores should last.',
        'season.warn.storage': 'Winter comes in {n} days! You need about {food} food but can only store {max}. Build another warehouse or more food buildings.',
        'season.rest': 'resting',
        'info.season': 'Season',
        'tt.winter': 'In winter',
        'weather.snow': 'Snow',
        'weather.snow.start': 'Snow begins to fall.',
        'h.b8': '<b>Seasons</b>: summer and autumn bring richer harvests; in winter fields and orchards rest. Stock up on food in autumn!',
        'pl.placing': 'Placing: {name}',
        'pl.hint.mouse': 'Right-click or Esc to cancel',
        'pl.hint.touch': 'Tap the map, then tap again to build',
        'pl.cancel': 'Cancel',
        'cv.tap': 'Tap again to build {name}',
        'weather.clear': 'Clear', 'weather.cloudy': 'Cloudy', 'weather.rain': 'Rain', 'weather.fog': 'Fog',
        'weather.title': 'Day {n} · {w}',
        'weather.rain.start': 'Rain clouds are gathering.',
        'weather.fog.start': 'A thick fog rolls in.',
        'weather.clear.start': 'The sky clears up.',

        // --- buildings ---
        'bld.castle.name': 'Castle',
        'bld.castle.desc': 'Your seat of power. Houses 10 villagers; its servants gather 2 wood and 1 stone a day.',
        'bld.warehouse.name': 'Warehouse',
        'bld.warehouse.desc': 'Stores your resources. Increases storage by 300. The first one is free.',
        'bld.house.name': 'House',
        'bld.house.desc': 'Houses 5 villagers.',
        'bld.tavern.name': 'Tavern',
        'bld.tavern.desc': 'A warm place to rest. Houses 8 villagers.',
        'bld.lumberjack.name': 'Lumberjack',
        'bld.lumberjack.desc': 'Harvests wood from nearby trees. Trees are not removed.',
        'bld.quarry.name': 'Stone Quarry',
        'bld.quarry.desc': 'Extracts stone from nearby deposits.',
        'bld.iron_mine.name': 'Iron Mine',
        'bld.iron_mine.desc': 'Mines iron ore. Must be near stone deposits.',
        'bld.blacksmith.name': 'Blacksmith',
        'bld.blacksmith.desc': 'Forges better tools. All wood, stone and iron production +25%.',
        'bld.chicken_hut.name': 'Chicken Hut',
        'bld.chicken_hut.desc': 'Raises chickens for food. Produces 3 food/day right away.',
        'bld.apple_orchard.name': 'Apple Orchard',
        'bld.apple_orchard.desc': 'Grows apples. Produces 6 food/day once the trees have grown (6 days).',
        'bld.farm.name': 'Wheat Farm',
        'bld.farm.desc': 'A large field of wheat. Produces 10 food/day after the first harvest (4 days).',

        // --- milestones ---
        'ms.castle': 'Found your settlement: place the Castle',
        'ms.food': 'Secure food: build 2 food buildings',
        'ms.workers5': 'Put 5 villagers to work',
        'ms.day20': 'Survive 20 days',
        'ms.bld8': 'Build 8 buildings',
        'ms.iron20': 'Stockpile 20 iron',
        'ms.smith': 'Build a Blacksmith',
        'ms.pop20': 'Grow to 20 working villagers',
        'ms.day50': 'Rule for 50 days',
        'ms.food150': 'Store 150 food',
        'ms.bld20': 'Build 20 buildings',
        'ms.day100': 'A century of rule: reach day 100',
        'ms.winter1': 'Survive your first winter',
    },

    de: {
        'res.wood': 'Holz', 'res.stone': 'Stein', 'res.iron': 'Eisen', 'res.food': 'Nahrung',
        'res.Wood': 'Holz', 'res.Stone': 'Stein', 'res.Iron': 'Eisen', 'res.Food': 'Nahrung',
        'res.storage.title': 'Lagerkapazität pro Rohstoff. Baue ein Lagerhaus, um sie zu erhöhen.',
        'res.storage.value': '{name}: {v} / {max} Lager',
        'res.pop.title': '{used} Dorfbewohner arbeiten, {cap} haben ein Zuhause. Frei: {free}. Arbeiter essen 1 Nahrung/Tag.',
        'res.pop.short': 'Dorfbewohner arbeitend / untergebracht',
        'res.day': 'Tag {n}',
        'res.day.title': 'Aktueller Tag',
        'free': 'Kostenlos',
        'day': 'Tag', 'days': 'Tage',

        'speed.pause': 'Pause (Leertaste)', 'speed.1': 'Normale Geschwindigkeit (1)', 'speed.2': 'Schnell (2)', 'speed.3': 'Sehr schnell (3)',
        'zoom.in': 'Hineinzoomen (+)', 'zoom.out': 'Herauszoomen (-)',
        'btn.mute': 'Stumm (M)', 'btn.unmute': 'Ton an (M)', 'btn.settings': 'Einstellungen (O)', 'btn.help': 'Hilfe (H)',
        'btn.new': 'Neu', 'btn.new.title': 'Neues Spiel starten',
        'pause.title': 'PAUSE', 'pause.sub': 'Leertaste zum Fortsetzen',

        'menu.buildings': 'Gebäude',
        'menu.goal': 'Nächstes Ziel',
        'menu.goal.done': 'Alle Ziele erreicht. Lang lebe der Lord!',
        'menu.minimap': 'Klicken, um die Kamera zu bewegen',
        'menu.worker': '{n} Arbeiter', 'menu.workers': '{n} Arbeiter',
        'menu.villagers': '+{n} Bewohner', 'menu.storage': '+{n} Lager', 'menu.bonus': '+{n}% Produktion',
        'menu.prod': '+{n} {res}/Tag', 'menu.after': 'nach {n} T.',

        'tt.size': 'Größe', 'tt.tiles': '{w}×{h} Felder', 'tt.cost': 'Kosten', 'tt.workers': 'Arbeiter',
        'tt.eats': '{n} (jeder isst 1 Nahrung/Tag)', 'tt.needs': 'Benötigt',
        'tt.forest': 'Wald in der Nähe', 'tt.stone': 'Steinvorkommen in der Nähe', 'tt.hotkey': 'Taste: {k}',

        'info.workers': 'Arbeiter', 'info.production': 'Produktion', 'info.status': 'Status',
        'info.active': 'Aktiv', 'info.noworkers': 'Keine Arbeiter', 'info.growing': 'Wächst ({a}/{b} Tage)',
        'info.bonus.inline': '(+{n} Bonus)', 'info.housing': 'Wohnraum', 'info.storage': 'Lager',
        'info.bonus': 'Bonus', 'info.bonus.value': '+{n}% Holz, Stein, Eisen',
        'info.built': 'Gebaut am', 'info.day': 'Tag {n}',
        'info.demolish': 'Abreißen', 'info.demolish.refund': 'Abreißen ({r})', 'info.demolish.title': 'Entf-Taste',
        'info.close': 'Schließen (Esc)',

        'cv.noworkers': 'Keine Arbeiter', 'cv.growing': 'wächst', 'cv.click': 'Klicken: {name} bauen',

        'g.notavailable': 'Nicht verfügbar',
        'g.unknown': 'Unbekanntes Gebäude',
        'g.alreadybuilt': 'Bereits gebaut',
        'g.limit': 'Limit von {n} erreicht',
        'g.castlefirst': 'Platziere zuerst deine Burg',
        'g.needmore': 'Es fehlen {list}',
        'g.needworkers': 'Benötigt {n} freie Bewohner (vorhanden: {have}). Baue ein Haus.',
        'g.water': 'Auf Wasser oder Sand kann nicht gebaut werden',
        'g.occupied': 'Der Platz ist belegt',
        'g.nearforest': 'Muss in der Nähe eines Waldes stehen',
        'g.nearstone': 'Muss in der Nähe von Steinvorkommen stehen',
        'g.built': '{name} gebaut!',
        'g.castlenodemolish': 'Die Burg kann nicht abgerissen werden',
        'g.stillliving': 'Hier wohnen noch Bewohner. Entlasse zuerst {n} Arbeiter.',
        'g.demolished': '{name} abgerissen',
        'g.demolished.refund': '{name} abgerissen ({r})',
        'g.storagefull': 'Lager voll: {res} geht verloren. Baue ein Lagerhaus!',
        'g.producing': '{name} produziert jetzt!',
        'g.fedagain': 'Dein Volk ist wieder satt.',
        'g.starving': 'Dein Volk hungert! ({a}/{b} Tage)',
        'g.foodout': 'Die Nahrung reicht noch ~{n} {unit}! Baue Nahrungsproduktion.',
        'g.start': 'Platziere deine Burg, um zu beginnen! Der Kalender startet, sobald sie steht.',
        'g.welcomeback': 'Willkommen zurück, mein Lord.',
        'g.confirmnew': 'Neues Spiel starten? Dein aktuelles Dorf geht verloren.',
        'g.milestone': 'Meilenstein',

        'w.title': 'Lords of the Keep',
        'w.subtitle': 'Ein mittelalterlicher Burgbau',
        'w.intro': 'Du bist der Lord einer neuen Siedlung. Baue deine Burg, sammle Rohstoffe und lass dein Dorf wachsen.',
        'w.li1': 'Wähle ein Gebäude im Menü und klicke dann auf die Karte',
        'w.li2': 'Ziehen zum Scrollen, Mausrad zum Zoomen',
        'w.li3': 'Sammle Holz, Stein und Eisen, um mehr zu bauen',
        'w.li4': 'Halte deine Arbeiter satt, sonst ziehen sie fort!',
        'w.start': 'Herrschaft beginnen',
        'w.continue': 'Weiterspielen (Tag {day}, {n} Gebäude)',
        'w.fine': 'Ton an für das volle Erlebnis · H im Spiel öffnet die Hilfe',

        'go.title': 'Dein Volk ist verhungert!',
        'go.text': 'Deinem Dorf ging die Nahrung aus und deine Leute haben die Siedlung verlassen.',
        'go.days': 'Tage regiert', 'go.built': 'Gebäude errichtet', 'go.pop': 'Meiste Arbeiter gleichzeitig', 'go.ms': 'Meilensteine',
        'go.retry': 'Nochmal versuchen',

        'h.title': 'So wird gespielt',
        'h.basics': 'Grundlagen', 'h.controls': 'Steuerung',
        'h.b1': 'Wähle rechts ein Gebäude und klicke dann auf die Karte, um es zu platzieren.',
        'h.b2': 'Holzfäller brauchen einen <b>Wald</b>, Steinbrüche und Minen <b>Steinvorkommen</b> im Umkreis von 5 Feldern. Der gestrichelte Rahmen zeigt den Suchradius.',
        'h.b3': 'Jeder <b>arbeitende</b> Bewohner isst 1 Nahrung pro Tag. Untätige Bewohner versorgen sich selbst.',
        'h.b4': 'Drei Tage ohne Nahrung und dein Volk zieht fort. Spiel vorbei.',
        'h.b5': 'Rohstoffe sind durch das Lager begrenzt. Baue früh das <b>Lagerhaus</b>.',
        'h.b6': 'Klicke auf ein Gebäude für Details oder um es abzureißen (50 % Rückerstattung).',
        'h.b7': 'Dein Fortschritt wird automatisch gespeichert.',
        'h.c1': '<kbd>Ziehen</kbd> Karte bewegen',
        'h.c2': '<kbd>Mausrad</kbd> <kbd>+</kbd> <kbd>-</kbd> Zoom',
        'h.c3': '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>Pfeile</kbd> Karte scrollen',
        'h.c4': '<kbd>Leertaste</kbd> Pause / Weiter',
        'h.c5': '<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> Spielgeschwindigkeit',
        'h.c6': '<kbd>Esc</kbd> / <kbd>Rechtsklick</kbd> Abbrechen',
        'h.c7': '<kbd>Q</kbd> <kbd>E</kbd> <kbd>R</kbd> … Gebäude-Tasten (im Menü angezeigt)',
        'h.c8': '<kbd>Entf</kbd> gewähltes Gebäude abreißen',
        'h.c9': '<kbd>C</kbd> Burg zentrieren',
        'h.c10': '<kbd>M</kbd> Stumm &nbsp; <kbd>O</kbd> Einstellungen &nbsp; <kbd>H</kbd> diese Hilfe',

        's.title': 'Einstellungen',
        's.language': 'Sprache',
        's.music': 'Musik',
        's.sfx': 'Soundeffekte',
        's.on': 'An', 's.off': 'Aus',
        's.close': 'Schließen',
        's.help': 'Hilfe anzeigen',
        's.newgame': 'Neues Spiel',
        's.fx': 'Wetter & Atmosphäre',
        'season.spring': 'Frühling', 'season.summer': 'Sommer', 'season.autumn': 'Herbst', 'season.winter': 'Winter',
        'season.tip': '{name}, Jahr {year} · noch {left} Tage · Winter in {winter} Tagen',
        'season.tip.winter': 'Winter, Jahr {year} · noch {left} Tage · Felder und Obstgärten ruhen',
        'season.start.spring': 'Felder und Obstgärten wachsen wieder.',
        'season.start.summer': 'Felder und Obstgärten bringen 25 % mehr.',
        'season.start.autumn': 'Erntezeit: Felder und Obstgärten +50 %. Leg Vorräte für den Winter an!',
        'season.start.winter': 'Felder und Obstgärten ruhen, Hühner legen weniger.',
        'season.warn': 'In {n} Tagen kommt der Winter! Lagere etwa {food} Nahrung ein.',
        'season.warn.ok': 'In {n} Tagen kommt der Winter. Deine Vorräte sollten reichen.',
        'season.warn.storage': 'In {n} Tagen kommt der Winter! Du brauchst etwa {food} Nahrung, kannst aber nur {max} lagern. Baue ein weiteres Lagerhaus.',
        'season.rest': 'ruht',
        'info.season': 'Jahreszeit',
        'tt.winter': 'Im Winter',
        'weather.snow': 'Schnee',
        'weather.snow.start': 'Es beginnt zu schneien.',
        'h.b8': '<b>Jahreszeiten</b>: Sommer und Herbst bringen mehr Ernte, im Winter ruhen Felder und Obstgärten. Leg im Herbst Vorräte an!',
        'pl.placing': 'Bauen: {name}',
        'pl.hint.mouse': 'Rechtsklick oder Esc zum Abbrechen',
        'pl.hint.touch': 'Tippe auf die Karte, dann nochmal zum Bauen',
        'pl.cancel': 'Abbrechen',
        'cv.tap': 'Nochmal tippen: {name} bauen',
        'weather.clear': 'Klar', 'weather.cloudy': 'Bewölkt', 'weather.rain': 'Regen', 'weather.fog': 'Nebel',
        'weather.title': 'Tag {n} · {w}',
        'weather.rain.start': 'Regenwolken ziehen auf.',
        'weather.fog.start': 'Dichter Nebel zieht auf.',
        'weather.clear.start': 'Der Himmel klart auf.',

        'bld.castle.name': 'Burg',
        'bld.castle.desc': 'Dein Sitz der Macht. Platz für 10 Bewohner; die Knechte sammeln täglich 2 Holz und 1 Stein.',
        'bld.warehouse.name': 'Lagerhaus',
        'bld.warehouse.desc': 'Lagert deine Rohstoffe. Erhöht das Lager um 300. Das erste ist kostenlos.',
        'bld.house.name': 'Haus',
        'bld.house.desc': 'Beherbergt 5 Bewohner.',
        'bld.tavern.name': 'Taverne',
        'bld.tavern.desc': 'Ein warmer Ort zum Ausruhen. Beherbergt 8 Bewohner.',
        'bld.lumberjack.name': 'Holzfäller',
        'bld.lumberjack.desc': 'Erntet Holz von nahen Bäumen. Die Bäume bleiben erhalten.',
        'bld.quarry.name': 'Steinbruch',
        'bld.quarry.desc': 'Baut Stein aus nahen Vorkommen ab.',
        'bld.iron_mine.name': 'Eisenmine',
        'bld.iron_mine.desc': 'Fördert Eisenerz. Muss nahe an Steinvorkommen stehen.',
        'bld.blacksmith.name': 'Schmiede',
        'bld.blacksmith.desc': 'Schmiedet besseres Werkzeug. Holz-, Stein- und Eisenproduktion +25 %.',
        'bld.chicken_hut.name': 'Hühnerstall',
        'bld.chicken_hut.desc': 'Hält Hühner für Nahrung. Liefert sofort 3 Nahrung/Tag.',
        'bld.apple_orchard.name': 'Apfelgarten',
        'bld.apple_orchard.desc': 'Zieht Apfelbäume. Liefert 6 Nahrung/Tag, sobald die Bäume gewachsen sind (6 Tage).',
        'bld.farm.name': 'Weizenfeld',
        'bld.farm.desc': 'Ein großes Weizenfeld. Liefert 10 Nahrung/Tag nach der ersten Ernte (4 Tage).',

        'ms.castle': 'Gründe deine Siedlung: platziere die Burg',
        'ms.food': 'Sichere Nahrung: baue 2 Nahrungsgebäude',
        'ms.workers5': 'Bring 5 Bewohner zum Arbeiten',
        'ms.day20': 'Überlebe 20 Tage',
        'ms.bld8': 'Errichte 8 Gebäude',
        'ms.iron20': 'Lagere 20 Eisen',
        'ms.smith': 'Baue eine Schmiede',
        'ms.pop20': 'Wachse auf 20 arbeitende Bewohner',
        'ms.day50': 'Herrsche 50 Tage lang',
        'ms.food150': 'Lagere 150 Nahrung',
        'ms.bld20': 'Errichte 20 Gebäude',
        'ms.day100': 'Ein Jahrhundert der Herrschaft: erreiche Tag 100',
        'ms.winter1': 'Überstehe deinen ersten Winter',
    },
};

const Lang = (() => {
    let current = 'en';
    const listeners = [];

    function set(lang) {
        if (!I18N[lang]) lang = 'en';
        current = lang;
        document.documentElement.lang = lang;
        Settings.set('lang', lang);
        listeners.forEach(fn => fn(lang));
    }

    function get() { return current; }

    function onChange(fn) { listeners.push(fn); }

    function t(key, vars) {
        let s = I18N[current][key] ?? I18N.en[key] ?? key;
        if (vars) {
            Object.keys(vars).forEach(k => {
                s = s.split(`{${k}}`).join(vars[k]);
            });
        }
        return s;
    }

    // Apply translations to static DOM nodes marked with data-i18n / data-i18n-title
    function applyDom(root = document) {
        root.querySelectorAll('[data-i18n]').forEach(el => {
            el.innerHTML = t(el.dataset.i18n);
        });
        root.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = t(el.dataset.i18nTitle);
        });
        document.title = t('w.title') + ' - ' + t('w.subtitle');
    }

    // init from settings (no listeners yet)
    current = I18N[Settings.get('lang')] ? Settings.get('lang') : 'en';
    document.documentElement.lang = current;

    return { set, get, t, onChange, applyDom };
})();

const t = Lang.t;
// Translated building name / description from a definition (or a type key)
function bName(defOrType) { return t('bld.' + (defOrType.key || defOrType) + '.name'); }
function bDesc(defOrType) { return t('bld.' + (defOrType.key || defOrType) + '.desc'); }
function resName(res) { return t('res.' + res); }
