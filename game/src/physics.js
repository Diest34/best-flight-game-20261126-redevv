// The flight model: an arcade plane with throttle, pitch, bank, stall,
// fuel, damage, ring passes and landings. Pure functions over a plain state
// object, so the game, the autopilot and the tests all step the same rules.
import { PLANE, RUNWAY, WORLD } from './config.js';
import { groundHeightAt } from './terrain.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_OUT_OF_FUEL = 8;
export const EVENT_TIMEOUT = 16;

/** A fresh flight for a mission over a bay. */
export function createFlight(mission, islands, seed, rings, pose) {
  return {
    mission,
    islands,
    seed,
    rings,
    x: pose.x,
    z: pose.z,
    altitude: pose.altitude,
    heading: pose.heading,
    pitch: 0,
    roll: 0,
    speed: pose.speed,
    throttle: pose.throttle,
    fuel: mission.fuel,
    damage: 0,
    score: 0,
    ringsPassed: 0,
    timeLeft: mission.timeLimit,
    elapsed: 0,
    verticalSpeed: 0,
    status: 'flying', // flying | landed | crashed | out-of-fuel | timeout
    message: '',
    messageTime: 0,
    windGust: 0,
    landedCleanly: false,
    airborne: false, // true once the plane has left the ground
    landingFinal: false, // autopilot latch: once on final, stay on final
  };
}

function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/** Distance in metres from the plane to the runway centreline. */
export function runwayOffset(state) {
  const dx = state.x - RUNWAY.x;
  const dz = state.z - RUNWAY.z;
  const along = Math.sin(RUNWAY.heading) * dx + Math.cos(RUNWAY.heading) * dz;
  const across = Math.cos(RUNWAY.heading) * dx - Math.sin(RUNWAY.heading) * dz;
  return { along, across };
}

export function onRunway(state) {
  const { along, across } = runwayOffset(state);
  return Math.abs(along) <= RUNWAY.length / 2 && Math.abs(across) <= RUNWAY.width / 2;
}

/**
 * Step the flight by dt seconds. `control` holds pitch (-1..1, up positive),
 * roll (-1..1, right positive) and throttle (0..1). Returns an event mask.
 */
export function stepFlight(state, control, dt) {
  if (state.status !== 'flying') return EVENT_NONE;
  let events = EVENT_NONE;
  state.elapsed += dt;
  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.status = 'timeout';
    state.message = 'Time up — the tower called the sortie.';
    return EVENT_TIMEOUT;
  }

  // Gusts: the wind pushes the nose around, stronger on Storm Run.
  const gust = state.mission.wind;
  if (gust > 0) {
    state.windGust = Math.sin(state.elapsed * 0.9) * gust * 0.02
      + Math.sin(state.elapsed * 2.3) * gust * 0.008;
  } else {
    state.windGust = 0;
  }

  // Throttle chases the lever; speed chases the throttle.
  state.throttle += (control.throttle - state.throttle) * Math.min(1, dt * 1.5);
  const targetSpeed = PLANE.minSpeed + state.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
  state.speed += (targetSpeed - state.speed) * Math.min(1, dt * PLANE.accel / 60);
  if (state.speed < 0) state.speed = 0;

  // Bank turns the plane; pitch trades speed for altitude.
  const targetRoll = control.roll * PLANE.maxBank;
  state.roll += (targetRoll - state.roll) * Math.min(1, dt * 3);
  const turnRate = Math.sin(state.roll) * PLANE.turnRate;
  state.heading = wrapAngle(state.heading + (turnRate + state.windGust) * dt);

  const targetPitch = control.pitch * PLANE.maxPitch;
  state.pitch += (targetPitch - state.pitch) * Math.min(1, dt * 2.5);

  const stalled = state.speed < PLANE.stallSpeed;
  const climbRate = state.pitch >= 0 ? PLANE.climbRate : PLANE.sinkRate;
  let climb = Math.sin(state.pitch) * climbRate * (state.speed / PLANE.cruiseSpeed);
  if (stalled) climb -= (PLANE.stallSpeed - state.speed) * 0.8;
  if (state.altitude <= 0 && climb < 0) climb = 0;
  state.verticalSpeed = climb;
  state.altitude += climb * dt;

  // Fuel: full throttle drinks the tank; gliding sips it.
  const burn = PLANE.fuelBurnIdle + state.throttle * (PLANE.fuelBurn - PLANE.fuelBurnIdle);
  state.fuel -= burn * dt;
  if (state.fuel <= 0) {
    state.fuel = 0;
    state.status = 'out-of-fuel';
    state.message = 'Fuel exhausted — she glides down wherever she is.';
    return EVENT_OUT_OF_FUEL;
  }

  // Move over the ground.
  const metresPerSecond = (state.speed * 0.514444);
  state.x += Math.sin(state.heading) * metresPerSecond * dt;
  state.z += Math.cos(state.heading) * metresPerSecond * dt;

  // Rings: pass within the hoop and it counts.
  const next = state.rings[state.ringsPassed];
  if (next && !next.passed) {
    const dx = state.x - next.x;
    const dz = state.z - next.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const altDiff = Math.abs(state.altitude - next.altitude);
    if (dist < WORLD.ringRadius * 1.6 && altDiff < 150) {
      next.passed = true;
      state.ringsPassed += 1;
      state.score += WORLD.ringScore;
      state.message = `Ring ${state.ringsPassed} of ${state.rings.length} — +${WORLD.ringScore}`;
      state.messageTime = 2.5;
      events |= EVENT_RING;
    }
  }

  // The ground: the sea is forgiving, the hills are not, the runway is home.
  // A plane that has never left the ground is taxiing, not landing: only an
  // airborne plane can land or crash on the ground.
  if (state.altitude > 50) state.airborne = true;
  const ground = groundHeightAt(state.islands, state.seed, state.x, state.z);
  if (state.altitude <= ground) {
    state.altitude = ground;
    if (!state.airborne) return events;
    if (ground <= 1 && onRunway(state)) {
      // Touchdown on the strip: judge it like a landing.
      const align = Math.abs(wrapAngle(state.heading - RUNWAY.heading));
      const gentle = Math.abs(state.verticalSpeed) <= PLANE.landSinkMax;
      const slow = state.speed <= PLANE.landSpeedMax;
      if (gentle && slow && align <= PLANE.landAlignMax) {
        state.status = 'landed';
        state.landedCleanly = true;
        const timeBonus = Math.round(state.timeLeft) * WORLD.timeBonusPerSecond;
        const fuelBonus = Math.round(state.fuel) * WORLD.fuelBonusPerPercent;
        state.score += WORLD.landingScore + timeBonus + fuelBonus;
        state.message = `Landed clean — +${WORLD.landingScore} landing, +${timeBonus} time, +${fuelBonus} fuel`;
        return events | EVENT_LANDED;
      }
      state.status = 'crashed';
      state.damage = 100;
      state.message = 'Hard landing — the undercarriage gave way on the strip.';
      return events | EVENT_CRASHED;
    }
    if (state.speed > PLANE.crashSpeed || ground > 1) {
      state.status = 'crashed';
      state.damage = 100;
      state.message = ground > 1
        ? 'Terrain strike — the hillside came up too fast.'
        : 'Ditched at speed — the sea does not forgive.';
      return events | EVENT_CRASHED;
    }
    // A slow ditching on the water: survivable, sortie over.
    state.status = 'crashed';
    state.damage = 60;
    state.message = 'Ditched in the bay — the crew is safe, the plane is not.';
    return events | EVENT_CRASHED;
  }

  if (state.messageTime > 0) state.messageTime -= dt;
  return events;
}

/** Heading in degrees, 0 = north, for the compass tape. */
export function headingDegrees(state) {
  return ((state.heading * 180) / Math.PI % 360 + 360) % 360;
}
