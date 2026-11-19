// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. Screens: title, play, paused, busted,
// wasted. ?seed=N fixes the city; ?shot=cover|street|chase|mission stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot, stageTitleShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);

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
    // Storage can be off: the best run then lasts this visit only.
  }
}

function runShot(name) {
  const scene = name === 'title' ? stageTitleShot(world) : stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen);
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

  function announce(message) {
    status.textContent = message;
  }

  function startNewGame() {
    world.reset();
    world.state.audio.sfx.unlock();
    world.state.audio.startMusic();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing Sunhaven Streets. First mission: steal a car.');
  }

  function continueGame() {
    if (world.loadGame()) {
      world.state.audio.sfx.unlock();
      world.state.audio.startMusic();
      accumulator = 0;
      screen = SCREEN_PLAY;
      announce('Save loaded. Welcome back to Sunhaven.');
    } else {
      announce('No save game yet. Starting a new game.');
      startNewGame();
    }
  }

  // C continues a saved game, M toggles the music, from the title screen.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && screen === SCREEN_TITLE) continueGame();
    if (event.code === 'KeyM') {
      const audio = world.state.audio;
      audio.toggleMuted();
    }
  });

  function handleActions() {
    const actions = input.takeActions();
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startNewGame();
      return actions;
    }
    if (screen === SCREEN_BUSTED) {
      if (actions & ACTION_CONFIRM) {
        world.state.respawnAfterBusted();
        screen = SCREEN_PLAY;
        announce('Released. Back on the streets.');
      }
      return 0;
    }
    if (screen === SCREEN_WASTED) {
      if (actions & ACTION_CONFIRM) {
        world.state.respawnAfterWasted();
        screen = SCREEN_PLAY;
        announce('Discharged from hospital. Back on the streets.');
      }
      return 0;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
        return 0;
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
        // Resume and keep any other key pressed in the same frame (e.g. H to save).
        return actions & ~ACTION_PAUSE;
      }
      return 0;
    }
    if (screen === SCREEN_PAUSED) return 0;
    return actions;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    // Aim with the mouse: convert the pointer to world coordinates.
    const mouse = input.mouse();
    const aimWorld = renderer.screenToWorld(mouse.x, mouse.y, world.state.camera);
    input.setAimAngle(Math.atan2(aimWorld.y - world.state.player.y, aimWorld.x - world.state.player.x));
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        world.step(input, actions, STEP);
        accumulator -= STEP;
      }
      if (world.state.busted) screen = SCREEN_BUSTED;
      else if (world.state.wasted) screen = SCREEN_WASTED;
      else if (world.state.money > best) {
        best = world.state.money;
        saveBest(best);
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen);
  }

  // Leaving the tab pauses a running game rather than letting the city run on.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Sunhaven Streets. Press Space or click to start, C to continue a saved game.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
