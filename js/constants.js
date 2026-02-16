// ============================================
// Game Constants & Configuration
// ============================================

const TILE_SIZE = 32;
const MAP_WIDTH = 80;   // tiles
const MAP_HEIGHT = 60;  // tiles
const MAP_PIXEL_W = MAP_WIDTH * TILE_SIZE;
const MAP_PIXEL_H = MAP_HEIGHT * TILE_SIZE;

// Time: 1 real minute = 1 game day at 1x speed
const BASE_DAY_DURATION = 60000; // ms per day at 1x

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
const BUILDINGS = {
    castle: {
        name: 'Castle',
        description: 'Your seat of power. Provides 10 villagers.',
        width: 4,
        height: 4,
        cost: { wood: 0, stone: 0, iron: 0 },
        workers: 0,
        provides: { populationCap: 10 },
        production: null,
        limit: 1,
        category: 'core',
    },
    warehouse: {
        name: 'Warehouse',
        description: 'Stores your resources. Increases storage by 200.',
        width: 3,
        height: 2,
        cost: { wood: 0, stone: 0, iron: 0 },
        workers: 0,
        provides: { storage: 200 },
        production: null,
        limit: 1,
        category: 'core',
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
    },
    chicken_hut: {
        name: 'Chicken Hut',
        description: 'Raises chickens for food. Produces 4 food/day.',
        width: 2,
        height: 2,
        cost: { wood: 10, stone: 5, iron: 0 },
        workers: 1,
        provides: {},
        production: { resource: 'food', amount: 4 },
        limit: null,
        category: 'food',
    },
    apple_orchard: {
        name: 'Apple Orchard',
        description: 'Grows apples. Produces 8 food/day after 5 days.',
        width: 3,
        height: 2,
        cost: { wood: 5, stone: 0, iron: 0 },
        workers: 1,
        provides: {},
        production: { resource: 'food', amount: 8, growthDays: 5 },
        limit: null,
        category: 'food',
    },
};

// Build order (for menu display)
const BUILD_ORDER = ['castle', 'warehouse', 'house', 'lumberjack', 'quarry', 'iron_mine', 'chicken_hut', 'apple_orchard'];

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
};
