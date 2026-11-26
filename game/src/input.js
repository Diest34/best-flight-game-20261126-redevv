// Keyboard and mouse input. Arrows or WASD fly the plane, W/S work the
// throttle, and moving the mouse steers toward the pointer as well — both
// feed the same control object the physics steps.
export function createInput(canvas) {
  const keys = new Set();
  const input = {
    keys,
    mouseX: 0.5, // 0..1 across the canvas
    mouseY: 0.5, // 0..1 down the canvas
    mouseActive: false,
    pressed: new Set(), // keys pressed since the last poll
  };

  const onKeyDown = (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat) input.pressed.add(event.code);
    keys.add(event.code);
  };
  const onKeyUp = (event) => keys.delete(event.code);
  const onMouse = (event) => {
    const rect = canvas.getBoundingClientRect();
    input.mouseX = (event.clientX - rect.left) / Math.max(1, rect.width);
    input.mouseY = (event.clientY - rect.top) / Math.max(1, rect.height);
    input.mouseActive = true;
  };
  const onBlur = () => keys.clear();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointermove', onMouse);
  canvas.addEventListener('pointerdown', onMouse);

  input.destroy = () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('pointermove', onMouse);
    canvas.removeEventListener('pointerdown', onMouse);
  };
  return input;
}

/** Read the current control from the input. `throttle` carries over so the lever stays put. */
export function readControl(input, throttle) {
  const k = input.keys;
  let pitch = 0;
  let roll = 0;
  if (k.has('ArrowUp')) pitch += 1;
  if (k.has('ArrowDown')) pitch -= 1;
  if (k.has('ArrowLeft') || k.has('KeyA')) roll -= 1;
  if (k.has('ArrowRight') || k.has('KeyD')) roll += 1;
  if (k.has('KeyW')) throttle = Math.min(1, throttle + 0.012);
  if (k.has('KeyS')) throttle = Math.max(0, throttle - 0.012);
  if (input.mouseActive) {
    const mx = (input.mouseX - 0.5) * 2;
    const my = (input.mouseY - 0.5) * 2;
    if (Math.abs(mx) > 0.12) roll += Math.max(-1, Math.min(1, mx * 1.4));
    if (Math.abs(my) > 0.12) pitch -= Math.max(-1, Math.min(1, my * 1.2));
  }
  return {
    pitch: Math.max(-1, Math.min(1, pitch)),
    roll: Math.max(-1, Math.min(1, roll)),
    throttle,
  };
}

/** True once when the key was pressed since the last call; clears the set. */
export function consumePressed(input, code) {
  if (input.pressed.has(code)) {
    input.pressed.delete(code);
    return true;
  }
  return false;
}

export function clearPressed(input) {
  input.pressed.clear();
}
