// The screenshot scenes behind ?shot=start|play|vault|busted. Each one plays
// the real rules forward from a fresh world, steered by a small autopilot
// (a breadth-first path, crossed only when no guard's cone covers the next
// tile), so the frame is what a short game really looks like and the same
// seed always gives the same frame.

const START_SECONDS = 5;
const MAX_SECONDS = 90;

/** True when any guard's cone currently covers the given point. Cameras do
 * not count: standing in a camera cone only raises the alarm, which is what
 * the hero shot wants. */
function watchedByGuard(world, x, y) {
  const s = world.state;
  for (const g of s.guards) {
    if (world.coneSees(g.x, g.y, g.angle, 230, 0.55, x, y)) return true;
  }
  return false;
}

/** Step the world toward `target` (a tile centre) until close, waiting out
 * a guard's cone when the next tile is watched and this spot is safe. */
function walkTo(world, target, timeoutSeconds) {
  const s = world.state;
  let waited = 0;
  let steps = 0;
  const limit = Math.ceil(timeoutSeconds / STEP);
  while (steps < limit) {
    const dx = target.x - s.player.x;
    const dy = target.y - s.player.y;
    if (Math.hypot(dx, dy) < 7) return true;
    const nextWatched = watchedByGuard(world, target.x, target.y);
    const hereWatched = watchedByGuard(world, s.player.x, s.player.y);
    if (nextWatched && !hereWatched && waited < 6) {
      world.step(STEP, { mx: 0, my: 0, sneak: false, interact: false }, false);
      waited += STEP;
    } else {
      const len = Math.hypot(dx, dy) || 1;
      world.step(STEP, { mx: dx / len, my: dy / len, sneak: false, interact: false }, false);
      waited = 0;
    }
    if (s.status !== 'playing') return false;
    steps += 1;
  }
  return false;
}

function followPath(world, path, timeoutSeconds) {
  for (const point of path) {
    if (!walkTo(world, point, timeoutSeconds)) return false;
  }
  return true;
}

function stand(world, seconds) {
  const steps = Math.ceil(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, { mx: 0, my: 0, sneak: false, interact: false }, false);
    if (world.state.status !== 'playing') return false;
  }
  return true;
}

function tileOf(world, x, y) {
  return { x: Math.floor(x / TILE), y: Math.floor(y / TILE) };
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. start: the title over a living museum. play: the
 * hero — the thief mid-room, a guard cone and a camera cone in view, the
 * diamond glowing, the alarm part-filled. vault: inside the laser vault.
 * busted: the thief stands on a patrol line until a guard catches them.
 */
function stageShot(name, world) {
  if (name !== 'play' && name !== 'vault' && name !== 'busted') {
    world.reset(0);
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, null, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }

  if (name === 'vault') {
    world.reset(2);
    const s = world.state;
    const from = tileOf(world, s.player.x, s.player.y);
    const path = world.findPath(from.x, from.y, 22, 3);
    if (path) followPath(world, path.slice(1), MAX_SECONDS);
    stand(world, 1.5);
    return { screen: SCREEN_PLAY, best: 0 };
  }

  if (name === 'busted') {
    world.reset(0);
    const s = world.state;
    const from = tileOf(world, s.player.x, s.player.y);
    const path = world.findPath(from.x, from.y, 15, 7);
    if (path) followPath(world, path.slice(1), MAX_SECONDS);
    // Stand on the patrol line: a guard walks into the thief.
    for (let i = 0; i < 20 / STEP; i += 1) {
      world.step(STEP, { mx: 0, my: 0, sneak: false, interact: false }, false);
      if (world.state.status === 'busted') break;
    }
    return { screen: SCREEN_BUSTED, best: 0 };
  }

  // play: the hero frame on level 1. The thief waits in the south hall at
  // (14,12): inside the camera's sweep (so the alarm meter fills part-way)
  // but out of every guard's cone, so no guard turns alert mid-pose.
  world.reset(0);
  const s = world.state;
  const from = tileOf(world, s.player.x, s.player.y);
  const path = world.findPath(from.x, from.y, 14, 12);
  if (path) followPath(world, path.slice(1), MAX_SECONDS);
  // Stand in the camera's sweep so the alarm meter fills part-way (4 s is
  // most of one sweep period, so the fill does not depend on the phase).
  stand(world, 4.0);
  return { screen: SCREEN_PLAY, best: 0 };
}
