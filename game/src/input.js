// Keyboard and click input. Movement keys are read as a held state each
// frame; action keys (confirm, pause, restart, mute, interact) are edges:
// takeActions() returns them once and clears them.

const ACTION_CONFIRM = 1;
const ACTION_PAUSE = 2;
const ACTION_RESTART = 4;
const ACTION_MUTE = 8;
const ACTION_INTERACT = 16;

const MOVE_KEYS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let interactHeld = false;

  function keyDown(event) {
    if (event.repeat) {
      if (MOVE_KEYS[event.code]) event.preventDefault();
      return;
    }
    if (MOVE_KEYS[event.code]) {
      held.add(event.code);
      event.preventDefault();
    } else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      held.add(event.code);
    } else if (event.code === 'Enter' || event.code === 'Space') {
      actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyR') {
      actions |= ACTION_RESTART;
    } else if (event.code === 'KeyM') {
      actions |= ACTION_MUTE;
    } else if (event.code === 'KeyE') {
      actions |= ACTION_INTERACT;
      interactHeld = true;
    }
  }

  function keyUp(event) {
    held.delete(event.code);
    if (event.code === 'KeyE') interactHeld = false;
  }

  function click() {
    actions |= ACTION_CONFIRM;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('pointerdown', click);

  return {
    /** Normalised movement vector from the held keys. */
    direction() {
      let mx = 0;
      let my = 0;
      for (const code of held) {
        const d = MOVE_KEYS[code];
        if (d) {
          mx += d[0];
          my += d[1];
        }
      }
      const len = Math.hypot(mx, my);
      if (len > 0) {
        mx /= len;
        my /= len;
      }
      return { mx, my };
    },
    sneak() {
      return held.has('ShiftLeft') || held.has('ShiftRight');
    },
    interactPressed() {
      return interactHeld;
    },
    takeActions() {
      const out = actions;
      actions = 0;
      return out;
    },
  };
}

