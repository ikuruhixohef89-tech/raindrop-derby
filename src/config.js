// All tuning numbers live here. The simulation (src/sim) never touches the DOM or Three.js.
// World: a car windshield seen from inside. x runs left to right, y runs from the top (0) to the dashboard (H).

export const W = 16;
export const H = 8;
export const GRID_W = 256; // trail / grime / wax grid
export const GRID_H = 128;
export const CELL = W / GRID_W;
export const R1 = 0.16; // radius of a drop with mass 1
export const RACERS = 6;

export const TUNING = {
  countdown: 3.4, // seconds on the grid before GO
  startMass: 1.2,
  minMass: 0.55,
  maxMass: 7,

  // Motion: a drop slides when (its radius x the pull on it) beats how hard the glass holds it. Bigger = faster.
  pin: 0.1,
  drive: 1,
  speedK: 2.1,
  maxSpeed: 2.6,
  tau0: 0.12,
  tau1: 0.45,
  grimePin: 0.95, // dirty glass: pinning x(1 + this)
  wetPin: 0.55, // someone else's fresh trail: pinning x(1 - this)
  draftBoost: 0.85, // and speed + this
  waxPin: 0.7, // wax lane (hydrophobic strip)
  waxBoost: 0.55,
  rainGrow: 0.07, // rain keeps landing on every drop: mass per second per unit of rain, so nobody stays stuck forever
  windUp: 0.4, // wind pushes drops up the windshield...
  windSide: 0.4, // ...and out toward the pillars
  steerSpeed: 1.2, // sideways speed at full steering (units per second)
  steerGrime: 0.55,
  steerCost: 0.2, // turning costs this share of the downward speed
  shed: 0.04, // mass lost per unit of distance
  wetDecay: 0.1, // trails last about ten seconds

  // Flow: swallow droplets in a row to build a chain, every link adds speed.
  chainWindow: 1.7,
  chainMax: 8,
  chainBoost: 0.1,

  // Cling: stick to the glass. Immune to wipers, splashes, turns. Cannot move.
  clingTime: 2.4,
  clingRecover: 3.6,
  clingLockout: 1.3,

  // Eating and biting.
  absorbEff: 0.9,
  absorbReach: 0.55,
  lunge: 0.7,
  biteShare: 0.22,
  biteCooldown: 1.3,

  // Splash wave from an oncoming truck.
  splashWarn: 1.7,
  splashSweep: 1.8,
  splashBand: 1.5,
  splashShove: 5,

  // Wipers.
  wiperLen: 6.1,
  wiperBlade: 0.42,
  wiperWarn: 1.5,
  wiperHitLoss: 0.5, // share of mass lost
  wiperThrow: 1.6, // thrown back up the glass
  wiperStun: 0.7,

  // Bugs.
  bugPenalty: 0.12,
  bugCooldown: 0.8,

  // Car events.
  brakeWarn: 1.4,
  brakeDur: 1.25,
  brakeBoost: 1.1,
  turnWarn: 1.4,
  turnDur: 1.6,
  turnPush: 1.5,
  potholeWarn: 1.2,
  potholeLoss: 0.1,

  maxDroplets: 80,
  endGrace: 2.4, // seconds after the player finishes before the results appear
  lapCutoff: 10, // survival: seconds after the winner before the lap is cut and the last drop is wiped
  timeout: 70,
};

// Heats of the cup. cut = the player must finish this high to go on.
export const STAGES = [
  {
    id: 'parked',
    name: 'Parked Drizzle',
    blurb: 'Engine off, gentle rain. Warm up and learn the glass.',
    wind: 0,
    carSpeed: 0,
    rain: 0.6,
    initialDroplets: 46,
    grime: 0.25,
    wax: 1,
    bugs: 0,
    wipers: { every: 15, sweep: 2.4 },
    carEvents: 0,
    splashEvery: 0,
    startSpan: [2.2, 13.8],
    skillBonus: -0.06,
    cut: 4,
    difficulty: 1,
    sky: 0,
  },
  {
    id: 'city',
    name: 'City Drive',
    blurb: 'Dirty glass, bugs, wipers and trucks that love puddles.',
    wind: 0.35,
    carSpeed: 0.45,
    rain: 0.9,
    initialDroplets: 52,
    grime: 0.6,
    wax: 2,
    bugs: 4,
    wipers: { every: 10, sweep: 1.9 },
    carEvents: 8,
    splashEvery: 14,
    startSpan: [2.2, 13.8],
    skillBonus: 0.02,
    cut: 3,
    difficulty: 2,
    sky: 1,
  },
  {
    id: 'highway',
    name: 'Highway Storm',
    blurb: 'Eighty miles an hour. The wind pushes you up the glass.',
    wind: 0.8,
    carSpeed: 1,
    rain: 1.3,
    initialDroplets: 60,
    grime: 0.45,
    wax: 2,
    bugs: 6,
    wipers: { every: 7.5, sweep: 1.5 },
    carEvents: 5.5,
    splashEvery: 10,
    startSpan: [2.2, 13.8],
    skillBonus: 0.1,
    cut: 1, // the final: win it
    difficulty: 3,
    sky: 2,
  },
];

// Rivals. skill 0..1, style changes what the drop cares about.
export const RIVALS = [
  { name: 'Dewey', style: 'rail', skill: 0.66, color: [0.38, 0.68, 1.0] },
  { name: 'Blob', style: 'hunter', skill: 0.6, color: [0.45, 0.95, 0.55] },
  { name: 'Puddles', style: 'bully', skill: 0.7, color: [0.78, 0.5, 1.0] },
  { name: 'Mizzle', style: 'dodger', skill: 0.64, color: [1.0, 0.5, 0.75] },
  { name: 'Squish', style: 'hunter', skill: 0.55, color: [0.4, 0.92, 0.95] },
];

export const PLAYER = { name: 'You', color: [1.0, 0.8, 0.34] };
