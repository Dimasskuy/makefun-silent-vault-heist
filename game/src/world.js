// The game's rules and state, with no drawing and no browser in it: the thief, the
// patrolling guards and their vision cones, the sweeping cameras, the alarm meter,
// the laser grid, the loot and the diamond, the win and the lose. step() advances one
// fixed step and returns what happened as bit flags, so the caller can react (sounds,
// screens) without the world knowing about them. Nothing here allocates after
// createWorld returns, except the small cone polygons the renderer asks for.
import { ALARM, COLS, FIELD, GHOST_BONUS, GUARD, CAMERA, PLAYER, ROWS, STEP, TILE, TIME_BONUS_PER_SECOND } from './config.js';
import { LEVELS } from './levels.js';

export const EVENT_PICKUP = 1;
export const EVENT_DIAMOND = 2;
export const EVENT_PANEL = 4;
export const EVENT_SUSPICIOUS = 8;
export const EVENT_ALARM_TRIP = 16;
export const EVENT_DISARM = 32;
export const EVENT_LASER = 64;
export const EVENT_BUSTED = 128;
export const EVENT_CLEARED = 256;
export const EVENT_SEEN = 512;

const CONE_RAYS = 26;
const LOS_STEP = 7;

function tileCenter(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Distance from a point to a line segment (for the laser tripwires). */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export function createWorld(random) {
  const state = {
    levelIndex: 0,
    level: LEVELS[0],
    grid: [],
    player: { x: 0, y: 0, angle: 0, sneak: false, moving: false },
    guards: [],
    cameras: [],
    panels: [],
    loot: [],
    diamond: { x: 0, y: 0, taken: false },
    van: { x: 0, y: 0 },
    lasers: [],
    alarm: 0,
    tripped: false,
    tripTimer: 0,
    hiddenTimer: 0,
    elapsed: 0,
    lootValue: 0,
    lootTaken: 0,
    seenTime: 0,
    everSeen: false,
    status: 'playing',
    bustedReason: '',
    score: 0,
    timeBonus: 0,
    ghostBonus: 0,
  };

  function loadLevel(index) {
    const level = LEVELS[index];
    state.levelIndex = index;
    state.level = level;
    state.grid = level.map.map((row) => row.split(''));
    state.guards = [];
    state.cameras = [];
    state.panels = [];
    state.loot = [];
    state.lasers = level.lasers.map((laser) => ({
      x1: laser.x1 * TILE + TILE / 2,
      y1: laser.y1 * TILE + TILE / 2,
      x2: laser.x2 * TILE + TILE / 2,
      y2: laser.y2 * TILE + TILE / 2,
    }));
    let lootIndex = 0;
    for (let ty = 0; ty < ROWS; ty += 1) {
      for (let tx = 0; tx < COLS; tx += 1) {
        const ch = state.grid[ty][tx];
        const c = tileCenter(tx, ty);
        if (ch === 'T') {
          state.player.x = c.x;
          state.player.y = c.y;
          state.player.angle = 0;
          state.grid[ty][tx] = '.';
        } else if (ch === 'V') {
          state.van = { x: c.x, y: c.y };
          state.grid[ty][tx] = '.';
        } else if (ch === 'D') {
          state.diamond = { x: c.x, y: c.y, taken: false };
          state.grid[ty][tx] = '.';
        } else if (ch === 'L') {
          state.loot.push({ x: c.x, y: c.y, value: level.lootValues[lootIndex] ?? 100, taken: false });
          lootIndex += 1;
          state.grid[ty][tx] = '.';
        } else if (ch === 'P') {
          state.panels.push({ x: c.x, y: c.y, cameraIndex: -1 });
          state.grid[ty][tx] = '.';
        } else if (ch === 'C') {
          state.grid[ty][tx] = '.';
        }
      }
    }
    for (const def of level.guards) {
      const start = tileCenter(def.waypoints[0][0], def.waypoints[0][1]);
      const next = tileCenter(def.waypoints[1][0], def.waypoints[1][1]);
      state.guards.push({
        x: start.x,
        y: start.y,
        radius: GUARD.radius,
        waypoints: def.waypoints.map(([wx, wy]) => tileCenter(wx, wy)),
        wpIndex: 1,
        wpDir: 1,
        angle: Math.atan2(next.y - start.y, next.x - start.x),
        suspicion: 0,
        state: 'patrol',
        loseTimer: 0,
        speed: GUARD.patrolSpeed,
        lastSeen: { x: start.x, y: start.y },
      });
    }
    level.cameras.forEach((def, index) => {
      const c = tileCenter(def.x, def.y);
      state.cameras.push({
        x: c.x,
        y: c.y,
        baseAngle: def.baseAngle,
        arc: def.arc,
        period: def.period,
        range: def.range,
        phase: random() * Math.PI * 2,
        angle: def.baseAngle,
        disabled: 0,
      });
      void index;
    });
    // Each panel controls its nearest camera.
    for (const panel of state.panels) {
      let best = -1;
      let bestDist = Infinity;
      state.cameras.forEach((camera, index) => {
        const d = Math.hypot(camera.x - panel.x, camera.y - panel.y);
        if (d < bestDist) {
          bestDist = d;
          best = index;
        }
      });
      panel.cameraIndex = best;
    }
    state.alarm = 0;
    state.tripped = false;
    state.tripTimer = 0;
    state.hiddenTimer = 0;
    state.elapsed = 0;
    state.lootValue = 0;
    state.lootTaken = 0;
    state.seenTime = 0;
    state.everSeen = false;
    state.status = 'playing';
    state.bustedReason = '';
    state.score = 0;
    state.timeBonus = 0;
    state.ghostBonus = 0;
  }

  function isWallTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
    return state.grid[ty][tx] === '#';
  }

  function isWallPx(x, y) {
    return isWallTile(Math.floor(x / TILE), Math.floor(y / TILE));
  }

  /** True when the segment between the two points crosses no wall. */
  function hasLineOfSight(x0, y0, x1, y1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / LOS_STEP));
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (isWallPx(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  /** Is the thief inside this observer's cone (range, angle, line of sight)? */
  function coneSees(ox, oy, angle, range, halfAngle, px, py) {
    const dx = px - ox;
    const dy = py - oy;
    const dist = Math.hypot(dx, dy);
    if (dist > range) return false;
    if (Math.abs(angleDiff(Math.atan2(dy, dx), angle)) > halfAngle) return false;
    return hasLineOfSight(ox, oy, px, py);
  }

  /** The visible part of a cone: a polygon whose rays stop at the first wall. */
  function conePolygon(ox, oy, angle, range, halfAngle) {
    const points = [{ x: ox, y: oy }];
    for (let i = 0; i <= CONE_RAYS; i += 1) {
      const a = angle - halfAngle + (2 * halfAngle * i) / CONE_RAYS;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let reach = range;
      for (let d = 8; d <= range; d += 8) {
        if (isWallPx(ox + dx * d, oy + dy * d)) {
          reach = d - 8;
          break;
        }
      }
      points.push({ x: ox + dx * Math.max(0, reach), y: oy + dy * Math.max(0, reach) });
    }
    return points;
  }

  /** Move a circle against the walls, one axis at a time so it slides along them. */
  function moveCircle(entity, dx, dy) {
    const r = entity.radius ?? PLAYER.radius;
    const nx = entity.x + dx;
    if (!circleHitsWall(nx, entity.y, r)) entity.x = nx;
    const ny = entity.y + dy;
    if (!circleHitsWall(entity.x, ny, r)) entity.y = ny;
  }

  function circleHitsWall(x, y, r) {
    const x0 = Math.floor((x - r) / TILE);
    const x1 = Math.floor((x + r) / TILE);
    const y0 = Math.floor((y - r) / TILE);
    const y1 = Math.floor((y + r) / TILE);
    for (let ty = y0; ty <= y1; ty += 1) {
      for (let tx = x0; tx <= x1; tx += 1) {
        if (!isWallTile(tx, ty)) continue;
        const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
        const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
      }
    }
    return false;
  }

  function reset() {
    loadLevel(state.levelIndex);
  }

  function nextLevel() {
    if (state.levelIndex + 1 < LEVELS.length) {
      loadLevel(state.levelIndex + 1);
      return true;
    }
    return false;
  }

  function finishScore() {
    state.timeBonus = Math.max(0, Math.round((state.level.par - state.elapsed) * TIME_BONUS_PER_SECOND));
    state.ghostBonus = state.everSeen ? 0 : GHOST_BONUS;
    state.score = state.lootValue + (state.diamond.taken ? 1000 : 0) + state.timeBonus + state.ghostBonus;
  }

  function bust(reason) {
    if (state.status !== 'playing') return EVENT_BUSTED;
    state.status = 'busted';
    state.bustedReason = reason;
    finishScore();
    return EVENT_BUSTED;
  }

  /**
   * One fixed step. `input` is {mx, my, sneak, interact} (null on the title screen's
   * ambient backdrop). Returns what happened as EVENT_* flags.
   */
  function step(dt, input, ambient) {
    let events = 0;
    const player = state.player;
    state.elapsed += dt;

    // Cameras sweep (and count down their disable) on every screen.
    for (const camera of state.cameras) {
      if (camera.disabled > 0) camera.disabled = Math.max(0, camera.disabled - dt);
      const t = state.elapsed + camera.phase;
      camera.angle = camera.baseAngle + camera.arc * Math.sin((t / camera.period) * Math.PI * 2);
    }
    // Guards patrol on every screen, so the title backdrop is alive.
    for (const guard of state.guards) {
      if (guard.state === 'patrol') {
        const target = guard.waypoints[guard.wpIndex];
        const dx = target.x - guard.x;
        const dy = target.y - guard.y;
        const dist = Math.hypot(dx, dy);
        const stepLen = GUARD.patrolSpeed * dt;
        if (dist <= Math.max(stepLen, 2)) {
          guard.x = target.x;
          guard.y = target.y;
          guard.wpIndex += guard.wpDir;
          if (guard.wpIndex >= guard.waypoints.length || guard.wpIndex < 0) {
            guard.wpDir *= -1;
            guard.wpIndex += guard.wpDir * 2;
          }
        } else {
          guard.x += (dx / dist) * stepLen;
          guard.y += (dy / dist) * stepLen;
          guard.angle = Math.atan2(dy, dx);
        }
      }
    }
    if (ambient) return events;
    if (state.status !== 'playing') return events;

    // --- Thief movement ---
    player.sneak = !!input.sneak;
    const speed = player.sneak ? PLAYER.sneakSpeed : PLAYER.walkSpeed;
    const mx = input.mx || 0;
    const my = input.my || 0;
    const len = Math.hypot(mx, my);
    player.moving = len > 0.01;
    if (player.moving) {
      player.angle = Math.atan2(my, mx);
      moveCircle(player, (mx / len) * speed * dt, (my / len) * speed * dt);
    }

    // --- Interact: loot, diamond, camera panel ---
    if (input.interact) {
      let best = null;
      let bestDist = Infinity;
      let bestKind = '';
      for (const item of state.loot) {
        if (item.taken) continue;
        const d = Math.hypot(item.x - player.x, item.y - player.y);
        if (d < 40 && d < bestDist) {
          best = item;
          bestDist = d;
          bestKind = 'loot';
        }
      }
      if (!state.diamond.taken) {
        const d = Math.hypot(state.diamond.x - player.x, state.diamond.y - player.y);
        if (d < 50 && d < bestDist) {
          best = state.diamond;
          bestDist = d;
          bestKind = 'diamond';
        }
      }
      for (const panel of state.panels) {
        const camera = state.cameras[panel.cameraIndex];
        if (!camera || camera.disabled > 0) continue;
        const d = Math.hypot(panel.x - player.x, panel.y - player.y);
        if (d < 52 && d < bestDist) {
          best = panel;
          bestDist = d;
          bestKind = 'panel';
        }
      }
      if (bestKind === 'loot') {
        best.taken = true;
        state.lootValue += best.value;
        state.lootTaken += 1;
        events |= EVENT_PICKUP;
      } else if (bestKind === 'diamond') {
        best.taken = true;
        state.lootValue += 0;
        events |= EVENT_DIAMOND;
      } else if (bestKind === 'panel') {
        const camera = state.cameras[best.cameraIndex];
        camera.disabled = CAMERA.disableSeconds;
        events |= EVENT_PANEL;
      }
    }

    // --- Who sees the thief? ---
    let seenByCamera = false;
    let seenByGuard = false;
    let guardAlert = false;
    for (const camera of state.cameras) {
      if (camera.disabled > 0) continue;
      if (coneSees(camera.x, camera.y, camera.angle, camera.range, CAMERA.halfAngle, player.x, player.y)) {
        seenByCamera = true;
        break;
      }
    }
    for (const guard of state.guards) {
      const sees = coneSees(guard.x, guard.y, guard.angle, GUARD.visionRange, GUARD.visionHalfAngle, player.x, player.y);
      if (sees) {
        seenByGuard = true;
        guard.lastSeen = { x: player.x, y: player.y };
        const dist = Math.hypot(player.x - guard.x, player.y - guard.y);
        const proximity = 1.5 - dist / GUARD.visionRange;
        const rate = GUARD.suspicionRise * Math.max(0.35, proximity) * (player.sneak ? 0.45 : 1);
        const before = guard.suspicion;
        guard.suspicion = Math.min(1, guard.suspicion + rate * dt);
        if (before < 0.35 && guard.suspicion >= 0.35) events |= EVENT_SUSPICIOUS;
        guard.angle = Math.atan2(player.y - guard.y, player.x - guard.x);
        if (guard.suspicion >= 1) {
          guard.state = 'alert';
          guardAlert = true;
          guard.loseTimer = 0;
        } else if (guard.suspicion >= 0.35) {
          guard.state = 'suspicious';
        }
      } else {
        guard.suspicion = Math.max(0, guard.suspicion - GUARD.suspicionFall * dt);
        if (guard.state === 'suspicious') {
          if (guard.suspicion < 0.35) {
            // Nothing there after all: back to the patrol, from the nearest waypoint.
            guard.state = 'patrol';
            let nearest = 0;
            let nearestDist = Infinity;
            guard.waypoints.forEach((wp, i) => {
              const d = Math.hypot(wp.x - guard.x, wp.y - guard.y);
              if (d < nearestDist) {
                nearestDist = d;
                nearest = i;
              }
            });
            guard.wpIndex = nearest;
            guard.wpDir = nearest === guard.waypoints.length - 1 ? -1 : 1;
          } else {
            // Walk over to the spot and look: standing still and staring at a
            // moving thief is neither fair nor readable.
            const dx = guard.lastSeen.x - guard.x;
            const dy = guard.lastSeen.y - guard.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 14) {
              guard.angle = Math.atan2(dy, dx);
              moveCircle(guard, (dx / dist) * GUARD.patrolSpeed * dt, (dy / dist) * GUARD.patrolSpeed * dt);
            }
          }
        }
        if (guard.state === 'alert') {
          guard.loseTimer += dt;
          if (guard.loseTimer >= GUARD.giveUpSeconds) {
            guard.state = 'patrol';
            guard.suspicion = 0.3;
            guard.loseTimer = 0;
          }
        }
      }
    }

    // Alert guards chase the thief; a chasing guard that touches the thief busts the run.
    for (const guard of state.guards) {
      if (guard.state !== 'alert') continue;
      const dx = player.x - guard.x;
      const dy = player.y - guard.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        guard.angle = Math.atan2(dy, dx);
        // Axis-separated movement, same as the thief: slides along walls instead of sticking.
        moveCircle(guard, (dx / dist) * GUARD.chaseSpeed * dt, (dy / dist) * GUARD.chaseSpeed * dt);
      }
      if (Math.hypot(player.x - guard.x, player.y - guard.y) < GUARD.catchDistance) {
        return events | bust('caught');
      }
    }

    const seen = seenByCamera || seenByGuard;
    if (seen) {
      state.seenTime += dt;
      if (!state.everSeen) {
        state.everSeen = true;
        events |= EVENT_SEEN;
      }
    }

    // --- Alarm meter ---
    if (!state.tripped) {
      if (seenByCamera) state.alarm += (player.sneak ? ALARM.cameraSneak : ALARM.cameraStand) * dt;
      if (guardAlert) state.alarm += ALARM.guardAlert * dt;
      else if (seenByGuard) {
        const suspicious = state.guards.some((g) => g.state === 'suspicious');
        if (suspicious) state.alarm += ALARM.guardSuspicious * dt;
      }
      if (!seen) state.alarm = Math.max(0, state.alarm - ALARM.decay * dt);
      if (state.alarm >= ALARM.max) {
        state.alarm = ALARM.max;
        state.tripped = true;
        state.tripTimer = ALARM.tripSeconds;
        state.hiddenTimer = 0;
        for (const guard of state.guards) {
          guard.state = 'alert';
          guard.suspicion = 1;
          guard.loseTimer = 0;
        }
        events |= EVENT_ALARM_TRIP;
      }
    } else {
      // Tripped: hide unseen for 2 seconds to disarm, or the countdown ends the run.
      if (seen) state.hiddenTimer = 0;
      else state.hiddenTimer += dt;
      if (state.hiddenTimer >= ALARM.hideToDisarm) {
        state.tripped = false;
        state.alarm = ALARM.disarmLevel;
        for (const guard of state.guards) {
          guard.state = 'patrol';
          guard.suspicion = 0.3;
          guard.loseTimer = 0;
        }
        events |= EVENT_DISARM;
      } else {
        state.tripTimer -= dt;
        if (state.tripTimer <= 0) return events | bust('alarm');
      }
    }

    // --- Lasers: crossing a beam trips the alarm instantly. ---
    if (!state.tripped) {
      for (const laser of state.lasers) {
        if (distToSegment(player.x, player.y, laser.x1, laser.y1, laser.x2, laser.y2) < 11) {
          state.alarm = ALARM.max;
          state.tripped = true;
          state.tripTimer = ALARM.tripSeconds;
          state.hiddenTimer = 0;
          for (const guard of state.guards) {
            guard.state = 'alert';
            guard.suspicion = 1;
            guard.loseTimer = 0;
          }
          events |= EVENT_LASER | EVENT_ALARM_TRIP;
          break;
        }
      }
    }

    // --- Win: the diamond in hand, back at the getaway van. ---
    if (state.diamond.taken) {
      const vanTileX = Math.floor(state.van.x / TILE);
      const vanTileY = Math.floor(state.van.y / TILE);
      const px = Math.floor(player.x / TILE);
      const py = Math.floor(player.y / TILE);
      if (px === vanTileX && py === vanTileY) {
        state.status = 'cleared';
        finishScore();
        return events | EVENT_CLEARED;
      }
    }

    return events;
  }

  loadLevel(0);
  return {
    state,
    step,
    reset,
    nextLevel,
    isWallTile,
    isWallPx,
    hasLineOfSight,
    conePolygon,
    coneSees,
    tileCenter,
  };
}
