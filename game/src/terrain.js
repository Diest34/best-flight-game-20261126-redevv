// Solara Bay itself: the islands, the runway island, the ring course and the
// ground height under any point. Everything is built from the mission seed,
// so the same mission always flies over the same bay.
import { MISSIONS, RUNWAY, WORLD } from './config.js';
import { makeRng, noise2, range } from './random.js';

const METRES_PER_FOOT = 0.3048;

/** One island: a centre, a radius and a peak height in feet. */
export function buildIslands(seed) {
  const rng = makeRng(seed * 31 + 5);
  const islands = [
    // Home island: flat, holds the runway.
    { x: 0, z: 0, radius: 1500, peak: 60, home: true },
  ];
  for (let i = 1; i < WORLD.islandCount; i += 1) {
    const angle = (i / (WORLD.islandCount - 1)) * Math.PI * 2 + range(rng, -0.3, 0.3);
    const dist = range(rng, 2600, 7000);
    islands.push({
      x: Math.sin(angle) * dist,
      z: Math.cos(angle) * dist,
      radius: range(rng, 500, 1100),
      peak: range(rng, 120, 620),
      home: false,
    });
  }
  return islands;
}

/** Ground height in feet at world (x, z): 0 over the sea, hills on islands. */
export function groundHeightAt(islands, seed, x, z) {
  let height = 0;
  for (const island of islands) {
    const dx = x - island.x;
    const dz = z - island.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= island.radius) continue;
    const falloff = 1 - d / island.radius;
    const shape = 0.6 + 0.4 * noise2(x / 420, z / 420, seed);
    const h = island.peak * falloff * falloff * shape;
    if (h > height) height = h;
  }
  // The runway is graded flat: carve the ground down to sea level on the
  // strip itself, blending back to the island's height 250 m out, so a plane
  // can sit on the runway and the hills never poke through the tarmac.
  const rdx = x - RUNWAY.x;
  const rdz = z - RUNWAY.z;
  const along = Math.sin(RUNWAY.heading) * rdx + Math.cos(RUNWAY.heading) * rdz;
  const across = Math.cos(RUNWAY.heading) * rdx - Math.sin(RUNWAY.heading) * rdz;
  const outside = Math.max(
    Math.abs(along) - RUNWAY.length / 2,
    Math.abs(across) - RUNWAY.width / 2,
    0,
  );
  const blend = Math.min(1, outside / 250);
  const smooth = blend * blend * (3 - 2 * blend);
  return height * smooth;
}

/**
 * The ring course for a mission: hoops strung along a gentle circuit of the
 * bay, each with a position and an altitude in feet, alternating low over the
 * water and high over the islands so the pilot works the throttle.
 */
export function buildRings(mission, seed) {
  const rng = makeRng(seed * 101 + mission.rings);
  const rings = [];
  const count = mission.rings;
  for (let i = 0; i < count; i += 1) {
    const t = (i + 1) / (count + 1);
    const angle = t * Math.PI * 1.3 + 0.4;
    const dist = 1500 + Math.sin(t * Math.PI) * 1800 + range(rng, -250, 250);
    const x = Math.sin(angle) * dist;
    const z = Math.cos(angle) * dist + 1200;
    const high = i % 3 === 2;
    rings.push({
      x,
      z,
      altitude: high ? range(rng, 1100, 1400) : range(rng, 500, 900),
      passed: false,
    });
  }
  // The last ring swings back toward the runway for the landing.
  const last = rings[rings.length - 1];
  last.x = 300;
  last.z = 1200;
  last.altitude = 700;
  return rings;
}

/** Starting state: on the runway threshold, facing down the strip. */
export function startPose() {
  return {
    x: RUNWAY.x,
    z: RUNWAY.z - RUNWAY.length / 2 + 60,
    altitude: 0,
    heading: RUNWAY.heading,
    speed: 0,
    throttle: 0,
  };
}

export function feetToMetres(feet) {
  return feet * METRES_PER_FOOT;
}

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}
