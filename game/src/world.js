// The rules of SILENT VAULT, no drawing here. The world is stepped in fixed
// 1/60 s slices by main.js; every rule is a pure function of the state, so a
// seeded run replays exactly the same way.

const EVENT_NONE = 0;
const EVENT_PICKUP = 1;
const EVENT_PANEL = 2;
const EVENT_SUSPICIOUS = 4;
const EVENT_TRIP = 8;
const EVENT_BUSTED = 16;
const EVENT_CLEARED = 32;
const EVENT_CREAK = 64;

const TAU = Math.PI * 2;

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function tileCenter(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

function tileAt(level, tx, ty) {
  if (ty < 0 || ty >= level.map.length) return '#';
  const row = level.map[ty];
  if (tx < 0 || tx >= row.length) return '#';
  return row[tx];
}

function isWallTile(level, tx, ty) {
  return tileAt(level, tx, ty) === '#';
}

function pointInWall(level, px, py) {
  return isWallTile(level, Math.floor(px / TILE), Math.floor(py / TILE));
}

/** True when no wall tile stands between the two points (sampled every 6 px). */
function hasLineOfSight(level, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 6));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (pointInWall(level, x0 + dx * t, y0 + dy * t)) return false;
  }
  return true;
}

/** A cone (origin, facing, range, half-angle) sees a point when it is inside
 * the angle, inside the range and the line of sight is not walled off. */
function coneSees(level, ox, oy, angle, range, halfAngle, tx, ty) {
  const dx = tx - ox;
  const dy = ty - oy;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return false;
  if (dist < 1) return true;
  if (Math.abs(wrapAngle(Math.atan2(dy, dx) - angle)) > halfAngle) return false;
  return hasLineOfSight(level, ox, oy, tx, ty);
}

/** Distance from a point to a line segment, in pixels. */
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + dx * t;
  const cy = y1 + dy * t;
  return Math.hypot(px - cx, py - cy);
}

/** Slide a circle through the tile map: move on x, then on y, stopping the
 * axis that would push the circle into a wall. */
function moveCircle(level, pos, radius, dx, dy) {
  const hitsWall = (x, y) => {
    const minTx = Math.floor((x - radius) / TILE);
    const maxTx = Math.floor((x + radius) / TILE);
    const minTy = Math.floor((y - radius) / TILE);
    const maxTy = Math.floor((y + radius) / TILE);
    for (let ty = minTy; ty <= maxTy; ty += 1) {
      for (let tx = minTx; tx <= maxTx; tx += 1) {
        if (!isWallTile(level, tx, ty)) continue;
        const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
        const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
        if (Math.hypot(x - cx, y - cy) < radius) return true;
      }
    }
    return false;
  };
  if (dx !== 0 && !hitsWall(pos.x + dx, pos.y)) pos.x += dx;
  if (dy !== 0 && !hitsWall(pos.x, pos.y + dy)) pos.y += dy;
}

/** Breadth-first path over floor tiles, as a list of tile centres. */
function findPath(level, sx, sy, tx, ty) {
  if (isWallTile(level, tx, ty)) return null;
  const key = (x, y) => `${x},${y}`;
  const prev = new Map([[key(sx, sy), null]]);
  const queue = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === tx && y === ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (isWallTile(level, nx, ny) || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), [x, y]);
      queue.push([nx, ny]);
    }
  }
  if (!prev.has(key(tx, ty))) return null;
  const path = [];
  let cur = [tx, ty];
  while (cur) {
    path.unshift(tileCenter(cur[0], cur[1]));
    cur = prev.get(key(cur[0], cur[1]));
  }
  return path;
}

function findMarker(level, ch) {
  for (let y = 0; y < level.map.length; y += 1) {
    for (let x = 0; x < level.map[y].length; x += 1) {
      if (level.map[y][x] === ch) return { x, y };
    }
  }
  return null;
}

function createWorld(random) {
  const state = {
    levelIndex: 0,
    status: 'playing',
    time: 0,
    elapsed: 0,
    player: { x: 0, y: 0, angle: 0, sneak: false },
    guards: [],
    cameras: [],
    loot: [],
    diamond: null,
    panels: [],
    van: null,
    lasers: [],
    alarm: 0,
    tripped: false,
    tripTimer: 0,
    hideTimer: 0,
    everSeen: false,
    score: 0,
    lootValue: 0,
    timeBonus: 0,
    ghostBonus: 0,
    bustedReason: '',
    particles: [],
    floaters: [],
    trauma: 0,
    creakFlash: 0,
  };

  function reset(levelIndex) {
    // No argument means "restart the level we are on" (the play-test
    // autopilot and the R key both rely on that).
    if (levelIndex === undefined) levelIndex = state.levelIndex;
    const level = LEVELS[levelIndex];
    state.levelIndex = levelIndex;
    state.status = 'playing';
    state.time = 0;
    state.elapsed = 0;
    const start = findMarker(level, 'T');
    const sp = tileCenter(start.x, start.y);
    state.player = { x: sp.x, y: sp.y, angle: 0, sneak: false, walkPhase: 0, moving: false };
    state.guards = level.guards.map((g) => {
      const wps = g.waypoints.map(([tx, ty]) => tileCenter(tx, ty));
      const next = wps[1] ?? wps[0];
      return {
        x: wps[0].x,
        y: wps[0].y,
        angle: Math.atan2(next.y - wps[0].y, next.x - wps[0].x),
        waypoints: wps,
        wp: 1 % wps.length,
        state: 'patrol',
        suspicion: 0,
        lastSeen: null,
        lostTimer: 0,
        scan: 0,
        walkPhase: 0,
        stateTime: 0,
        moving: false,
      };
    });
    state.cameras = level.cameras.map((c, i) => {
      const p = tileCenter(c.x, c.y);
      return {
        x: p.x,
        y: p.y,
        baseAngle: c.angle,
        arc: c.arc,
        period: c.period,
        angle: c.angle,
        disabled: 0,
        phase: i * 1.7,
      };
    });
    const lootTiles = [];
    for (let y = 0; y < level.map.length; y += 1) {
      for (let x = 0; x < level.map[y].length; x += 1) {
        if (level.map[y][x] === 'L') lootTiles.push([x, y]);
      }
    }
    state.loot = lootTiles.map(([tx, ty], i) => {
      const p = tileCenter(tx, ty);
      const kind = (level.lootKinds && level.lootKinds[i]) || 'gem';
      const label = { gem: 'Permata', painting: 'Lukisan', crown: 'Mahkota', artifact: 'Artefak Emas', vase: 'Vas Antik' }[kind] || 'Loot';
      return { x: p.x, y: p.y, value: level.lootValues[i], kind, label, taken: false };
    });
    const d = findMarker(level, 'D');
    const dp = tileCenter(d.x, d.y);
    state.diamond = { x: dp.x, y: dp.y, taken: false };
    state.panels = level.panels.map((p) => {
      const pp = tileCenter(p.x, p.y);
      return { x: pp.x, y: pp.y, camera: p.camera };
    });
    const v = findMarker(level, 'V');
    state.van = tileCenter(v.x, v.y);
    state.lasers = level.lasers.map((lz) => {
      const a = tileCenter(lz.x1, lz.y1);
      const b = tileCenter(lz.x2, lz.y2);
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    });
    state.alarm = 0;
    state.tripped = false;
    state.tripTimer = 0;
    state.hideTimer = 0;
    state.everSeen = false;
    state.lootValue = 0;
    state.timeBonus = 0;
    state.ghostBonus = 0;
    state.bustedReason = '';
    state.particles = [];
    state.floaters = [];
    state.trauma = 0;
    state.creakFlash = 0;
  }

  /** Screen-shake trauma (game-feel): events add, it decays to zero on its
   * own; the renderer reads trauma^2, so small hits barely nudge. */
  function addTrauma(amount) {
    state.trauma = Math.min(1, state.trauma + amount);
  }

  function floater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, life: FLOATER_LIFE });
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i += 1) {
      const a = random.next() * TAU;
      const sp = 30 + random.next() * 90;
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.5 + random.next() * 0.4,
        color,
      });
    }
  }

  function bust(reason) {
    if (state.status !== 'playing') return EVENT_NONE;
    state.status = 'busted';
    state.bustedReason = reason;
    addTrauma(1);
    return EVENT_BUSTED;
  }

  function stepGuards(dt, level) {
    let events = EVENT_NONE;
    for (const guard of state.guards) {
      const p = state.player;
      const sees = coneSees(
        level, guard.x, guard.y, guard.angle,
        GUARD.visionRange, GUARD.visionHalfAngle, p.x, p.y,
      );
      if (sees) {
        state.everSeen = true;
        guard.lastSeen = { x: p.x, y: p.y };
        guard.lostTimer = 0;
        const dist = Math.hypot(p.x - guard.x, p.y - guard.y);
        const proximity = Math.max(0.3, 1.5 - dist / GUARD.visionRange);
        const sneak = p.sneak ? GUARD.sneakFactor : 1;
        guard.suspicion = Math.min(1, guard.suspicion + GUARD.suspicionRise * proximity * sneak * dt);
        if (guard.suspicion >= 1 && guard.state !== 'alert') {
          guard.state = 'alert';
          events |= EVENT_SUSPICIOUS;
        } else if (guard.suspicion > 0.5 && guard.state === 'patrol') {
          guard.state = 'suspicious';
          events |= EVENT_SUSPICIOUS;
        }
      } else {
        guard.suspicion = Math.max(0, guard.suspicion - GUARD.suspicionFall * dt);
        if (guard.state === 'alert') {
          guard.lostTimer += dt;
          // Hysteresis (game-ai): a minimum time in alert before giving up,
          // so the guard never flickers alert/suspicious on the boundary.
          if (guard.lostTimer >= GUARD.giveUp && guard.stateTime >= 0.4) {
            guard.state = 'suspicious';
            guard.lostTimer = 0;
          }
        } else if (guard.state === 'suspicious' && guard.suspicion < 0.35) {
          guard.state = 'patrol';
          let best = 0;
          let bestDist = Infinity;
          guard.waypoints.forEach((w, i) => {
            const d = Math.hypot(w.x - guard.x, w.y - guard.y);
            if (d < bestDist) {
              bestDist = d;
              best = i;
            }
          });
          guard.wp = best;
        }
      }

      // Movement for the state the guard is in. Fairness (game-ai): an
      // alert guard chases the LAST KNOWN position, not the live player —
      // break sight and it searches where it last saw you.
      const prevState = guard.state;
      guard.moving = false;
      if (guard.state === 'patrol') {
        const target = guard.waypoints[guard.wp];
        const dx = target.x - guard.x;
        const dy = target.y - guard.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 5) {
          guard.wp = (guard.wp + 1) % guard.waypoints.length;
        } else {
          const step = Math.min(GUARD.patrol * dt, dist);
          moveCircle(level, guard, GUARD.radius, (dx / dist) * step, (dy / dist) * step);
          guard.angle = Math.atan2(dy, dx);
          guard.moving = true;
        }
      } else if (guard.state === 'suspicious' && guard.lastSeen) {
        const dx = guard.lastSeen.x - guard.x;
        const dy = guard.lastSeen.y - guard.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 8) {
          // Reached the spot: look around for the thief.
          guard.scan += dt;
          guard.angle += 1.1 * dt;
        } else {
          const step = Math.min(GUARD.patrol * dt, dist);
          moveCircle(level, guard, GUARD.radius, (dx / dist) * step, (dy / dist) * step);
          guard.angle = Math.atan2(dy, dx);
          guard.moving = true;
        }
      } else if (guard.state === 'alert') {
        const target = guard.lastSeen || { x: p.x, y: p.y };
        const dx = target.x - guard.x;
        const dy = target.y - guard.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 10 && !sees) {
          // Lost the trail at the last known spot: scan before giving up.
          guard.scan += dt;
          guard.angle += 1.4 * dt;
          if (guard.scan > 1.5) {
            guard.state = 'suspicious';
            guard.scan = 0;
          }
        } else if (dist > 1) {
          const step = Math.min(GUARD.chase * dt, dist);
          moveCircle(level, guard, GUARD.radius, (dx / dist) * step, (dy / dist) * step);
          guard.moving = true;
        }
        if (dist > 10) guard.angle = Math.atan2(dy, dx);
      }
      if (guard.moving) guard.walkPhase += dt * 7;
      else guard.walkPhase *= 0.9;
      guard.stateTime = guard.state === prevState ? guard.stateTime + dt : 0;

      // A guard touching the thief catches them, whatever the state.
      if (Math.hypot(p.x - guard.x, p.y - guard.y) < GUARD.catchDist) {
        events |= bust('caught');
      }
    }
    return events;
  }

  function step(dt, input, isTitle) {
    const level = LEVELS[state.levelIndex];
    state.time += dt;
    // Juice decays in real step time, so every effect returns to rest.
    state.trauma = Math.max(0, state.trauma - 1.4 * dt);
    state.creakFlash = Math.max(0, state.creakFlash - dt);
    for (const f of state.floaters) {
      f.y -= 24 * dt;
      f.life -= dt;
    }
    state.floaters = state.floaters.filter((f) => f.life > 0);
    if (state.status !== 'playing') {
      for (const part of state.particles) {
        part.x += part.vx * dt;
        part.y += part.vy * dt;
        part.life -= dt;
      }
      state.particles = state.particles.filter((part) => part.life > 0);
      return EVENT_NONE;
    }
    let events = EVENT_NONE;

    // Cameras sweep; a disabled one stays dark until its timer runs out.
    for (const cam of state.cameras) {
      if (cam.disabled > 0) cam.disabled -= dt;
      cam.angle = cam.baseAngle + cam.arc * Math.sin((TAU * state.time) / cam.period + cam.phase);
    }

    if (isTitle) {
      // The title screen shows the museum alive: guards walk, cameras sweep,
      // but nothing can see or catch the thief.
      for (const guard of state.guards) {
        const target = guard.waypoints[guard.wp];
        const dx = target.x - guard.x;
        const dy = target.y - guard.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 5) guard.wp = (guard.wp + 1) % guard.waypoints.length;
        else {
          const step = Math.min(GUARD.patrol * dt, dist);
          moveCircle(level, guard, GUARD.radius, (dx / dist) * step, (dy / dist) * step);
          guard.angle = Math.atan2(dy, dx);
        }
      }
      return EVENT_NONE;
    }

    state.elapsed += dt;
    const p = state.player;

    // The thief moves; sneak is slower and harder to notice.
    if (input) {
      p.sneak = !!input.sneak;
      const len = Math.hypot(input.mx, input.my);
      p.moving = len > 0.01;
      if (len > 0.01) {
        const speed = p.sneak ? PLAYER.sneak : PLAYER.walk;
        const nx = (input.mx / len) * speed * dt;
        const ny = (input.my / len) * speed * dt;
        moveCircle(level, p, PLAYER.radius, nx, ny);
        p.angle = Math.atan2(input.my, input.mx);
        p.walkPhase += dt * 8;
      } else {
        p.walkPhase *= 0.9;
      }
    }

    // Creaky floor (level 4): walking across a 'c' tile is loud — nearby
    // guards hear it and turn suspicious, and the alarm creeps up.
    // Sneaking across is silent. The mechanic is taught on a safe strip
    // (row 4) before it is tested under a camera and a patrol.
    if (input && p.moving && !p.sneak
      && tileAt(level, Math.floor(p.x / TILE), Math.floor(p.y / TILE)) === 'c') {
      state.alarm = Math.min(100, state.alarm + CREAK.alarmPerSecond * dt);
      state.creakFlash = 1.2;
      events |= EVENT_CREAK;
      if (random.next() < 0.25) burst(p.x, p.y + 8, '#c9a227', 1);
      for (const guard of state.guards) {
        if (Math.hypot(guard.x - p.x, guard.y - p.y) > CREAK.hearRadius) continue;
        guard.lastSeen = { x: p.x, y: p.y };
        guard.suspicion = Math.min(1, guard.suspicion + CREAK.suspicionPerSecond * dt);
        if (guard.suspicion > 0.5 && guard.state === 'patrol') {
          guard.state = 'suspicious';
          events |= EVENT_SUSPICIOUS;
        }
      }
    }

    // Who sees the thief right now?
    let seenByCamera = false;
    let seenByGuardSuspicious = false;
    let seenByGuardAlert = false;
    for (const cam of state.cameras) {
      if (cam.disabled > 0) continue;
      if (coneSees(level, cam.x, cam.y, cam.angle, CAMERA.range, CAMERA.halfAngle, p.x, p.y)) {
        seenByCamera = true;
        state.everSeen = true;
      }
    }
    for (const guard of state.guards) {
      if (!coneSees(level, guard.x, guard.y, guard.angle, GUARD.visionRange, GUARD.visionHalfAngle, p.x, p.y)) continue;
      if (guard.state === 'alert') seenByGuardAlert = true;
      else if (guard.state === 'suspicious') seenByGuardSuspicious = true;
    }
    const seen = seenByCamera || seenByGuardSuspicious || seenByGuardAlert
      || state.guards.some((g) => g.state === 'patrol' && coneSees(level, g.x, g.y, g.angle, GUARD.visionRange, GUARD.visionHalfAngle, p.x, p.y));

    // The alarm fills while seen (sneaking slows it) and drains when hidden.
    if (seenByCamera) state.alarm += (p.sneak ? ALARM.cameraSneak : ALARM.cameraStand) * dt;
    if (seenByGuardSuspicious) state.alarm += ALARM.guardSuspicious * dt;
    if (seenByGuardAlert) state.alarm += ALARM.guardAlert * dt;
    if (!seen) state.alarm = Math.max(0, state.alarm - ALARM.decay * dt);
    state.alarm = Math.min(100, state.alarm);

    if (state.alarm >= 100 && !state.tripped) {
      state.tripped = true;
      state.tripTimer = ALARM.tripSeconds;
      state.hideTimer = 0;
      addTrauma(0.65);
      events |= EVENT_TRIP;
    }
    if (state.tripped) {
      state.tripTimer -= dt;
      if (!seen) state.hideTimer += dt;
      else state.hideTimer = 0;
      if (state.hideTimer >= ALARM.hideToDisarm) {
        state.tripped = false;
        state.alarm = ALARM.disarmLevel;
        state.hideTimer = 0;
      } else if (state.tripTimer <= 0) {
        events |= bust('alarm');
        return events;
      }
    }

    events |= stepGuards(dt, level);
    if (state.status !== 'playing') return events;

    // Lasers: touching a beam trips the alarm at once.
    for (const lz of state.lasers) {
      if (distToSegment(p.x, p.y, lz.x1, lz.y1, lz.x2, lz.y2) < PLAYER.radius + LASER.tripDist) {
        if (!state.tripped) {
          state.alarm = 100;
          state.tripped = true;
          state.tripTimer = ALARM.tripSeconds;
          state.hideTimer = 0;
          addTrauma(0.65);
          events |= EVENT_TRIP;
        }
        break;
      }
    }

    // Interact: the nearest thing in reach — loot, the diamond, a panel.
    if (input && input.interact) {
      let best = null;
      let bestDist = 36;
      const consider = (obj, kind) => {
        const d = Math.hypot(obj.x - p.x, obj.y - p.y);
        if (d < bestDist) {
          bestDist = d;
          best = { obj, kind };
        }
      };
      for (const item of state.loot) if (!item.taken) consider(item, 'loot');
      if (!state.diamond.taken) consider(state.diamond, 'diamond');
      for (const panel of state.panels) consider(panel, 'panel');
      if (best) {
        if (best.kind === 'loot') {
          best.obj.taken = true;
          state.lootValue += best.obj.value;
          state.score += best.obj.value;
          burst(best.obj.x, best.obj.y, '#f2c94c', 16);
          floater(best.obj.x, best.obj.y - 14, `+$${best.obj.value}`, '#f2c94c');
          addTrauma(0.18);
          events |= EVENT_PICKUP;
        } else if (best.kind === 'diamond') {
          best.obj.taken = true;
          state.score += SCORE.diamond;
          burst(best.obj.x, best.obj.y, '#7fe7ff', 24);
          floater(best.obj.x, best.obj.y - 14, `+$${SCORE.diamond}`, '#7fe7ff');
          addTrauma(0.3);
          events |= EVENT_PICKUP;
        } else {
          state.cameras[best.obj.camera].disabled = CAMERA.disableSeconds;
          burst(best.obj.x, best.obj.y, '#e5534b', 12);
          floater(best.obj.x, best.obj.y - 14, 'KAMERA OFF', '#ff8a7a');
          addTrauma(0.15);
          events |= EVENT_PANEL;
        }
      }
    }

    // The getaway: diamond in hand, reach the van.
    if (state.diamond.taken && Math.hypot(p.x - state.van.x, p.y - state.van.y) < 44) {
      const under = Math.max(0, level.par - state.elapsed);
      state.timeBonus = Math.round(under * SCORE.timeBonusPerSecond);
      state.ghostBonus = state.everSeen ? 0 : SCORE.ghostBonus;
      state.score += state.timeBonus + state.ghostBonus;
      state.status = state.levelIndex >= LEVELS.length - 1 ? 'final' : 'cleared';
      addTrauma(0.35);
      events |= EVENT_CLEARED;
    }

    for (const part of state.particles) {
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.life -= dt;
    }
    state.particles = state.particles.filter((part) => part.life > 0);
    return events;
  }

  function nextLevel() {
    if (state.levelIndex + 1 < LEVELS.length) {
      reset(state.levelIndex + 1);
      return true;
    }
    return false;
  }

  reset(0);

  return {
    state,
    reset,
    nextLevel,
    step,
    findPath: (sx, sy, tx, ty) => findPath(LEVELS[state.levelIndex], sx, sy, tx, ty),
    isWallTile: (tx, ty) => isWallTile(LEVELS[state.levelIndex], tx, ty),
    coneSees: (ox, oy, angle, range, halfAngle, tx, ty) =>
      coneSees(LEVELS[state.levelIndex], ox, oy, angle, range, halfAngle, tx, ty),
    hasLineOfSight: (x0, y0, x1, y1) => hasLineOfSight(LEVELS[state.levelIndex], x0, y0, x1, y1),
    tileCenter,
    level: () => LEVELS[state.levelIndex],
  };
}

