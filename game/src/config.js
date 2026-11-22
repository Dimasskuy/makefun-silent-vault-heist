// Every tuning number and colour in one place. The playfield is a fixed
// 1280x720 logical area (32x18 tiles of 40px); the renderer scales it to the
// window, so no rule below depends on the screen size.

const TILE = 40;
const FIELD = { width: 1280, height: 720, cols: 32, rows: 18 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
const STEP = 1 / 60;

const PLAYER = {
  radius: 12,
  walk: 180,
  sneak: 95,
};

const GUARD = {
  radius: 13,
  patrol: 65,
  chase: 140,
  visionRange: 230,
  visionHalfAngle: 0.55,
  suspicionRise: 1.15,
  suspicionFall: 0.85,
  sneakFactor: 0.45,
  giveUp: 2.6,
  catchDist: 27,
};

const CAMERA = {
  range: 270,
  halfAngle: 0.5,
  disableSeconds: 12,
};

const ALARM = {
  cameraStand: 24,
  cameraSneak: 8,
  guardSuspicious: 11,
  guardAlert: 27,
  decay: 6,
  tripSeconds: 8,
  hideToDisarm: 2,
  disarmLevel: 55,
};

const LASER = {
  tripDist: 11,
};

const SCORE = {
  diamond: 1000,
  ghostBonus: 500,
  timeBonusPerSecond: 15,
};

const PALETTE = {
  backdrop: '#0e1220',
  floorA: '#1a2138',
  floorB: '#171d31',
  floorGallery: '#1c2438',
  floorOffice: '#1e2a24',
  floorVault: '#20242e',
  wall: '#3a4560',
  wallTop: '#5a6a94',
  wallEdge: '#232a42',
  coneGuard: 'rgba(242, 201, 76, 0.20)',
  coneGuardSuspicious: 'rgba(242, 153, 60, 0.28)',
  coneGuardAlert: 'rgba(229, 83, 75, 0.30)',
  coneCamera: 'rgba(79, 195, 247, 0.20)',
  laser: '#ff5a6e',
  diamond: '#7fe7ff',
  lootGold: '#f2c94c',
  lootPink: '#e58ac9',
  lootOrange: '#f2994a',
  thief: '#23232e',
  thiefHood: '#2e2e3d',
  thiefFace: '#f2e6c9',
  guard: '#2c4a7c',
  guardCap: '#1d3355',
  cameraBody: '#4a5a7a',
  panel: '#e5534b',
  van: '#3f7a4a',
  text: '#eef1f5',
  muted: '#8b93a3',
  gold: '#f2c94c',
  red: '#e5534b',
};

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
const BEST_KEY = 'silent-vault.best';
