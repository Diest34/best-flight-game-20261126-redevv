// Solara Bay Air Rally — the game loop. Owns the screens (title, play,
// paused, over), the mission lifecycle and the ?shot= scenes, and wires the
// input, the physics, the renderer and the sound together.
import { MISSIONS, STEP, VIEW, WORLD } from './config.js';
import { createAudio } from './audio.js';
import { clearPressed, consumePressed, createInput, readControl } from './input.js';
import {
  EVENT_CRASHED,
  EVENT_LANDED,
  EVENT_OUT_OF_FUEL,
  EVENT_RING,
  EVENT_TIMEOUT,
  createFlight,
  stepFlight,
} from './physics.js';
import { render } from './render.js';
import { stageShot } from './shots.js';
import { buildIslands, buildRings, missionById, startPose } from './terrain.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusLine = document.getElementById('status');

function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') ?? WORLD.seed) || WORLD.seed;

const audio = createAudio();
const input = createInput(canvas);
const best = loadBest();

let screen = 'title';
let selected = 0;
let state = null;
let throttle = 0;
let shotReady = false;

function loadBest() {
  try {
    return JSON.parse(window.localStorage.getItem('solara-bay-best') ?? '{}');
  } catch {
    return {};
  }
}

function saveBest() {
  try {
    window.localStorage.setItem('solara-bay-best', JSON.stringify(best));
  } catch {
    // Best scores are decoration; a browser without storage still plays.
  }
}

function startMission(mission) {
  const islands = buildIslands(seed);
  const rings = buildRings(mission, seed);
  state = createFlight(mission, islands, seed, rings, startPose());
  throttle = 0;
  screen = 'play';
  audio.ensure();
  announce(`${mission.name} started. Fly through ${mission.rings} rings, then land on the runway.`);
}

function announce(text) {
  if (statusLine) statusLine.textContent = text;
}

function endFlight() {
  const id = state.mission.id;
  if (state.score > (best[id] ?? 0)) {
    best[id] = state.score;
    saveBest();
  }
  announce(state.status === 'landed'
    ? `Mission complete. Score ${state.score}.`
    : `Sortie over. ${state.message} Score ${state.score}.`);
}

function frame(now, dtSeconds) {
  const t = now / 1000;
  if (screen === 'title') {
    if (consumePressed(input, 'Enter') || consumePressed(input, 'NumpadEnter')) {
      startMission(MISSIONS[selected]);
    } else if (consumePressed(input, 'ArrowDown') || consumePressed(input, 'KeyS')) {
      selected = (selected + 1) % MISSIONS.length;
    } else if (consumePressed(input, 'ArrowUp') || consumePressed(input, 'KeyW')) {
      selected = (selected - 1 + MISSIONS.length) % MISSIONS.length;
    } else if (consumePressed(input, 'Digit1')) startMission(MISSIONS[0]);
    else if (consumePressed(input, 'Digit2')) startMission(MISSIONS[1]);
    else if (consumePressed(input, 'Digit3')) startMission(MISSIONS[2]);
    if (!state) {
      // The title screen flies over the bay on autopilot behind the menu.
      const staged = stageShot('start', MISSIONS[0], seed);
      state = staged.state;
    }
    render(ctx, canvas, state, 'title', { missions: MISSIONS, selected, best }, t);
  } else if (screen === 'play') {
    if (consumePressed(input, 'KeyP') || consumePressed(input, 'Escape')) {
      screen = 'paused';
      clearPressed(input);
    } else if (consumePressed(input, 'KeyM')) {
      audio.toggleMute();
    } else {
      const control = readControl(input, throttle);
      throttle = control.throttle;
      // Fixed-step physics so the flight feels the same at any frame rate.
      const steps = Math.max(1, Math.min(4, Math.round(dtSeconds / STEP)));
      let events = 0;
      for (let i = 0; i < steps; i += 1) {
        events |= stepFlight(state, control, STEP);
        if (state.status !== 'flying') break;
      }
      audio.setEngine(state.throttle, state.speed);
      if (events & EVENT_RING) audio.ring();
      if (events & EVENT_LANDED) {
        audio.land();
        endFlight();
        screen = 'over';
      } else if (events & (EVENT_CRASHED | EVENT_OUT_OF_FUEL | EVENT_TIMEOUT)) {
        if (events & EVENT_CRASHED) audio.crash();
        endFlight();
        screen = 'over';
      }
    }
    render(ctx, canvas, state, 'play', { missions: MISSIONS, selected, best }, t);
  } else if (screen === 'paused') {
    if (consumePressed(input, 'KeyP') || consumePressed(input, 'Escape')) screen = 'play';
    if (consumePressed(input, 'KeyT')) screen = 'title';
    render(ctx, canvas, state, 'paused', { missions: MISSIONS, selected, best }, t);
  } else if (screen === 'over') {
    if (consumePressed(input, 'Enter') || consumePressed(input, 'NumpadEnter')) {
      startMission(state.mission);
    } else if (consumePressed(input, 'KeyT')) {
      screen = 'title';
      state = null;
    }
    render(ctx, canvas, state, 'over', { missions: MISSIONS, selected, best }, t);
  }
  if (shotName && !shotReady) {
    // Two frames painted: the screenshot tool reads this flag.
    shotReady = true;
    window.__shotReady = true;
    window.__shotDebug = {
      shot: shotName,
      screen,
      status: state?.status,
      altitude: Math.round(state?.altitude ?? 0),
      speed: Math.round(state?.speed ?? 0),
      rings: state ? `${state.ringsPassed}/${state.rings.length}` : '0/0',
      score: state?.score ?? 0,
    };
  }
}

function boot() {
  fitCanvas();
  window.addEventListener('resize', fitCanvas);
  if (shotName) {
    const mission = missionById(params.get('mission') ?? 'ring-run');
    const staged = stageShot(shotName, mission, seed);
    state = staged.state;
    screen = staged.screen;
    // The title scene shows the menu; the others show the flight mid-air.
    if (shotName === 'start') {
      screen = 'title';
    }
    canvas.width = VIEW.width;
    canvas.height = VIEW.height;
    render(ctx, canvas, state, screen, { missions: MISSIONS, selected: 0, best }, 1.2);
    render(ctx, canvas, state, screen, { missions: MISSIONS, selected: 0, best }, 1.25);
    window.__shotReady = true;
    window.__shotDebug = {
      shot: shotName,
      screen,
      status: state.status,
      altitude: Math.round(state.altitude),
      speed: Math.round(state.speed),
      rings: `${state.ringsPassed}/${state.rings.length}`,
      score: state.score,
    };
    return;
  }
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    frame(now, dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

boot();
