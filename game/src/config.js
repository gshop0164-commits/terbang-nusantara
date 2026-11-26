// Terbang Nusantara — configuration: view, physics, route layout, missions.
// One clear job: every number the game tunes lives here, so the rest of the
// code names what it does instead of hiding magic numbers.
export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const SEG_LEN = 25; // metres per terrain segment
export const DRAW_DIST = 90; // segments drawn ahead of the camera
export const CAM_DEPTH = 0.84; // 1 / tan(fov / 2), fov ~ 100 degrees
export const CAM_BACK = 14; // metres the chase camera sits behind the aircraft
export const CAM_UP = 4; // metres the chase camera sits above the aircraft
export const WORLD_HALF = 2400; // metres either side of the route the ground spans

// Flight model (arcade, tuned so a leg takes about two minutes).
export const FLIGHT = {
  maxSpeedKt: 210,
  stallKt: 68,
  rotateKt: 78, // speed that lets the aircraft lift off the runway
  landMaxKt: 150, // fastest touchdown that still counts as a landing
  groundAccelKt: 14, // knots per second gained on the runway
  airAccelKt: 7, // knots per second gained or lost in the air
  maxAltM: 1850, // soft ceiling, about 6,000 ft
  climbFactor: 0.085, // climb ft/s per knot per degree of pitch
  levelPitch: 1.2, // degrees of pitch that hold level flight
  maxPitchUp: 14,
  maxPitchDown: -8,
  pitchRate: 14, // degrees per second the nose answers
  maxBank: 38, // degrees of roll at full stick
  rollRate: 70, // degrees per second the wings answer
  turnFactor: 0.28, // heading degrees per second per degree of bank
  fuelDrainBase: 0.1, // percent per second at idle
  fuelDrainThrottle: 0.0011, // extra percent per second per throttle point
  hardLandingVs: -14, // ft/s of descent that damages on touchdown (a 3-degree glide at 110 kt is about -11)
  hardDamage: 30,
  ringScore: 100,
  landingScore: 500,
  lives: 3,
};

// The route: three island-hopping legs. Each leg starts on a runway, crosses
// sea and one island, and ends on the next island's runway. Distances are
// metres along the route; ring altitudes are feet.
export const LEGS = [
  {
    name: 'Leg 1 — Lepas Landas',
    sub: 'Bintan ke Batam, empat cincin di atas laut',
    from: 0,
    to: 5200,
    dusk: false,
    features: [
      { from: 0, to: 500, kind: 'runway', name: 'Bintan' },
      { from: 500, to: 2600, kind: 'sea' },
      { from: 2600, to: 4000, kind: 'volcano', name: 'Merapi', peak: 320 },
      { from: 4000, to: 4700, kind: 'sea' },
      { from: 4700, to: 5200, kind: 'runway', name: 'Batam' },
    ],
    rings: [
      { dz: 1200, x: -300, altFt: 900, r: 55 },
      { dz: 2200, x: 400, altFt: 1400, r: 55 },
      { dz: 3200, x: 0, altFt: 1800, r: 60 },
      { dz: 4400, x: -200, altFt: 1200, r: 55 },
    ],
  },
  {
    name: 'Leg 2 — Cincin Merapi',
    sub: 'Lima cincin mengelilingi gunung, mendarat di Karimun',
    from: 5200,
    to: 10800,
    dusk: false,
    features: [
      { from: 5200, to: 5700, kind: 'runway', name: 'Batam' },
      { from: 5700, to: 6800, kind: 'sea' },
      { from: 6800, to: 8200, kind: 'hills', name: 'Karimun', peak: 150 },
      { from: 8200, to: 10300, kind: 'sea' },
      { from: 10300, to: 10800, kind: 'runway', name: 'Karimun' },
    ],
    rings: [
      { dz: 1000, x: 300, altFt: 1000, r: 55 },
      { dz: 2100, x: -500, altFt: 1600, r: 55 },
      { dz: 2700, x: 500, altFt: 1200, r: 55 },
      { dz: 3800, x: -300, altFt: 900, r: 55 },
      { dz: 4700, x: 200, altFt: 700, r: 55 },
    ],
  },
  {
    name: 'Leg 3 — Senja Nusantara',
    sub: 'Enam cincin terakhir di bawah langit senja',
    from: 10800,
    to: 16400,
    dusk: true,
    features: [
      { from: 10800, to: 11300, kind: 'runway', name: 'Karimun' },
      { from: 11300, to: 12000, kind: 'sea' },
      { from: 12000, to: 13600, kind: 'terraces', name: 'Lombok', peak: 110 },
      { from: 13600, to: 15900, kind: 'sea' },
      { from: 15900, to: 16400, kind: 'runway', name: 'Lombok' },
    ],
    rings: [
      { dz: 1000, x: -400, altFt: 1100, r: 55 },
      { dz: 1800, x: 400, altFt: 1500, r: 55 },
      { dz: 2400, x: 0, altFt: 1300, r: 55 },
      { dz: 3400, x: -500, altFt: 1000, r: 55 },
      { dz: 4200, x: 500, altFt: 900, r: 55 },
      { dz: 4800, x: -200, altFt: 700, r: 55 },
    ],
  },
];

export const TOTAL_Z = 16400;
export const FT_PER_M = 3.28084;
export const M_PER_FT = 0.3048;
export const MS_PER_KT = 0.514444;
export const KT_PER_MS = 1.94384;
