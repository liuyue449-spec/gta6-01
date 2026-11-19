// Sunhaven Streets — every tuning number and colour in one place.
// A fixed logical viewport of 1280x720; the renderer scales it to the window,
// so no rule below depends on the screen size. The city itself is much bigger
// (CITY_SIZE) and the camera follows the player around it.
export const STEP = 1 / 60;
export const VIEW = { width: 1280, height: 720 };
export const CITY_SIZE = 3600;
export const GAME_TITLE = 'Sunhaven Streets';

/** How many traffic cars and pedestrians the city starts with. */
export const TRAFFIC_COUNT = 22;
export const PED_COUNT = 46;

// Road grid: roads are centred on these coordinates, ROAD_W wide, running
// both ways across the whole city. Blocks between roads hold buildings.
export const ROAD_CENTRES = [250, 750, 1250, 1750, 2250, 2750, 3250];
export const ROAD_W = 150;
export const BLOCK = 500; // distance between neighbouring road centres

export const PLAYER = {
  radius: 13,
  walkSpeed: 235,
  runSpeed: 330,
  maxHealth: 100,
  punchDamage: 34,
  punchRange: 46,
  punchCooldown: 0.38,
};

export const CAR = {
  length: 64,
  width: 30,
  accel: 420,
  brake: 620,
  maxSpeed: 560,
  reverseSpeed: 180,
  turnRate: 2.6,
  drag: 0.55,
};

export const POLICE = {
  maxCops: 8,
  ramDamage: 7,
  arrestRange: 48,
  arrestTime: 2.2,
  copSpeed: 500,
};

export const WANTED = {
  // stars -> how fast heat cools when no cop can see the player
  decayPerSecond: [0.25, 0.12, 0.07, 0.045, 0.03, 0.02],
  copsForStars: [0, 2, 3, 4, 6, 8],
};

export const ECONOMY = {
  startMoney: 120,
  bustedFine: 250,
  hospitalBill: 150,
  bulletPrice: 25,
  ammoPack: 12,
};

export const PALETTE = {
  sky: '#8ec9ee',
  grass: '#7ec850',
  grassDark: '#6fb844',
  sidewalk: '#c9c2b4',
  road: '#3d4450',
  roadLine: '#f5d76e',
  curb: '#e8e2d4',
  buildingRoof: ['#e07856', '#5b8dd9', '#e8b64c', '#7fb069', '#b07cc9', '#d95f6e', '#4fa8a0', '#e07b39'],
  water: '#3fa7d6',
  sand: '#ecd9a0',
  parkTree: '#2f7d32',
  player: '#ffcf3f',
  playerShirt: '#2b6cb0',
  cop: '#1e40af',
  copCar: '#1d4ed8',
  pedShirt: ['#e05d44', '#4caf50', '#9c6dd7', '#ef8f3c', '#3fa7a0', '#d6457b'],
  gang: '#8b1e2d',
  hudPanel: 'rgba(12, 18, 28, 0.72)',
  hudText: '#f4f6f8',
  hudGold: '#ffd23f',
  mission: '#ffd23f',
  danger: '#ff5252',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** localStorage keys for the save game and best run. */
export const SAVE_KEY = 'sunhaven-streets.save.v1';
export const BEST_KEY = 'sunhaven-streets.best.v1';
