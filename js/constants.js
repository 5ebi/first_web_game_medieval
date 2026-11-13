// ============================================
// Game Constants & Configuration
// ============================================

const TILE_SIZE = 32;
const MAP_WIDTH = 80;   // tiles
const MAP_HEIGHT = 60;  // tiles
const MAP_PIXEL_W = MAP_WIDTH * TILE_SIZE;
const MAP_PIXEL_H = MAP_HEIGHT * TILE_SIZE;

// ---- Time ----
// One day (a full day/night cycle) lasts 6 real minutes at 1x speed.
// The clock only starts once the castle AND the first warehouse stand.
const DAY_SECONDS = 360;
const START_HOUR = 8;          // the first day starts in the morning

// ---- Economy (all rates at 1x speed) ----
const FOOD_PER_WORKER_PER_MIN = 0.5;   // only working villagers eat
const STARVATION_GRACE = 60;            // seconds without meat before the people leave
const BASE_STORAGE = 100;
// What the first warehouse brings with it
const WAREHOUSE_STOCK = { wood: 50, stone: 20, iron: 0, food: 20 };

// Save game key (localStorage)
const SAVE_KEY = 'lotk_save_v3';
const SETTINGS_KEY = 'lotk_settings_v1';

// Zoom levels for the camera
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2];

// Terrain types
const TERRAIN = {
    GRASS: 0,
    GRASS_DARK: 1,
    WATER: 2,
    SAND: 3,
    DIRT: 4,
    FOREST: 5,       // has trees (resource)
    STONE_DEPOSIT: 6, // has stones (resource)
    FLOWERS: 7,
    ROCKY: 8,        // gravelly ground with pebbles (buildable, not a stone field)
    MEADOW: 9,       // dry, sunny meadow (buildable)
};

// Building definitions
//  - production: { resource, amount (per delivery), cycle (seconds per delivery at 1x), requires? }
//    requires: terrain that must be within 5 tiles
//  - onStone:  fraction of the footprint that must stand on stone deposits
//  - chimney: [x, y] in sprite pixels where smoke is emitted
//  - lights:  [[x, y, w, h], ...] windows that glow at night
const BUILDINGS = {
    castle: {
        width: 4, height: 4,
        cost: { wood: 0, stone: 0, iron: 0 },
        workers: 0,
        provides: { populationCap: 10 },
        production: null,
        limit: 1,
        chimney: [64, -6],
        lights: [[54, 20, 6, 10], [68, 20, 6, 10]],
        hotkey: 'Q',
    },
    warehouse: {
        width: 3, height: 2,
        cost: { wood: 0, stone: 0, iron: 0 },
        // The first warehouse is free (and brings the starting supplies), every further one costs this
        extraCost: { wood: 30, stone: 20, iron: 0 },
        workers: 0,
        provides: { storage: 300 },
        production: null,
        limit: null,
        hotkey: 'E',
    },
    house: {
        width: 2, height: 2,
        cost: { wood: 15, stone: 10, iron: 0 },
        workers: 0,
        provides: { populationCap: 5 },
        production: null,
        limit: null,
        chimney: [46, 12],
        lights: [[12, 26, 8, 8]],
        hotkey: 'R',
    },
    tavern: {
        width: 2, height: 2,
        cost: { wood: 25, stone: 15, iron: 5 },
        workers: 0,
        provides: { populationCap: 8 },
        production: null,
        limit: null,
        chimney: [14, 10],
        lights: [[26, 28, 8, 8], [42, 28, 8, 8]],
        hotkey: 'T',
    },
    lumberjack: {
        width: 2, height: 2,
        // Normal price. Emergency rule in Game.getCost: with no lumberjack and not enough
        // wood to pay, the next one is free, so wood can never run out for good.
        cost: { wood: 10, stone: 0, iron: 0 },
        workers: 2,
        provides: {},
        production: { resource: 'wood', amount: 4, cycle: 20, requires: 'FOREST' },
        limit: null,
        hotkey: 'F',
    },
    hunter: {
        width: 2, height: 2,
        cost: { wood: 15, stone: 0, iron: 0 },
        workers: 2,
        provides: {},
        production: { resource: 'food', amount: 4, cycle: 30, requires: 'FOREST' },
        limit: null,
        chimney: [16, 6],
        hotkey: 'X',
    },
    quarry: {
        width: 2, height: 2,
        cost: { wood: 20, stone: 0, iron: 0 },
        workers: 3,
        provides: {},
        production: { resource: 'stone', amount: 4, cycle: 30 },
        onStone: 0.5,
        limit: null,
        hotkey: 'G',
    },
    iron_mine: {
        width: 2, height: 2,
        cost: { wood: 30, stone: 15, iron: 0 },
        workers: 3,
        provides: {},
        production: { resource: 'iron', amount: 3, cycle: 40, requires: 'STONE_DEPOSIT' },
        limit: null,
        hotkey: 'V',
    },
    // Forges one weapon per work cycle; the player picks which (see WEAPONS)
    weaponsmith: {
        width: 2, height: 2,
        cost: { wood: 30, stone: 20, iron: 10 },
        workers: 2,
        provides: {},
        production: null,
        crafts: 'weapons',
        limit: null,
        chimney: [50, 8],
        lights: [[24, 30, 16, 12]],
        hotkey: 'B',
    },
    // Neighbour bonus: houses and taverns within `well.radius` tiles (measured from the
    // well's centre to the nearest point of their footprint) house more villagers.
    // Bonuses from several wells don't stack.
    well: {
        width: 1, height: 1,
        cost: { wood: 5, stone: 10, iron: 0 },
        workers: 0,
        provides: {},
        production: null,
        well: { radius: 4, bonus: { house: 2, tavern: 3 } },
        limit: null,
        hotkey: 'U',
    },
    // Turns a free villager plus a weapon from the stock into a soldier (see WEAPONS[].unit)
    barracks: {
        width: 3, height: 2,
        cost: { wood: 40, stone: 30, iron: 0 },
        workers: 0,
        provides: {},
        production: null,
        recruits: true,
        limit: null,
        lights: [[20, 30, 6, 8], [70, 30, 6, 8]],
        hotkey: 'K',
    },
};

// Construction animation length (ms of real time) and the sound material used while building
const BUILD_ANIM = {
    castle: { ms: 2600, material: 'stone' },
    warehouse: { ms: 1600, material: 'wood' },
    house: { ms: 1500, material: 'wood' },
    tavern: { ms: 1700, material: 'wood' },
    lumberjack: { ms: 1400, material: 'wood' },
    hunter: { ms: 1400, material: 'wood' },
    quarry: { ms: 1500, material: 'stone' },
    iron_mine: { ms: 1600, material: 'stone' },
    weaponsmith: { ms: 1700, material: 'stone' },
    barracks: { ms: 1900, material: 'stone' },
    well: { ms: 1100, material: 'stone' },
};

// Give every definition its own key so translations can be looked up from a def
Object.keys(BUILDINGS).forEach(k => { BUILDINGS[k].key = k; });

// Build order (for menu display)
const BUILD_ORDER = [
    'castle', 'warehouse', 'lumberjack', 'hunter', 'quarry',
    'house', 'tavern', 'well', 'iron_mine', 'weaponsmith', 'barracks',
];

// ---- Position matters ----
// Producers look for their resource within this many tiles of any tile they touch.
const RESOURCE_RADIUS = 5;
// How a producer's yield depends on its spot (Game.getYield). factor = count / full,
// clamped to [min, max]; the base rate (amount per cycle) is multiplied by it.
//  - trees:  standing trees in range (lumberjack; felling makes them fewer)
//  - FOREST / STONE_DEPOSIT: tiles of that terrain in range
//  - onStone: share of the footprint on stone, factor = 0.25 + share (quarry: 0.75 to 1.25)
const YIELD = {
    lumberjack: { by: 'trees', full: 60, min: 0, max: 1.25 },
    hunter:     { by: 'FOREST', full: 20, min: 0.5, max: 1.25 },
    iron_mine:  { by: 'STONE_DEPOSIT', full: 10, min: 0.4, max: 1.25 },
    quarry:     { by: 'onStone' },
};
// Each wood delivery fells this many trees (the nearest standing ones in range)
const TREES_PER_DELIVERY = 2;
// A felled tree is a stump, then a sapling, and stands again after this many game seconds
const TREE_REGROW_SECONDS = DAY_SECONDS * 2;

// Weapons the weapon smith can forge, in menu order. Data-driven: a new weapon is one
// entry here plus its icon (Sprites.drawIcon), soldier art (Sprites.drawSoldier) and the
// strings wpn.<key> / unit.<unit>.* in i18n.js.
//  - cost:  resources used up per weapon (taken when the work on it starts)
//  - cycle: seconds per weapon at 1x with a full crew
//  - unit:  the soldier the barracks makes from it, with its hit points
const WEAPONS = {
    bow:   { cost: { wood: 3 }, cycle: 30, unit: 'archer', hp: 30 },
    sword: { cost: { iron: 2 }, cycle: 40, unit: 'swordsman', hp: 50 },
};
const WEAPON_STOCK_MAX = 20;    // per weapon type
// Soldier type -> weapon it needs
const UNIT_WEAPON = {};
Object.keys(WEAPONS).forEach(w => { UNIT_WEAPON[WEAPONS[w].unit] = w; });

// Seasons: each season lasts one day (6 minutes at 1x), so a year is 24 minutes.
// Hunting yields more in summer and autumn and only half in winter.
const SEASONS = [
    { id: 'spring', days: 1, food: { hunter: 1 } },
    { id: 'summer', days: 1, food: { hunter: 1.25 } },
    { id: 'autumn', days: 1, food: { hunter: 1.25 } },
    { id: 'winter', days: 1, food: { hunter: 0.5 } },
];
const YEAR_DAYS = SEASONS.reduce((a, s) => a + s.days, 0);
const WINTER_WARNING_SECONDS = 120;     // warn this long before winter starts

// Fraction of the build cost refunded when demolishing
const DEMOLISH_REFUND = 0.5;

// Milestones - small goals that guide the player (texts live in i18n.js as ms.<id>)
const MILESTONES = [
    { id: 'castle',     check: (s, bm) => bm.countByType('castle') > 0 },
    { id: 'warehouse',  check: (s, bm) => bm.countByType('warehouse') > 0 },
    { id: 'lumberjack', check: (s, bm) => bm.countByType('lumberjack') > 0 },
    { id: 'hunter',     check: (s, bm) => bm.countByType('hunter') > 0 },
    { id: 'quarry',     check: (s, bm) => bm.countByType('quarry') > 0 },
    { id: 'houses2',    check: (s, bm) => bm.countByType('house') >= 2 },
    { id: 'workers15',  check: (s) => s.populationUsed >= 15 },
    { id: 'winter1',    check: (s) => s.day > YEAR_DAYS },
    { id: 'iron20',     check: (s) => s.resources.iron >= 20 },
    { id: 'weaponsmith', check: (s, bm) => bm.countByType('weaponsmith') > 0 },
    { id: 'soldier1',   check: () => typeof Units !== 'undefined' && Units.getAll().length > 0 },
    { id: 'pop30',      check: (s) => s.populationUsed >= 30 },
    { id: 'bld20',      check: (s, bm) => bm.getAll().length >= 20 },
    { id: 'year3',      check: (s) => s.day > YEAR_DAYS * 2 },
];

// Colors palette
const COLORS = {
    grassLight: '#5a8f3c',
    grassDark: '#4a7f2c',
    water: '#3a7ecf',
    waterDeep: '#2a6ebf',
    sand: '#d4b876',
    dirt: '#8a7050',
    treeTrunk: '#6b4226',
    treeLeaves: '#2d6b1e',
    treeLeavesDark: '#1d5b0e',
    stonePile: '#9a9a9a',
    stonePileDark: '#7a7a7a',
    flowers1: '#d44',
    flowers2: '#dd4',
    flowers3: '#d4d',
    // resource colors used for floating text / icons
    wood: '#d9a04a',
    stone: '#c8c8c8',
    iron: '#aeb8d0',
    food: '#ff7a6a',
};

// Minimap terrain colors
const MINIMAP_COLORS = {
    [TERRAIN.GRASS]: '#5a8f3c',
    [TERRAIN.GRASS_DARK]: '#4a7f2c',
    [TERRAIN.WATER]: '#3a7ecf',
    [TERRAIN.SAND]: '#d4b876',
    [TERRAIN.DIRT]: '#8a7050',
    [TERRAIN.FOREST]: '#2d5b1e',
    [TERRAIN.STONE_DEPOSIT]: '#7a7a6a',
    [TERRAIN.FLOWERS]: '#6a9f4c',
    [TERRAIN.ROCKY]: '#7a7f68',
    [TERRAIN.MEADOW]: '#7f9a48',
};
