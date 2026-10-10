// The race itself: drops, rain, trails, hazards, finish rules. No DOM, no Three.js, fully seeded.
import { W, H, GRID_W, GRID_H, CELL, R1, RACERS, TUNING as T, RIVALS, PLAYER } from '../config.js';
import { mulberry32, shuffle } from '../core/rng.js';
import { fbm2, valueNoise2 } from './noise.js';
import { aiThink } from './ai.js';
import { radiusOf, targetVelocity } from './physics.js';
import { buildMods, defaultMods } from './upgrades.js';
import { makeWax, makeBugs, bugHit, makeWipers, updateWipers, makeCarEvents, updateCarEvents } from './hazards.js';

export { radiusOf };

const tv = { vx: 0, vy: 0 };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function makeRacer(id, lane, x, info, isPlayer, mods, skillBoost) {
  return {
    id,
    lane,
    isPlayer,
    name: info.name,
    color: info.color,
    style: info.style || 'rail',
    skill: (info.skill || 0.6) + skillBoost,
    mods,
    x,
    y: 0.38,
    vx: 0,
    vy: 0,
    m: T.startMass + mods.startMass,
    stamina: 1,
    clingLock: 0,
    clinging: false,
    chain: 0,
    chainT: 0,
    stun: 0,
    bugCd: 0,
    wipeCd: 0,
    biteCd: 0,
    biteImmune: 0,
    splashHit: 0,
    seedA: id * 17.3 + 3.1,
    seedB: id * 9.7 + 1.9,
    stretch: 0,
    jiggle: 0,
    aiT: 0.2 + id * 0.04,
    aiSteer: 0,
    aiCling: false,
    finished: false,
    finishTime: null,
    place: 0,
    dist: 0,
    speed: 0,
  };
}

function spawnDroplet(w, x, y) {
  if (w.droplets.length >= T.maxDroplets) return;
  let px = x;
  let py = y;
  for (let tries = 0; tries < 6; tries++) {
    if (x === undefined) {
      px = 0.5 + w.rng() * (W - 1);
      py = 0.9 + w.rng() * (H - 1.8);
    }
    let ok = true;
    for (const d of w.drops) {
      const dx = d.x - px;
      const dy = d.y - py;
      if (dx * dx + dy * dy < 0.4) ok = false;
    }
    if (ok) break;
    if (x !== undefined) break;
  }
  const r = w.rng();
  w.droplets.push({ x: px, y: py, m: 0.07 + r * r * 0.36, id: w.nextDropletId++ });
}

// opts: autopilot (player is an AI too), quickStart (short countdown), upgrades (ids), rivalBoost (skill added to rivals),
//       field (ids of the drops still in the race, always includes 0), survival (the last drop home is wiped),
//       par (seconds: when the player races alone, slower than this means wiped)
export function createWorld(stage, seed, opts = {}) {
  const rng = mulberry32(seed);
  const field = opts.field && opts.field.length ? opts.field : [0, 1, 2, 3, 4, 5].slice(0, RACERS);
  const w = {
    stage,
    seed,
    rng,
    survival: !!opts.survival,
    par: opts.par || 0,
    fieldSize: field.length,
    autopilot: !!opts.autopilot,
    phase: 'grid',
    countdown: opts.quickStart ? 0.6 : T.countdown,
    time: 0,
    raceTime: 0,
    over: false,
    overT: -1,
    drops: [],
    droplets: [],
    wet: new Float32Array(GRID_W * GRID_H),
    wetOwner: new Int16Array(GRID_W * GRID_H).fill(-1),
    grime: new Float32Array(GRID_W * GRID_H),
    wax: new Float32Array(GRID_W * GRID_H),
    bugs: [],
    waxLanes: [],
    wipers: null,
    carEvt: null,
    push: null,
    splash: { phase: 'idle', t: 0, front: -99, next: 0, id: 0 },
    wind: stage.wind,
    events: [],
    finishOrder: [],
    standings: [],
    nextRain: 0.5,
    nextDropletId: 1,
  };

  const gs = stage.grime;
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      const n = fbm2(cx * CELL * 0.34, cy * CELL * 0.44, seed % 997);
      // Soft-edged patches only: most of the glass stays clean.
      const t = clamp((n - 0.5) / 0.22, 0, 1);
      w.grime[cy * GRID_W + cx] = t * t * (3 - 2 * t) * gs;
    }
  }
  // Keep the grid clean at the start: no grime right under the starting line.
  const cleanRows = Math.round(1 / CELL);
  for (let cy = 0; cy < cleanRows; cy++) for (let cx = 0; cx < GRID_W; cx++) w.grime[cy * GRID_W + cx] *= 0.2;

  makeWax(w, stage.wax || 0, rng);
  makeBugs(w, stage.bugs || 0, rng);
  w.wipers = makeWipers(stage, rng);
  w.carEvt = makeCarEvents(stage, rng);

  // Every drop always exists (ids match their index), but the ones that are out of the race are parked off the glass.
  const lanes = shuffle(field.map((_, i) => i), rng);
  const [x0, x1] = stage.startSpan;
  const n = field.length;
  const laneX = lane => x0 + ((x1 - x0) * (lane + 0.5)) / n + (rng() - 0.5) * 0.18;
  const boost = opts.rivalBoost || 0;
  for (let id = 0; id < RACERS; id++) {
    const info = id === 0 ? PLAYER : RIVALS[id - 1];
    const mods = id === 0 ? buildMods(opts.upgrades) : defaultMods();
    const slot = field.indexOf(id);
    const d = makeRacer(id, slot < 0 ? 0 : lanes[slot], slot < 0 ? -20 : laneX(lanes[slot]), info, id === 0, mods, id === 0 ? 0 : boost);
    if (slot < 0) {
      d.out = true;
      d.finished = true;
      d.y = -20;
    }
    w.drops.push(d);
  }

  for (let i = 0; i < stage.initialDroplets; i++) spawnDroplet(w);
  w.splash.next = 9 + rng() * 3;
  updateStandings(w);
  return w;
}

export function drainEvents(w) {
  const e = w.events.slice();
  w.events.length = 0;
  return e;
}

// Order: finished drops by time, then drops still racing by how far down they are, then wiped drops.
function updateStandings(w) {
  const group = d => (d.wiped ? 2 : d.finished ? 0 : 1);
  const s = w.drops.filter(d => !d.out);
  s.sort((a, b) => {
    const ga = group(a);
    const gb = group(b);
    if (ga !== gb) return ga - gb;
    if (ga === 0) return a.finishTime - b.finishTime;
    return b.y - a.y;
  });
  w.standings = s;
}

// The last drop home (or a player who is too slow alone) is wiped off the glass.
function wipeOut(w, d, why) {
  if (d.finished) return;
  d.finished = true;
  d.wiped = true;
  d.finishTime = null;
  d.place = w.fieldSize;
  d.vx = 0;
  d.vy = 0;
  w.events.push({ type: 'wiped', id: d.id, why, x: d.x, y: d.y });
  if (d.isPlayer && !w.autopilot && w.overT < 0) w.overT = 1.1;
}

export function placeOf(w, d) {
  return w.standings.indexOf(d) + 1;
}

function updateWind(w) {
  const base = w.stage.wind;
  if (!base) {
    w.wind = 0;
    return;
  }
  const gust = valueNoise2(w.time * 0.35, 3.7, 9) - 0.5;
  w.wind = Math.max(0, base * (1 + gust * 0.7));
}

// Soft round stamp: the trail has smooth edges, not stair steps. The owner decides who gets the slipstream.
function stampWet(w, x, y, r, id) {
  const rc = Math.max(1.1, (r * 0.45) / CELL);
  const cx0 = Math.floor(x / CELL);
  const cy0 = Math.floor(y / CELL);
  const reach = Math.ceil(rc) + 1;
  for (let oy = -reach; oy <= reach; oy++) {
    const cy = cy0 + oy;
    if (cy < 0 || cy >= GRID_H) continue;
    for (let ox = -reach; ox <= reach; ox++) {
      const cx = cx0 + ox;
      if (cx < 0 || cx >= GRID_W) continue;
      const dx = (cx + 0.5) * CELL - x;
      const dy = (cy + 0.5) * CELL - y;
      const t = Math.hypot(dx, dy) / (rc * CELL);
      if (t >= 1) continue;
      const v = t < 0.4 ? 1 : 1 - ((t - 0.4) / 0.6) ** 2 * (3 - 2 * ((t - 0.4) / 0.6));
      const i = cy * GRID_W + cx;
      if (v > w.wet[i] * 0.95) {
        w.wet[i] = Math.max(w.wet[i], v);
        w.wetOwner[i] = id;
      }
    }
  }
}

function driveRacer(w, d, steerIn, wantClingIn, dt) {
  const mods = d.mods;
  const r = radiusOf(d.m);
  let steer = steerIn;
  let wantCling = wantClingIn;
  if (d.stun > 0) {
    d.stun -= dt;
    steer = 0;
    wantCling = false;
  }
  if (d.clingLock > 0) d.clingLock -= dt;
  const clinging = wantCling && d.clingLock <= 0 && d.stamina > 0;
  if (clinging) {
    d.stamina -= dt / (T.clingTime * mods.clingTime);
    if (d.stamina <= 0) {
      d.stamina = 0;
      d.clingLock = T.clingLockout;
      w.events.push({ type: 'cling-empty', id: d.id });
    }
  } else {
    d.stamina = Math.min(1, d.stamina + dt / (T.clingRecover * mods.clingRecover));
  }
  if (clinging && !d.clinging) w.events.push({ type: 'cling', id: d.id });
  d.clinging = clinging;

  const speed = targetVelocity(w, d.x, d.y, d.m, steer, clinging, d, tv);
  d.speed = speed;
  const stunMul = d.stun > 0 ? 0.35 : 1;
  const tau = clinging ? 0.06 : T.tau0 + T.tau1 * r;
  const a = 1 - Math.exp(-dt / tau);
  d.vx += (tv.vx * stunMul - d.vx) * a;
  d.vy += (tv.vy * stunMul - d.vy) * a;
  const stepX = d.vx * dt;
  const stepY = d.vy * dt;
  d.x += stepX;
  d.y += stepY;
  const moved = Math.hypot(stepX, stepY);
  d.dist += moved;
  d.m = clamp(d.m - T.shed * mods.shed * moved + T.rainGrow * mods.rain * w.stage.rain * dt, T.minMass, T.maxMass);

  const margin = r * 0.5 + 0.3;
  if (d.x < margin) {
    d.x = margin;
    if (d.vx < 0) d.vx = 0;
  } else if (d.x > W - margin) {
    d.x = W - margin;
    if (d.vx > 0) d.vx = 0;
  }
  if (d.y < 0.3) {
    d.y = 0.3;
    if (d.vy < 0) d.vy = 0;
  }

  if (Math.hypot(d.vx, d.vy) > 0.06) stampWet(w, d.x, d.y - d.vy * 0.05, r, d.id);
  const targetStretch = clamp(Math.hypot(d.vx, d.vy) * 0.3, 0, 0.6);
  d.stretch += (targetStretch - d.stretch) * 0.15;
  d.jiggle *= Math.exp(-dt * 5);
  if (d.biteCd > 0) d.biteCd -= dt;
  if (d.biteImmune > 0) d.biteImmune -= dt;
  if (d.bugCd > 0) d.bugCd -= dt;
  if (d.wipeCd > 0) d.wipeCd -= dt;
  if (d.chain > 0) {
    d.chainT -= dt;
    if (d.chainT <= 0) {
      if (d.chain >= 2) w.events.push({ type: 'chain-lost', id: d.id, n: d.chain });
      d.chain = 0;
    }
  }
  if (!clinging) bugHit(w, d);
}

function absorbDroplets(w, d) {
  const r = radiusOf(d.m);
  const mods = d.mods;
  for (let i = w.droplets.length - 1; i >= 0; i--) {
    const p = w.droplets[i];
    const rp = radiusOf(p.m);
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    const reach = r + rp * T.absorbReach * mods.absorb + (mods.absorb - 1) * 0.12;
    if (dx * dx + dy * dy < reach * reach) {
      const gain = p.m * T.absorbEff;
      d.m = Math.min(T.maxMass, d.m + gain);
      d.chain = Math.min(T.chainMax, d.chainT > 0 ? d.chain + 1 : 1);
      d.chainT = T.chainWindow * mods.chainWin;
      d.vy += T.lunge * clamp((gain / d.m) * 3, 0, 1);
      d.vx += dx * 0.5;
      d.jiggle = Math.min(1, d.jiggle + 0.7);
      w.droplets[i] = w.droplets[w.droplets.length - 1];
      w.droplets.pop();
      w.events.push({ type: 'gulp', id: d.id, gain, mass: d.m, x: p.x, y: p.y });
      if (d.chain >= 2) w.events.push({ type: 'chain', id: d.id, n: d.chain });
    }
  }
}

function collideRacers(w) {
  const list = w.drops;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.finished) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.finished) continue;
      const ra = radiusOf(a.m);
      const rb = radiusOf(b.m);
      const min = (ra + rb) * 0.9;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 >= min * min) continue;
      const dist = Math.sqrt(dist2) || 0.001;
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = min - dist;
      const wa = b.m / (a.m + b.m);
      a.x -= nx * overlap * wa;
      a.y -= ny * overlap * wa * 0.5;
      b.x += nx * overlap * (1 - wa);
      b.y += ny * overlap * (1 - wa) * 0.5;
      const big = a.m >= b.m ? a : b;
      const small = big === a ? b : a;
      if (big.biteCd <= 0 && small.biteImmune <= 0 && small.m > T.minMass + 0.12) {
        const amount = Math.min(T.biteShare * small.m, small.m - T.minMass);
        small.m -= amount;
        big.m = Math.min(T.maxMass, big.m + amount * 0.85 * big.mods.bite);
        small.m = Math.max(T.minMass, small.m - amount * (big.mods.bite - 1) * 0.5);
        big.biteCd = T.biteCooldown;
        small.biteImmune = T.biteCooldown;
        big.jiggle = 1;
        small.jiggle = 1;
        small.chain = 0;
        small.chainT = 0;
        const sx = small === b ? nx : -nx;
        small.vx += sx * 0.9;
        big.vy *= 0.75;
        w.events.push({ type: 'bite', big: big.id, small: small.id, amount, x: small.x, y: small.y });
      }
    }
  }
}

function updateSplash(w, dt) {
  const stage = w.stage;
  const s = w.splash;
  if (!stage.splashEvery) return;
  if (s.phase === 'idle') {
    s.next -= dt;
    if (s.next <= 0) {
      s.phase = 'warn';
      s.t = 0;
      s.id++;
      w.events.push({ type: 'splash-warn' });
    }
  } else if (s.phase === 'warn') {
    s.t += dt;
    if (s.t >= T.splashWarn) {
      s.phase = 'sweep';
      s.t = 0;
      s.front = -T.splashBand;
      w.events.push({ type: 'splash-start' });
    }
  } else {
    s.t += dt;
    const prev = s.front;
    s.front = -T.splashBand + (W + 2 * T.splashBand) * (s.t / T.splashSweep);
    applySplash(w, prev, s.front);
    if (s.t >= T.splashSweep) {
      s.phase = 'idle';
      s.next = stage.splashEvery * (0.8 + 0.4 * w.rng());
      w.events.push({ type: 'splash-end' });
    }
  }
}

function applySplash(w, prevFront, front) {
  const s = w.splash;
  for (const d of w.drops) {
    if (d.finished || d.splashHit === s.id) continue;
    if (d.x > front - T.splashBand && d.x < front) {
      d.splashHit = s.id;
      if (d.clinging) {
        w.events.push({ type: 'splash-dodged', id: d.id });
      } else {
        d.vx += T.splashShove * Math.sqrt(R1 / radiusOf(d.m));
        d.vy *= 0.35;
        d.jiggle = 1;
        d.chain = 0;
        d.chainT = 0;
        w.events.push({ type: 'splash-hit', id: d.id });
      }
    }
  }
  for (let i = w.droplets.length - 1; i >= 0; i--) {
    const p = w.droplets[i];
    if (p.x > front - T.splashBand && p.x < front && w.rng() < 0.45) {
      w.droplets[i] = w.droplets[w.droplets.length - 1];
      w.droplets.pop();
    }
  }
  // The wave leaves a spray of fresh droplets behind it: a chance to grow.
  const advance = front - prevFront;
  const n = Math.round(advance * 3.2 + w.rng());
  for (let i = 0; i < n; i++) {
    spawnDroplet(w, front - T.splashBand - 0.2 - w.rng() * 1.6, 0.6 + w.rng() * (H - 1.4));
  }
}

// Survival rules. The last drop home is wiped. If the stragglers dawdle, ten seconds after the winner the lap is cut:
// whoever is furthest back is wiped, the rest are ranked by how far they got. Alone on the glass, the clock is the wiper.
function survivalRules(w) {
  if (w.fieldSize === 1) {
    const me = w.drops[0];
    if (w.par > 0 && !me.finished && w.raceTime > w.par) wipeOut(w, me, 'time');
    return;
  }
  const racing = w.drops.filter(d => !d.finished);
  if (racing.length === 1 && w.finishOrder.length === w.fieldSize - 1) {
    wipeOut(w, racing[0], 'last');
  } else if (racing.length > 1 && w.finishOrder.length >= 1 && w.raceTime - w.firstFinish > T.lapCutoff) {
    racing.sort((a, b) => b.y - a.y);
    racing.forEach((d, i) => {
      if (i === racing.length - 1) return;
      d.finished = true;
      d.cut = true;
      d.finishTime = w.raceTime + i * 0.01;
      d.vx = 0;
      d.vy = 0;
      w.finishOrder.push(d.id);
      d.place = w.finishOrder.length;
    });
    wipeOut(w, racing[racing.length - 1], 'last');
  }
}

function finishCheck(w, d) {
  const r = radiusOf(d.m);
  if (d.finished || d.y + r * 0.55 < H - 0.12) return;
  d.finished = true;
  d.y = H - 0.12 - r * 0.55;
  d.vx = 0;
  d.vy = 0;
  d.finishTime = w.raceTime;
  w.finishOrder.push(d.id);
  d.place = w.finishOrder.length;
  w.events.push({ type: 'finish', id: d.id, place: d.place, time: d.finishTime });
  if (w.finishOrder.length === 1) w.firstFinish = w.raceTime;
  // In survival the lap is over when everyone is home or wiped, so there is no fixed grace time.
  if (d.isPlayer && !w.autopilot && !w.survival) w.overT = T.endGrace;
}

export function step(w, dt, input) {
  w.time += dt;
  updateWind(w);

  if (w.phase === 'grid') {
    const before = Math.ceil(w.countdown);
    w.countdown -= dt;
    const after = Math.ceil(w.countdown);
    if (after < before && after >= 1 && after <= 3) w.events.push({ type: 'count', n: after });
    if (w.countdown <= 0) {
      w.phase = 'race';
      w.events.push({ type: 'go' });
    }
    updateStandings(w);
    return;
  }

  w.raceTime += dt;
  updateSplash(w, dt);
  updateWipers(w, dt);
  updateCarEvents(w, dt);

  w.nextRain -= dt;
  while (w.nextRain <= 0) {
    w.nextRain += (1 / w.stage.rain) * (0.5 + w.rng());
    spawnDroplet(w);
  }

  const decay = T.wetDecay * dt;
  const wet = w.wet;
  for (let i = 0; i < wet.length; i++) if (wet[i] > 0) wet[i] = Math.max(0, wet[i] - decay);

  for (const d of w.drops) {
    if (d.finished) continue;
    let steer = 0;
    let cling = false;
    if (d.isPlayer && !w.autopilot) {
      steer = input ? input.steer : 0;
      cling = input ? input.cling : false;
    } else {
      aiThink(w, d, dt);
      steer = d.aiSteer;
      cling = d.aiCling;
    }
    driveRacer(w, d, steer, cling, dt);
  }
  for (const d of w.drops) if (!d.finished) absorbDroplets(w, d);
  collideRacers(w);
  for (const d of w.drops) finishCheck(w, d);
  if (w.survival) survivalRules(w);
  updateStandings(w);

  if (w.overT >= 0) {
    w.overT -= dt;
    if (w.overT < 0 && !w.over) {
      w.over = true;
      w.events.push({ type: 'over' });
    }
  }
  if (!w.over && w.drops.every(d => d.finished)) {
    if (w.survival) {
      if (w.overT < 0) w.overT = 1.4; // a beat to watch the wipe
    } else {
      w.over = true;
      w.events.push({ type: 'over' });
    }
  }
  if (!w.over && w.raceTime > T.timeout) {
    w.over = true;
    w.events.push({ type: 'over', timeout: true });
  }
}
