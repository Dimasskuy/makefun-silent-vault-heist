// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between screens: title, level intro, play, paused, busted,
// level clear, and the final heist report.
//
// ?seed=N fixes the camera phases. ?shot=start|play|vault|busted (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_ALARM_TRIP, EVENT_BUSTED, EVENT_CLEARED, EVENT_DIAMOND, EVENT_DISARM, EVENT_LASER, EVENT_PANEL, EVENT_PICKUP, EVENT_SUSPICIOUS } from './world.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_CLEAR, SCREEN_FINAL, SCREEN_INTRO, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createSound } from './sound.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas, world);
const sound = createSound();

// A handle for automated play-tests (and curious players): the live world, read-only use.
window.__silentVault = { world, version: '1.0.0' };

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const info = { best: readBest(), muted: sound.isMuted(), totalScore: 0, totalLoot: 0 };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, info);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let totalScore = 0;
  let totalLoot = 0;
  let accumulator = 0;
  let interactUsed = false;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startLevel() {
    world.reset();
    screen = SCREEN_PLAY;
    announce(`Playing. ${world.state.level.name}.`);
  }

  function showIntro() {
    screen = SCREEN_INTRO;
    announce(`${world.state.level.name}. ${world.state.level.sub}`);
  }

  function playSounds(events) {
    if (events & EVENT_PICKUP) sound.pickup();
    if (events & EVENT_DIAMOND) sound.diamond();
    if (events & EVENT_PANEL) sound.panel();
    if (events & EVENT_SUSPICIOUS) sound.suspicious();
    if (events & EVENT_LASER) sound.laser();
    if (events & EVENT_ALARM_TRIP) sound.alarm();
    if (events & EVENT_DISARM) sound.click();
    if (events & EVENT_BUSTED) sound.busted();
    if (events & EVENT_CLEARED) sound.clear();
  }

  function endLevel() {
    const state = world.state;
    totalScore += state.score;
    totalLoot += state.lootValue + (state.diamond.taken ? 1000 : 0);
    if (state.status === 'busted') {
      screen = SCREEN_BUSTED;
      if (totalScore > best) {
        best = totalScore;
        saveBest(best);
      }
      announce(`Busted. Score ${state.score}.`);
    } else {
      screen = SCREEN_CLEAR;
      announce(`Level clear. Score ${state.score}.`);
    }
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = sound.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        sound.unlock();
        sound.click();
        totalScore = 0;
        totalLoot = 0;
        world.reset();
        showIntro();
      }
      return;
    }
    if (screen === SCREEN_INTRO) {
      if (actions & ACTION_CONFIRM) {
        sound.unlock();
        sound.click();
        startLevel();
      }
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (actions & ACTION_RESTART) {
        world.reset();
        announce('Level restarted.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (actions & ACTION_RESTART) {
        world.reset();
        screen = SCREEN_PLAY;
        announce('Level restarted.');
      }
      return;
    }
    if (screen === SCREEN_BUSTED) {
      if (actions & ACTION_RESTART) {
        totalScore = Math.max(0, totalScore - world.state.score);
        totalLoot = Math.max(0, totalLoot - (world.state.lootValue + (world.state.diamond.taken ? 1000 : 0)));
        world.reset();
        screen = SCREEN_PLAY;
        announce('Retrying the level.');
      } else if (actions & ACTION_CONFIRM) {
        screen = SCREEN_TITLE;
        announce('SILENT VAULT. Press Enter or click to start.');
      }
      return;
    }
    if (screen === SCREEN_CLEAR) {
      if (actions & ACTION_CONFIRM) {
        if (world.nextLevel()) showIntro();
        else {
          screen = SCREEN_FINAL;
          if (totalScore > best) {
            best = totalScore;
            saveBest(best);
          }
          announce(`Heist complete. Total score ${totalScore}.`);
        }
      }
      return;
    }
    if (screen === SCREEN_FINAL) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_TITLE;
        announce('SILENT VAULT. Press Enter or click to start.');
      }
    }
  }

  function step(actions) {
    if (screen === SCREEN_TITLE || screen === SCREEN_INTRO) {
      world.step(STEP, null, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const vector = input.vector();
    const interact = !!(actions & ACTION_INTERACT) && !interactUsed;
    interactUsed = interactUsed || interact;
    const events = world.step(STEP, {
      mx: vector.mx,
      my: vector.my,
      sneak: input.sneak(),
      interact,
    }, false);
    playSounds(events);
    if (events & (EVENT_BUSTED | EVENT_CLEARED)) endLevel();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    interactUsed = false;
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_INTRO || screen === SCREEN_PLAY)) {
      step(actions);
      accumulator -= STEP;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_INTRO && screen !== SCREEN_PLAY) accumulator = 0;
    renderer.draw(world.state, screen, { best, muted: sound.isMuted(), totalScore, totalLoot });
  }

  // Leaving the tab pauses a running game rather than letting the alarm fill unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('SILENT VAULT. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
