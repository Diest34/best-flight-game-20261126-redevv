// The screenshot scenes behind ?shot=start|play|ring|end. Each one flies the
// real rules forward from a fresh flight for a fixed number of steps, steered
// by a simple autopilot (turn toward the next ring, climb or dive to its
// altitude, hold the throttle), so the frame is what a real sortie looks like
// and the same seed always gives the same frame.
import { STEP } from './config.js';
import { createFlight, onRunway, stepFlight } from './physics.js';
import { buildIslands, buildRings, startPose } from './terrain.js';

export const SHOT_SECONDS = { start: 0, play: 34, ring: 52, end: 400 };

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/** Steer toward the next ring: bank into the turn, pitch to its altitude. */
export function autopilot(state) {
  const next = state.rings[state.ringsPassed];
  let targetHeading = state.heading;
  let targetAlt = state.altitude + 400;
  if (next) {
    targetHeading = Math.atan2(next.x - state.x, next.z - state.z);
    targetAlt = next.altitude;
  } else {
    // No rings left: fly home. First to a point south of the strip so the
    // final approach runs north, down the runway heading; then descend
    // onto the threshold itself at landing speed.
    const distSouth = Math.hypot(state.x - 0, state.z - -1600);
    if (distSouth <= 700) state.landingFinal = true;
    if (state.landingFinal) {
      // Steer onto the centreline with a 350 m lookahead, then run north
      // down the runway line: the approach is a straight line through the
      // strip, not an orbit of one point.
      const across = state.x - 0;
      targetHeading = Math.atan2(-across, 350);
      const distThreshold = Math.hypot(state.x - 0, state.z - -390);
      targetAlt = Math.max(0, (distThreshold - 60) * 0.12);
    } else {
      targetHeading = Math.atan2(0 - state.x, -1600 - state.z);
      targetAlt = 150;
    }
  }
  const headingError = wrapAngle(targetHeading - state.heading);
  const roll = Math.max(-1, Math.min(1, headingError * 1.6));
  const altError = targetAlt - state.altitude;
  let pitch = Math.max(-1, Math.min(1, altError / 100));
  // Low over the strip on final: stop chasing the glide path and settle
  // onto the tarmac instead of floating past the threshold.
  if (state.landingFinal && onRunway(state) && state.altitude < 40) {
    pitch = -0.15;
  }
  // Slow down near a ring so the turn tightens and the hoop is hittable.
  let throttle = 0.72;
  if (next) {
    const dist = Math.hypot(next.x - state.x, next.z - state.z);
    if (dist < 700) throttle = 0.5;
  } else {
    // On the way home, cruise to the south point, then hold landing speed
    // for the final approach.
    const distSouth = Math.hypot(state.x - 0, state.z - -1600);
    throttle = state.landingFinal || distSouth <= 400 ? 0.15 : 0.55;
  }
  if (state.altitude < 60 && state.speed < 80) throttle = 1;
  return { pitch, roll, throttle };
}

/**
 * Run a fresh flight forward for the named scene and return the state plus
 * the screen to draw over it. The end scene flies until it lands or the step
 * budget runs out, whichever comes first.
 */
export function stageShot(name, mission, seed) {
  const islands = buildIslands(seed);
  const rings = buildRings(mission, seed);
  const state = createFlight(mission, islands, seed, rings, startPose());
  const seconds = SHOT_SECONDS[name] ?? SHOT_SECONDS.start;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (state.status !== 'flying') break;
    const events = stepFlight(state, autopilot(state), STEP);
    void events;
  }
  if (name === 'start') return { state, screen: 'title' };
  if (name === 'end') return { state, screen: state.status === 'flying' ? 'play' : 'over' };
  return { state, screen: 'play' };
}
