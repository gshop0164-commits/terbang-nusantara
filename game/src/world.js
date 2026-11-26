// Terbang Nusantara — the world: route, terrain, rings, and the flight model.
// Pure logic, no DOM and no canvas: the Node logic test imports this file and
// flies whole legs, so every rule the browser game uses lives here.
import { FLIGHT, LEGS, SEG_LEN, TOTAL_Z, FT_PER_M, MS_PER_KT } from './config.js';
import { makeRng } from './random.js';

export const STEP = 1 / 60;
export const EVENT_RING = 1;
export const EVENT_LEG = 2;
export const EVENT_CRASH = 4;
export const EVENT_OVER = 8;
export const EVENT_WIN = 16;
export const EVENT_TOUCHDOWN = 32;

/** Build the route: one segment per 25 m, plus rings, runways and clouds. */
export function buildRoute(seed) {
  const rng = makeRng(seed);
  const count = Math.ceil(TOTAL_Z / SEG_LEN) + 2;
  const segments = [];
  for (let i = 0; i < count; i += 1) {
    const z = i * SEG_LEN;
    const feature = featureAt(z);
    let type = 'sea';
    let elev = 0;
    let halfWidth = 0;
    if (feature.kind === 'runway') {
      type = 'runway';
      elev = 2;
      halfWidth = 1200;
    } else if (feature.kind === 'sea') {
      type = 'sea';
      elev = 0;
      halfWidth = 0;
    } else {
      // island kinds: volcano, hills, terraces — a smooth bump, beach at the rim
      const span = feature.to - feature.from;
      const t = (z - feature.from) / span;
      const bump = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.8);
      elev = feature.peak * bump;
      halfWidth = 950;
      type = t < 0.08 || t > 0.92 ? 'beach' : feature.kind;
    }
    const objects = [];
    if (type === 'beach' && rng.chance(0.35)) {
      objects.push({ kind: 'palm', x: rng.pick([-1, 1]) * rng.range(700, 900), s: rng.range(0.8, 1.3) });
    }
    if ((type === 'hills' || type === 'terraces') && rng.chance(0.22)) {
      objects.push({ kind: rng.pick(['tree', 'house', 'tree']), x: rng.range(-800, 800), s: rng.range(0.8, 1.4) });
    }
    if (type === 'runway' && rng.chance(0.12)) {
      objects.push({ kind: 'house', x: rng.pick([-1, 1]) * rng.range(180, 320), s: 1 });
    }
    segments.push({ z, type, elev, halfWidth, shade: i % 2 === 0 ? 0 : 1, objects });
  }
  const rings = [];
  for (const leg of LEGS) {
    for (const ring of leg.rings) {
      rings.push({
        z: leg.from + ring.dz,
        x: ring.x,
        altM: ring.altFt * 0.3048,
        r: ring.r,
        leg: LEGS.indexOf(leg),
        passed: false,
        missed: false,
      });
    }
  }
  rings.sort((a, b) => a.z - b.z);
  const clouds = [];
  for (let i = 0; i < 46; i += 1) {
    clouds.push({
      z: rng.range(0, TOTAL_Z),
      x: rng.range(-2200, 2200),
      altM: rng.range(240, 700),
      s: rng.range(0.7, 1.8),
      drift: rng.range(2, 9),
    });
  }
  return { segments, rings, clouds, seed };
}

function featureAt(z) {
  for (const leg of LEGS) {
    for (const f of leg.features) {
      if (z >= f.from && z < f.to) return f;
    }
  }
  return LEGS[LEGS.length - 1].features[LEGS[LEGS.length - 1].features.length - 1];
}

export function legAt(z) {
  for (let i = 0; i < LEGS.length; i += 1) {
    if (z >= LEGS[i].from && z < LEGS[i].to) return i;
  }
  return LEGS.length - 1;
}

export function segmentAt(route, z) {
  const i = Math.floor(z / SEG_LEN);
  return route.segments[Math.min(route.segments.length - 1, Math.max(0, i))];
}

/** Ground height in metres at (z, x): island bump inside the land, sea at 0. */
export function groundHeightAt(route, z, x) {
  const seg = segmentAt(route, z);
  if (seg.type === 'sea' || seg.halfWidth === 0) return 0;
  const ax = Math.abs(x);
  if (ax >= seg.halfWidth) return 0;
  const fall = Math.cos((ax / seg.halfWidth) * (Math.PI / 2));
  return seg.elev * Math.pow(Math.max(0, fall), 0.7);
}

export function isRunway(route, z) {
  return segmentAt(route, z).type === 'runway';
}

/** Fresh state for a whole run. */
export function createWorld(seed = 20261126) {
  const route = buildRoute(seed);
  const world = {
    route,
    seed,
    screen: 'title',
    legIndex: 0,
    score: 0,
    best: 0,
    lives: FLIGHT.lives,
    time: 0,
    message: '',
    messageAt: 0,
    plane: null,
    legScore: 0,
    legStartScore: 0,
    legDamage: 0,
    ringsHit: 0,
    ringsTotal: route.rings.length,
    combo: 1,
    stall: false,
    lowFuel: false,
  };
  resetLeg(world, 0);
  return world;
}

/** Put the aircraft at the start of a leg, on its runway, ready to roll. */
export function resetLeg(world, legIndex) {
  const leg = LEGS[legIndex];
  for (const ring of world.route.rings) {
    if (ring.leg === legIndex) {
      ring.passed = false;
      ring.missed = false;
    }
  }
  world.legIndex = legIndex;
  world.plane = {
    z: leg.from + 60,
    x: 0,
    altM: 0,
    headingDeg: 0,
    speedKt: 0,
    pitchDeg: 0,
    rollDeg: 0,
    throttle: 0,
    flaps: false,
    fuel: 100,
    damage: 0,
    airborne: false,
    rolling: false, // true while rolling out after a touchdown, until takeoff
    vsFtS: 0,
    legTime: 0,
    checkpointZ: leg.from + 60,
    checkpointAltM: 0,
  };
  world.legScore = 0;
  world.legStartScore = world.score;
  world.legDamage = 0;
  world.combo = 1;
  world.stall = false;
  world.lowFuel = false;
}

/** The next ring or runway the pilot is aiming for. */
export function nextTarget(world) {
  const p = world.plane;
  for (const ring of world.route.rings) {
    if (ring.leg === world.legIndex && !ring.passed && !ring.missed && ring.z > p.z - 10) return { kind: 'ring', ...ring };
  }
  const leg = LEGS[world.legIndex];
  return { kind: 'runway', z: leg.to - 500, x: 0, altM: 0 }; // the threshold
}

function approach(current, target, rate, dt) {
  if (current < target) return Math.min(target, current + rate * dt);
  return Math.max(target, current - rate * dt);
}

/**
 * Advance the flight model one fixed step. `input` carries the pilot's stick:
 * pitch (-1 down .. 1 up), roll (-1 left .. 1 right), throttle (-1 .. 1, held
 * keys move the lever), flaps (edge-triggered toggle). Returns an event mask.
 */
export function step(world, input, dt) {
  const p = world.plane;
  const leg = LEGS[world.legIndex];
  let events = 0;
  world.time += dt;
  p.legTime += dt;
  const prevZ = p.z;

  // Throttle lever and flaps.
  p.throttle = Math.min(100, Math.max(0, p.throttle + (input.throttle || 0) * 45 * dt));
  if (p.fuel <= 0) p.throttle = 0;
  if (input.flaps) p.flaps = !p.flaps;

  // Pitch and roll answer the stick.
  const pitchTarget = input.pitch * (input.pitch > 0 ? FLIGHT.maxPitchUp : -FLIGHT.maxPitchDown);
  p.pitchDeg = approach(p.pitchDeg, pitchTarget, FLIGHT.pitchRate, dt);
  const rollTarget = input.roll * FLIGHT.maxBank;
  p.rollDeg = approach(p.rollDeg, rollTarget, FLIGHT.rollRate, dt);

  const speedMs = p.speedKt * MS_PER_KT;
  const groundH = groundHeightAt(world.route, p.z, p.x);
  const onGround = !p.airborne && p.altM <= groundH + 0.5;

  if (onGround) {
    // Rolling on the runway: throttle builds speed; steering only bites
    // once the aircraft is actually moving, or it would spin on the spot.
    const target = (p.throttle / 100) * 190 * (p.flaps ? 0.85 : 1);
    p.speedKt = approach(p.speedKt, target, FLIGHT.groundAccelKt, dt);
    p.headingDeg += p.rollDeg * 0.12 * dt * Math.min(1, p.speedKt / 40);
    if (p.speedKt >= FLIGHT.rotateKt && (input.pitch > 0 || p.throttle > 85)) {
      p.airborne = true;
      p.rolling = false;
      p.altM = groundH + 1;
    }
  } else {
    // In the air: throttle sets a target speed, pitch trades speed for climb.
    let target = 45 + p.throttle * 1.55;
    if (p.flaps) target -= 20;
    const climbFtS = (p.pitchDeg - FLIGHT.levelPitch) * p.speedKt * FLIGHT.climbFactor;
    target -= Math.max(0, climbFtS) * 0.02;
    p.speedKt = approach(p.speedKt, Math.max(40, target), FLIGHT.airAccelKt, dt);
    p.vsFtS = climbFtS;
    world.stall = p.speedKt < FLIGHT.stallKt;
    if (world.stall) p.vsFtS = Math.min(p.vsFtS, -8);
    // Soft ceiling: lift fades above 1,500 m.
    if (p.altM > 1500) p.vsFtS -= (p.altM - 1500) * 0.02;
    p.altM += (p.vsFtS * 0.3048) * dt;
    p.altM = Math.max(0, Math.min(FLIGHT.maxAltM, p.altM));
    p.headingDeg += p.rollDeg * FLIGHT.turnFactor * (p.speedKt / 180) * dt;
    if (p.headingDeg > 180) p.headingDeg -= 360;
    if (p.headingDeg < -180) p.headingDeg += 360;
  }

  // Move along the route; heading steers sideways, bank slides a little too.
  const headingRad = (p.headingDeg * Math.PI) / 180;
  const ms = p.speedKt * MS_PER_KT;
  p.z += Math.cos(headingRad) * ms * dt;
  p.x += Math.sin(headingRad) * ms * dt + (p.rollDeg / FLIGHT.maxBank) * ms * 0.12 * dt;
  p.x = Math.max(-2200, Math.min(2200, p.x));

  // Fuel drains with the throttle; empty tanks mean a glide.
  p.fuel = Math.max(0, p.fuel - (FLIGHT.fuelDrainBase + p.throttle * FLIGHT.fuelDrainThrottle) * dt);
  world.lowFuel = p.fuel < 20;

  // Rings: crossing one inside its circle scores, crossing outside breaks the combo.
  for (const ring of world.route.rings) {
    if (ring.leg !== world.legIndex || ring.passed || ring.missed) continue;
    if (prevZ < ring.z && p.z >= ring.z) {
      const dx = p.x - ring.x;
      const dy = p.altM - ring.altM;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= ring.r) {
        ring.passed = true;
        const gained = FLIGHT.ringScore * world.combo;
        world.score += gained;
        world.legScore += gained;
        world.ringsHit += 1;
        world.combo = Math.min(5, world.combo + 1);
        p.checkpointZ = ring.z;
        p.checkpointAltM = ring.altM;
        world.message = `Cincin! +${gained}`;
        world.messageAt = world.time;
        events |= EVENT_RING;
      } else {
        ring.missed = true;
        world.combo = 1;
      }
    }
  }

  // Ground contact: a gentle touchdown on a runway lands, anything else crashes.
  const newGroundH = groundHeightAt(world.route, p.z, p.x);
  if (p.airborne && p.altM <= newGroundH) {
    const onRunway = isRunway(world.route, p.z) && Math.abs(p.x) < 45;
    if (onRunway && p.speedKt < FLIGHT.landMaxKt && p.vsFtS > FLIGHT.hardLandingVs) {
      p.airborne = false;
      p.rolling = true;
      p.altM = newGroundH;
      p.pitchDeg = 0;
      p.vsFtS = 0;
      p.throttle = 0; // cut the throttle on touchdown so the rollout can stop
      events |= EVENT_TOUCHDOWN;
      world.message = 'Mendarat mulus';
      world.messageAt = world.time;
    } else if (onRunway && p.speedKt < FLIGHT.landMaxKt) {
      // Hard landing: damage, then a bounce back into the air.
      p.damage += FLIGHT.hardDamage;
      world.legDamage += FLIGHT.hardDamage;
      p.altM = newGroundH + 3;
      p.vsFtS = 4;
      world.message = 'Mendarat keras! Kerusakan +' + FLIGHT.hardDamage;
      world.messageAt = world.time;
      if (p.damage >= 100) {
        events |= crash(world);
      }
    } else {
      events |= crash(world);
    }
  }

  // Rolling out after a touchdown on the destination runway ends the leg.
  // (Only after a touchdown: the same decay must not fight the takeoff roll.)
  if (p.rolling && !p.airborne && p.altM <= groundHeightAt(world.route, p.z, p.x) + 0.5) {
    p.speedKt = approach(p.speedKt, 0, 25, dt);
    const dest = LEGS[world.legIndex];
    if (isRunway(world.route, p.z) && p.z > dest.to - 520 && p.speedKt < 25 && p.z > dest.from + 1000) {
      const fuelBonus = Math.round(p.fuel * 2);
      const cleanBonus = world.legDamage === 0 ? 150 : 0;
      const gained = FLIGHT.landingScore + fuelBonus + cleanBonus;
      world.score += gained;
      world.legScore += gained;
      events |= EVENT_LEG;
      world.message = `Leg selesai! +${gained}`;
      world.messageAt = world.time;
    }
  }

  // Missed approach: flew past the destination runway without landing.
  // No life lost — the tower sends the aircraft around for another try,
  // back to the start of the final approach.
  if (p.airborne && p.z > leg.to + 300) {
    p.z = leg.to - 1200; // 1,200 m out sits over the sea on every leg
    p.x = 0;
    p.altM = Math.max(150, groundHeightAt(world.route, p.z + 400, 0) + 120);
    p.headingDeg = 0;
    p.speedKt = 120;
    p.pitchDeg = 0;
    p.rollDeg = 0;
    p.throttle = 60;
    world.message = 'Melewati landasan — putar balik untuk mendarat';
    world.messageAt = world.time;
  }

  // Ran past the end of the route without landing: count as a crash.
  if (p.z >= TOTAL_Z + 200) {
    events |= crash(world);
  }
  return events;
}

/** A crash costs a life and respawns at the last ring, or ends the run. */
export function crash(world) {
  const p = world.plane;
  world.lives -= 1;
  world.combo = 1;
  world.message = world.lives > 0 ? 'Jatuh! Pesawat cadangan diterbangkan' : 'Pesawat habis!';
  world.messageAt = world.time;
  if (world.lives <= 0) return EVENT_CRASH | EVENT_OVER;
  p.z = Math.max(LEGS[world.legIndex].from + 60, p.checkpointZ - 800);
  p.x = 0;
  // Respawn above the terrain ahead, not inside the mountain just flown into.
  p.altM = Math.max(150, p.checkpointAltM, groundHeightAt(world.route, p.z + 400, 0) + 120);
  p.headingDeg = 0;
  p.speedKt = 120;
  p.pitchDeg = 0;
  p.rollDeg = 0;
  p.throttle = 70;
  p.damage = 0;
  p.airborne = true;
  p.vsFtS = 0;
  return EVENT_CRASH;
}

/** Advance to the next leg after a leg-complete; true when the run is won. */
export function nextLeg(world) {
  if (world.legIndex + 1 >= LEGS.length) return true;
  resetLeg(world, world.legIndex + 1);
  return false;
}

/** Altitude in feet, speed in knots, heading in degrees — what the HUD shows. */
export function hud(world) {
  const p = world.plane;
  return {
    altFt: Math.round(p.altM * FT_PER_M),
    speedKt: Math.round(p.speedKt),
    headingDeg: Math.round(((p.headingDeg % 360) + 360) % 360),
    fuel: Math.round(p.fuel),
    throttle: Math.round(p.throttle),
    damage: Math.round(p.damage),
    vsFtS: Math.round(p.vsFtS),
    score: world.score,
    lives: world.lives,
    leg: world.legIndex + 1,
    legs: LEGS.length,
    combo: world.combo,
  };
}
