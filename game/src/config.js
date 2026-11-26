// Tunables for Solara Bay Air Rally: speeds in knots, altitudes in feet,
// distances in metres. One place holds every number the physics, the world
// and the renderer agree on, so a balance change is a one-line edit.
export const VIEW = { width: 1280, height: 720, horizon: 0.42 };
export const STEP = 1 / 60; // physics step, seconds

export const PLANE = {
  minSpeed: 55, // knots: below this the wing stops flying
  maxSpeed: 240,
  cruiseSpeed: 130,
  climbRate: 55, // ft/s at full pitch up and cruise speed
  sinkRate: 90, // ft/s at full pitch down
  turnRate: 0.85, // rad/s at full bank
  maxBank: 1.2, // rad of roll the pilot can hold
  maxPitch: 0.65, // rad of pitch the pilot can hold
  accel: 26, // knots/s toward the throttle's target speed
  fuelBurn: 0.3, // % of tank per second at full throttle
  fuelBurnIdle: 0.06,
  crashSpeed: 190, // knots: hitting terrain above this is always fatal
  landSpeedMax: 95, // knots: faster than this on touchdown is a crash
  landSinkMax: 14, // ft/s of descent on touchdown
  landAlignMax: 0.35, // rad off the runway heading on touchdown
  stallSpeed: 62,
};

export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Ring Run',
    blurb: 'Thread all 8 sky rings over Solara Bay, then bring her home.',
    rings: 8,
    fuel: 100,
    wind: 0,
    timeLimit: 300,
    needLanding: true,
  },
  {
    id: 'island-hop',
    name: 'Island Hop',
    blurb: 'Ten rings across the outer islands, low fuel, no second chances.',
    rings: 10,
    fuel: 90,
    wind: 4,
    timeLimit: 360,
    needLanding: true,
  },
  {
    id: 'storm-run',
    name: 'Storm Run',
    blurb: 'Twelve rings through gusting wind and a setting sun. Veterans only.',
    rings: 12,
    fuel: 100,
    wind: 11,
    timeLimit: 390,
    needLanding: true,
  },
];

export const RUNWAY = {
  x: 0, // centre of the strip, world metres (east)
  z: 0, // centre of the strip, world metres (north)
  heading: 0, // runway points north (+z)
  length: 900,
  width: 46,
};

export const WORLD = {
  seed: 7,
  islandCount: 9,
  ringRadius: 34, // metres: the hoop the plane must pass through
  ringScore: 250,
  landingScore: 1000,
  timeBonusPerSecond: 10,
  fuelBonusPerPercent: 8,
};
