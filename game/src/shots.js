// The screenshot scenes behind ?shot=start|play|vault|busted. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a small
// autopilot (breadth-first path on the tile grid, then walk it), so the frame is what a
// short game really looks like and the same seed always gives the same frame.
import { STEP, TILE } from './config.js';
import { SCREEN_BUSTED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const LIMIT_SECONDS = 40;

/** Breadth-first path of tile centres from the thief to (tx, ty); [] when unreachable. */
function findPath(world, tx, ty) {
  const state = world.state;
  const sx = Math.floor(state.player.x / TILE);
  const sy = Math.floor(state.player.y / TILE);
  const key = (x, y) => `${x},${y}`;
  const prev = new Map([[key(sx, sy), null]]);
  const queue = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === tx && y === ty) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (world.isWallTile(nx, ny) || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), [x, y]);
      queue.push([nx, ny]);
    }
  }
  if (!prev.has(key(tx, ty))) return [];
  const path = [];
  let cur = [tx, ty];
  while (cur) {
    path.unshift(cur);
    cur = prev.get(key(cur[0], cur[1]));
  }
  return path;
}

/** One step of the autopilot: steer toward the next path tile, or stand still. */
function autopilotStep(world, path, index, sneak) {
  const state = world.state;
  while (index < path.length) {
    const [tx, ty] = path[index];
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    if (Math.hypot(cx - state.player.x, cy - state.player.y) < 8) {
      index += 1;
      continue;
    }
    const dx = cx - state.player.x;
    const dy = cy - state.player.y;
    const len = Math.hypot(dx, dy);
    return { input: { mx: dx / len, my: dy / len, sneak, interact: false }, index };
  }
  return { input: { mx: 0, my: 0, sneak, interact: false }, index };
}

function walkTo(world, tx, ty, seconds, sneak) {
  const path = findPath(world, tx, ty);
  let index = 1;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.state.status !== 'playing') break;
    const { input, index: next } = autopilotStep(world, path, index, sneak);
    index = next;
    world.step(STEP, input, false);
  }
}

function standStill(world, seconds, sneak) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (world.state.status !== 'playing') break;
    world.step(STEP, { mx: 0, my: 0, sneak, interact: false }, false);
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: title over a live museum backdrop. play: the hero frame — the thief
 * mid-room, a guard cone, a camera cone, the diamond and a part-filled alarm meter.
 * vault: level 3, thief at the vault door, lasers and diamond in view.
 * busted: the thief walks into a guard's patrol and gets caught.
 */
export function stageShot(name, world) {
  if (name === 'play') {
    world.reset();
    walkTo(world, 15, 9, 30, true);
    standStill(world, 2.2, true);
    return { screen: world.state.status === 'playing' ? SCREEN_PLAY : SCREEN_BUSTED };
  }
  if (name === 'vault') {
    world.reset();
    // Jump straight to level 3, then walk to the vault door.
    world.nextLevel();
    world.nextLevel();
    walkTo(world, 25, 12, 38, true);
    standStill(world, 1.5, true);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'busted') {
    world.reset();
    walkTo(world, 15, 4, 20, false);
    standStill(world, 25, false);
    return { screen: world.state.status === 'busted' ? SCREEN_BUSTED : SCREEN_PLAY };
  }
  world.reset();
  for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, null, true);
  return { screen: SCREEN_TITLE };
}
