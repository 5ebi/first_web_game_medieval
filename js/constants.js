// ============================================
// Game Constants & Configuration
// ============================================

const TILE_SIZE = 32;
const MAP_WIDTH = 80;   // tiles
const MAP_HEIGHT = 60;  // tiles
const MAP_PIXEL_W = MAP_WIDTH * TILE_SIZE;
const MAP_PIXEL_H = MAP_HEIGHT * TILE_SIZE;

// Time: 1 game day = 3 real seconds at 1x speed
const BASE_DAY_DURATION = 3000; // ms per day at 1x

// A full day/night cycle spans this many game days (slow, atmospheric)
const DAY_NIGHT_CYCLE_DAYS = 24;

// Starvation tolerance
const STARVATION_LIMIT = 3;

// Storage
const BASE_STORAGE = 150;

// Save game key (localStorage)
const SAVE_KEY = 'lotk_save_v2';
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
};

// Building definitions
//  - chimney: [x, y] in sprite pixels where smoke is emitted
//  - lights:  [[x, y, w, h], ...] windows that glow at night
const BUILDINGS = {
    castle: {
        name: 'Castle',
        description: 'Your seat of power. Provides 10 villagers.',
        width: 4,
        height: 4,
        cost: { wood: 0, stone: 0, iron: 0 },
        workers: 0,
        // Servants gather a little wood and stone, so a settlement can never get stuck at zero
        provides: { populationCap: 10, trickle: { wood: 2, stone: 1 } },
        production: null,
        limit: 1,
        category: 'core',
        chimney: [64, -6],
        lights: [[54, 20, 6, 10], [68, 20, 6, 10]],
        hotkey: 'Q',
    },
    warehouse: {
        name: 'Warehouse',
        description: 'Stores your resources. Increases storage by 300.',
        width: 3,
        height: 2,
        cost: { wood: 0, stone: 0, iron: 0 },
        // The first warehouse is free, every further one costs this
        extraCost: { wood: 30, stone: 20, iron: 0 },
        workers: 0,
        provides: { storage: 300 },
        production: null,
        limit: null,
        category: 'core',
        hotkey: 'E',
    },
    house: {
        name: 'House',
        description: 'Houses 5 villagers.',
        width: 2,
        height: 2,
        cost: { wood: 15, stone: 10, iron: 0 },
        workers: 0,
        provides: { populationCap: 5 },
        production: null,
        limit: null,
        category: 'housing',
        chimney: [46, 12],
        lights: [[12, 26, 8, 8]],
        hotkey: 'R',
    },
    lumberjack: {
        name: 'Lumberjack',
        description: 'Harvests wood from nearby trees. Trees are not removed.',
        width: 2,
        height: 2,
        cost: { wood: 10, stone: 0, iron: 0 },
        workers: 2,
        provides: {},
        production: { resource: 'wood', amount: 6, requires: 'FOREST' },
        limit: null,
        category: 'production',
        hotkey: 'F',
    },
    quarry: {
        name: 'Stone Quarry',
        description: 'Extracts stone from nearby deposits.',
        width: 2,
        height: 2,
        cost: { wood: 10, stone: 0, iron: 0 },
        workers: 2,
        provides: {},
        production: { resource: 'stone', amount: 4, requires: 'STONE_DEPOSIT' },
        limit: null,
        category: 'production',
        hotkey: 'G',
    },
    iron_mine: {
        name: 'Iron Mine',
        description: 'Mines iron ore. Must be near stone deposits.',
        width: 2,
        height: 2,
        cost: { wood: 15, stone: 10, iron: 0 },
        workers: 2,
        provides: {},
        production: { resource: 'iron', amount: 2, requires: 'STONE_DEPOSIT' },
        limit: null,
        category: 'production',
        hotkey: 'V',
    },
    chicken_hut: {
        name: 'Chicken Hut',
        description: 'Raises chickens for food. Produces 3 food/day right away.',
        width: 2,
        height: 2,
        cost: { wood: 10, stone: 5, iron: 0 },
        workers: 1,
        provides: {},
        production: { resource: 'food', amount: 3 },
        limit: null,
        category: 'food',
        hotkey: 'X',
    },
    apple_orchard: {
        name: 'Apple Orchard',
        description: 'Grows apples. Produces 6 food/day once the trees have grown (6 days).',
        width: 3,
        height: 2,
        cost: { wood: 15, stone: 0, iron: 0 },
        workers: 1,
        provides: {},
        production: { resource: 'food', amount: 6, growthDays: 6 },
        limit: null,
        category: 'food',
        hotkey: 'N',
    },
    farm: {
        name: 'Wheat Farm',
        description: 'A large field of wheat. Produces 10 food/day after the first harvest (4 days).',
        width: 3,
        height: 3,
        cost: { wood: 20, stone: 10, iron: 0 },
        workers: 2,
        provides: {},
        production: { resource: 'food', amount: 10, growthDays: 4 },
        limit: null,
        category: 'food',
        hotkey: 'K',
    },
    blacksmith: {
        name: 'Blacksmith',
        description: 'Forges better tools. All wood, stone and iron production +25%.',
        width: 2,
        height: 2,
        cost: { wood: 20, stone: 15, iron: 10 },
        workers: 1,
        provides: { productionBonus: 0.25 },
        production: null,
        limit: 1,
        category: 'production',
        chimney: [50, 8],
        lights: [[24, 30, 16, 12]],
        hotkey: 'B',
    },
    tavern: {
        name: 'Tavern',
        description: 'A warm place to rest. Houses 8 villagers.',
        width: 2,
        height: 2,
        cost: { wood: 20, stone: 10, iron: 5 },
        workers: 0,
        provides: { populationCap: 8 },
        production: null,
        limit: null,
        category: 'housing',
        chimney: [14, 10],
        lights: [[26, 28, 8, 8], [42, 28, 8, 8]],
        hotkey: 'T',
    },
};

// Construction animation length (ms of real time) and the sound material used while building
const BUILD_ANIM = {
    castle: { ms: 2600, material: 'stone' },
    warehouse: { ms: 1600, material: 'wood' },
    house: { ms: 1500, material: 'wood' },
    tavern: { ms: 1700, material: 'wood' },
    lumberjack: { ms: 1400, material: 'wood' },
    quarry: { ms: 1500, material: 'stone' },
    iron_mine: { ms: 1600, material: 'stone' },
    blacksmith: { ms: 1700, material: 'stone' },
    chicken_hut: { ms: 1300, material: 'wood' },
    apple_orchard: { ms: 1200, material: 'soil' },
    farm: { ms: 1300, material: 'soil' },
};

// Give every definition its own key so translations can be looked up from a def
Object.keys(BUILDINGS).forEach(k => { BUILDINGS[k].key = k; });

// Build order (for menu display)
const BUILD_ORDER = [
    'castle', 'warehouse', 'house', 'tavern',
    'lumberjack', 'quarry', 'iron_mine', 'blacksmith',
    'chicken_hut', 'apple_orchard', 'farm',
];

// Seasons: a year has 46 days. Food buildings yield more in summer and autumn,
// and rest in winter (chickens still lay a little). Saplings and fields do not grow in winter.
const SEASONS = [
    { id: 'spring', days: 12, food: { farm: 1,    apple_orchard: 1,    chicken_hut: 1 },    growth: true },
    { id: 'summer', days: 12, food: { farm: 1.25, apple_orchard: 1.25, chicken_hut: 1 },    growth: true },
    { id: 'autumn', days: 12, food: { farm: 1.5,  apple_orchard: 1.5,  chicken_hut: 1 },    growth: true },
    { id: 'winter', days: 10, food: { farm: 0,    apple_orchard: 0,    chicken_hut: 0.75 }, growth: false },
];
const YEAR_DAYS = SEASONS.reduce((a, s) => a + s.days, 0);
const WINTER_WARNING_DAYS = 6;

// Fraction of the build cost refunded when demolishing
const DEMOLISH_REFUND = 0.5;

// Milestones - small goals that give the player direction
const MILESTONES = [
    { id: 'castle',   text: 'Found your settlement: place the Castle',  check: (s, bm) => bm.countByType('castle') > 0 },
    { id: 'food',     text: 'Secure food: build 2 food buildings',       check: (s, bm) => bm.getAll().filter(b => b.def.production?.resource === 'food').length >= 2 },
    { id: 'workers5', text: 'Put 5 villagers to work',                   check: (s) => s.populationUsed >= 5 },
    { id: 'day20',    text: 'Survive 20 days',                           check: (s) => s.day >= 20 },
    { id: 'bld8',     text: 'Build 8 buildings',                         check: (s, bm) => bm.getAll().length >= 8 },
    { id: 'iron20',   text: 'Stockpile 20 iron',                         check: (s) => s.resources.iron >= 20 },
    { id: 'smith',    text: 'Build a Blacksmith',                        check: (s, bm) => bm.countByType('blacksmith') > 0 },
    { id: 'pop20',    text: 'Grow to 20 working villagers',              check: (s) => s.populationUsed >= 20 },
    { id: 'winter1',  text: 'Survive your first winter',                 check: (s) => s.day > YEAR_DAYS },
    { id: 'day50',    text: 'Rule for 50 days',                          check: (s) => s.day >= 50 },
    { id: 'food150',  text: 'Store 150 food',                            check: (s) => s.resources.food >= 150 },
    { id: 'bld20',    text: 'Build 20 buildings',                        check: (s, bm) => bm.getAll().length >= 20 },
    { id: 'day100',   text: 'A century of rule: reach day 100',          check: (s) => s.day >= 100 },
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
};
