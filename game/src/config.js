// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area (32x18 tiles of 40 px); the renderer scales it to the window, so no rule below
// depends on the screen size.

export const FIELD = { width: 1280, height: 720 };
export const TILE = 40;
export const COLS = 32;
export const ROWS = 18;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 178,
  sneakSpeed: 96,
};

export const GUARD = {
  radius: 14,
  patrolSpeed: 66,
  chaseSpeed: 138,
  /** Vision range in px and half-angle in radians. */
  visionRange: 232,
  visionHalfAngle: 0.55,
  /** Suspicion 0..1: rises while the thief is seen, falls when hidden. */
  suspicionRise: 1.15,
  suspicionFall: 0.85,
  /** Seconds of lost sight before a chasing guard gives up and returns to patrol. */
  giveUpSeconds: 2.6,
  /** Distance at which a guard grabs the thief. */
  catchDistance: 27,
};

export const CAMERA = {
  /** Vision range in px and half-angle in radians. */
  range: 272,
  halfAngle: 0.5,
  /** Seconds a panel disable lasts. */
  disableSeconds: 12,
};

export const ALARM = {
  max: 100,
  /** Per second while a camera sees the thief (standing / sneaking). */
  cameraStand: 24,
  cameraSneak: 8,
  /** Per second while a guard is suspicious of / alert to the thief. */
  guardSuspicious: 11,
  guardAlert: 27,
  /** Per second of decay while nobody sees the thief. */
  decay: 6,
  /** Countdown once tripped; hide unseen this long to disarm it. */
  tripSeconds: 8,
  hideToDisarm: 2,
  /** Alarm level after a successful disarm. */
  disarmLevel: 55,
};

/** Ghost bonus: awarded when the thief was never seen at all during the level. */
export const GHOST_BONUS = 500;
/** Time bonus: $15 per second under par. */
export const TIME_BONUS_PER_SECOND = 15;

export const PALETTE = {
  backdrop: '#0b0e14',
  floorA: '#232a3a',
  floorB: '#202636',
  floorOffice: '#2b2a26',
  floorVault: '#1d2733',
  wall: '#3a4358',
  wallTop: '#5a6a8c',
  wallSide: '#2c3448',
  carpet: '#3d2f33',
  thief: '#1c1e24',
  thiefTrim: '#e8b23a',
  guard: '#2c4a7c',
  guardCap: '#1d3355',
  cameraBody: '#8a93a6',
  conePatrol: 'rgba(242, 201, 76, 0.20)',
  coneSuspicious: 'rgba(242, 140, 60, 0.30)',
  coneAlert: 'rgba(229, 83, 75, 0.34)',
  coneCamera: 'rgba(120, 190, 255, 0.20)',
  laser: '#ff3b5c',
  diamond: '#7fe7ff',
  lootGold: '#f2c94c',
  lootArt: '#c98ad6',
  van: '#3f7d4e',
  vanDark: '#2c5a37',
  panel: '#252b38',
  text: '#eef1f5',
  muted: '#9aa3b5',
  alarmLow: '#4fc3f7',
  alarmMid: '#f2c94c',
  alarmHigh: '#e5534b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'silent-vault.best';
