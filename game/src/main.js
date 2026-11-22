// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between seven screens:
// title, intro, play, paused, busted, cleared and the final report.
//
// ?seed=N fixes the seed. ?shot=start|play|vault|busted (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const sound = createSound();

// A handle for play-testing and screenshots; the game itself never needs it.
window.__silentVault = { world, state: world.state };

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
  window.__silentVault.screen = scene.screen;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
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
  let accumulator = 0;
  let last = performance.now();
  // An E press is an edge: handleActions() reads the actions once per frame,
  // so it hands the press to the next world step instead of dropping it.
  let interactQueued = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset(0);
    accumulator = 0;
    screen = SCREEN_INTRO;
    announce('The Gallery. Steal the Aurora Diamond and reach the van.');
  }

  function handleEvents(events) {
    if (events & EVENT_PICKUP) sound.pickup();
    if (events & EVENT_PANEL) sound.panel();
    if (events & EVENT_SUSPICIOUS) sound.tick();
    if (events & EVENT_TRIP) sound.alarm();
    if (events & EVENT_BUSTED) {
      sound.busted();
      screen = SCREEN_BUSTED;
      if (world.state.score > best) {
        best = world.state.score;
        saveBest(best);
      }
      announce(`Busted. Score ${world.state.score}.`);
    } else if (events & EVENT_CLEARED) {
      sound.success();
      screen = world.state.status === 'final' ? SCREEN_FINAL : SCREEN_CLEARED;
      if (world.state.score > best) {
        best = world.state.score;
        saveBest(best);
      }
      announce(world.state.status === 'final'
        ? `Heist complete. Final score ${world.state.score}.`
        : `Level clear. Score ${world.state.score}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_INTERACT) interactQueued = true;
    if (actions & ACTION_MUTE) {
      const muted = sound.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_BUSTED)) {
      world.reset(world.state.levelIndex);
      screen = SCREEN_PLAY;
      announce('Level restarted.');
      return;
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) {
        sound.click();
        startGame();
      } else if (screen === SCREEN_INTRO) {
        sound.click();
        screen = SCREEN_PLAY;
        announce('Playing. Stay out of the cones.');
      } else if (screen === SCREEN_BUSTED) {
        sound.click();
        world.reset(world.state.levelIndex);
        screen = SCREEN_PLAY;
        announce('Playing. Stay out of the cones.');
      } else if (screen === SCREEN_CLEARED) {
        sound.click();
        world.nextLevel();
        screen = SCREEN_INTRO;
        announce(`${world.level().name}. ${world.level().sub}`);
      } else if (screen === SCREEN_FINAL) {
        sound.click();
        startGame();
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE || screen === SCREEN_INTRO) {
      world.step(STEP, null, true);
      return;
    }
    const dir = input.direction();
    const interact = interactQueued;
    interactQueued = false;
    const events = world.step(STEP, {
      mx: dir.mx,
      my: dir.my,
      sneak: input.sneak(),
      interact,
    }, false);
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_INTRO || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_INTRO || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
    window.__silentVault.screen = screen;
  }

  // Leaving the tab pauses a running game rather than letting guards walk unseen.
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
