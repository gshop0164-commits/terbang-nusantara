// Screenshot scenes behind ?shot=cover|flight|ring|landing. Each one plays
// the real rules forward from a fresh world for a fixed time, steered by a
// simple autopilot (aim at the next ring or runway, hold the throttle, flare
// for landing), so the frame is what a short game really looks like and the
// same seed always gives the same frame.
import { STEP, LEGS, FT_PER_M } from './config.js';
import { resetLeg, step, nextTarget, groundHeightAt, EVENT_OVER, EVENT_LEG } from './world.js';

const SAMPLE = STEP;

/** Steer toward the next ring or runway: returns the stick for this step. */
function autopilot(world) {
  const p = world.plane;
  const target = nextTarget(world);
  const dz = Math.max(1, target.z - p.z);
  const dx = target.x - p.x;
  // Heading that points at the target, in degrees.
  const wantHeading = (Math.atan2(dx, dz) * 180) / Math.PI;
  let dHeading = wantHeading - p.headingDeg;
  if (dHeading > 180) dHeading -= 360;
  if (dHeading < -180) dHeading += 360;
  const roll = Math.max(-1, Math.min(1, dHeading / 12));
  const clamp01 = (v) => Math.max(-1, Math.min(1, v));
  let pitch;
  let throttle;
  if (!p.airborne) {
    // Full power on the runway, rotate at speed.
    throttle = 1;
    pitch = p.speedKt >= 78 ? 1 : 0;
  } else if (target.kind === 'runway' && dz <= 1000) {
    // Final: a shallow glide slope down to the threshold, flaps out.
    const wantAltM = Math.max(0, (dz - 200) * 0.06);
    pitch = clamp01((wantAltM - p.altM) / 60);
    throttle = p.speedKt < 110 ? 0.3 : -0.3;
  } else {
    // Cruise: toward the ring's altitude, or toward the runway holding at
    // least 60 m, and never below the terrain 400 m ahead plus a margin,
    // so the descent after the volcano ring does not fly into the mountain.
    const safeAltM = groundHeightAt(world.route, p.z + 400, p.x) + 90;
    const wantAltM = target.kind === 'ring' ? Math.max(target.altM, safeAltM) : Math.max(60, safeAltM);
    pitch = clamp01((wantAltM - p.altM) / 120);
    throttle = p.speedKt < 150 ? 0.5 : 0;
  }
  return {
    pitch,
    roll,
    throttle,
    flaps: target.kind === 'runway' && dz < 900 && !p.flaps,
  };
}

/** Run the world forward with the autopilot until `stop` says enough. */
function flyUntil(world, stop, maxSeconds = 400) {
  let events = 0;
  for (let t = 0; t < maxSeconds / SAMPLE; t += 1) {
    events = step(world, autopilot(world), SAMPLE);
    if (events & EVENT_OVER) break;
    if (stop(world, events)) break;
  }
  return events;
}

/**
 * Set `world` to the named scene and return the screen to draw over it, the
 * best score to show, and whether to use the cockpit camera.
 */
export function stageShot(name, world) {
  resetLeg(world, 0);
  world.score = 0;
  world.lives = 3;
  if (name === 'flight') {
    flyUntil(world, (w) => w.plane.z > 2400 && w.plane.altM > 250);
    return { screen: 'play', best: 0, cockpit: false };
  }
  if (name === 'ring') {
    // Stop just short of the second ring so it fills the frame ahead.
    flyUntil(world, (w) => {
      const ring = w.route.rings.find((r) => r.leg === 0 && r.z > w.plane.z + 150);
      return ring !== undefined && ring.z - w.plane.z < 420;
    });
    return { screen: 'play', best: 0, cockpit: false };
  }
  if (name === 'landing') {
    // Final approach to the leg-1 runway: low, slow, flaps out, gear down.
    flyUntil(world, (w) => w.plane.z > 4300 && w.plane.altM < 90 && w.plane.airborne);
    return { screen: 'play', best: 0, cockpit: true };
  }
  // Cover: just airborne after takeoff, island and first ring ahead, with the
  // slim title banner on top and the whole scene visible beneath it.
  flyUntil(world, (w) => w.plane.altM > 90 && w.plane.z > 700, 60);
  return { screen: 'title', best: 0, cockpit: false };
}
