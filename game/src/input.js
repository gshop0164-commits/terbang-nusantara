// Terbang Nusantara — keyboard and mouse input. One job: turn raw events
// into the stick the flight model reads, with edge-triggered presses.
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Set(), // keys pressed since the last poll
    mouse: { x: 0, y: 0, clicked: false, down: false },
  };
  const code = (event) => event.code;
  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (!event.repeat) input.pressed.add(code(event));
    input.keys.add(code(event));
  });
  window.addEventListener('keyup', (event) => input.keys.delete(code(event)));
  window.addEventListener('blur', () => input.keys.clear());
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    input.mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    input.mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    input.mouse.down = true;
    input.mouse.clicked = true;
  });
  window.addEventListener('pointerup', () => {
    input.mouse.down = false;
  });
  return input;
}

/** The stick this frame: pitch, roll, throttle lever movement, flaps edge. */
export function readStick(input) {
  const down = (...codes) => codes.some((c) => input.keys.has(c));
  const pitch = (down('ArrowUp', 'KeyW') ? 1 : 0) + (down('ArrowDown', 'KeyS') ? -1 : 0);
  const roll = (down('ArrowRight', 'KeyD') ? 1 : 0) + (down('ArrowLeft', 'KeyA') ? -1 : 0);
  // Throttle: Shift (or E) up, Control (or Q) down; W/S already steer pitch.
  const throttle = (down('ShiftLeft', 'ShiftRight', 'KeyE') ? 1 : 0) + (down('ControlLeft', 'ControlRight', 'KeyQ') ? -1 : 0);
  return {
    pitch,
    roll,
    throttle,
    flaps: input.pressed.has('Space'),
  };
}

/** True once for a key pressed since the last frame; call after reading. */
export function wasPressed(input, ...codes) {
  return codes.some((c) => input.pressed.has(c));
}

/** Clear the edge-triggered sets at the end of a frame. */
export function endFrame(input) {
  input.pressed.clear();
  input.mouse.clicked = false;
}
