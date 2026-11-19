// Keyboard and mouse input. Held keys give movement and driving; one-shot
// presses (confirm, pause, enter car, punch, shoot, save) are queued as bit
// flags and taken once by the loop, so a press between two frames is never
// lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_SHOOT = 16;
export const ACTION_SAVE = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const SHOOT = new Set(['KeyG']);
const SAVE = new Set(['KeyH']);

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, run: false };
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let aimAngle = null;

  function press(code, event) {
    if (UP.has(code)) held.up = true;
    else if (DOWN.has(code)) held.down = true;
    else if (LEFT.has(code)) held.left = true;
    else if (RIGHT.has(code)) held.right = true;
    else if (RUN.has(code)) held.run = true;
    else if (CONFIRM.has(code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else if (PAUSE.has(code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (ENTER.has(code)) { if (!event.repeat) actions |= ACTION_ENTER; }
    else if (PUNCH.has(code)) { if (!event.repeat) actions |= ACTION_PUNCH; }
    else if (SHOOT.has(code)) { if (!event.repeat) actions |= ACTION_SHOOT; }
    else if (SAVE.has(code)) { if (!event.repeat) actions |= ACTION_SAVE; }
    else return false;
    return true;
  }

  window.addEventListener('keydown', (event) => {
    if (press(event.code, event)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (RUN.has(event.code)) held.run = false;
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    held.up = held.down = held.left = held.right = held.run = false;
    mouseDown = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('pointerup', () => { mouseDown = false; });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });

  return {
    held,
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Normalised move vector from WASD / arrows (-1..1 on each axis). */
    moveVector() {
      const x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      const y = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      const len = Math.hypot(x, y);
      if (len === 0) return { x: 0, y: 0 };
      return { x: x / len, y: y / len };
    },
    /** Mouse position in CSS pixels relative to the canvas, for aiming. */
    mouse() { return { x: mouseX, y: mouseY, down: mouseDown }; },
    /** The aim angle the game set from the mouse this frame, or null. */
    mouseAimAngle() { return aimAngle; },
    setAimAngle(angle) { aimAngle = angle; },
  };
}
