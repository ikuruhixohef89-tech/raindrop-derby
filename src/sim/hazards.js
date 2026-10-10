// Things the windshield does to the drops: wipers, car events (brake / turn / pothole), bugs, wax lanes.
import { W, H, GRID_W, GRID_H, CELL, TUNING as T } from '../config.js';
import { radiusOf } from './physics.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------- wax lanes ----------
export function makeWax(w, count, rng) {
  const lanes = [];
  for (let i = 0; i < count; i++) {
    lanes.push({ x: 2.4 + rng() * (W - 4.8), amp: 0.5 + rng() * 0.9, ph: rng() * 6.28, freq: 0.45 + rng() * 0.3, hw: 0.5 + rng() * 0.2 });
  }
  w.waxLanes = lanes;
  for (let cy = 0; cy < GRID_H; cy++) {
    const y = (cy + 0.5) * CELL;
    for (let cx = 0; cx < GRID_W; cx++) {
      const x = (cx + 0.5) * CELL;
      let v = 0;
      for (const l of lanes) {
        const sx = l.x + l.amp * Math.sin(y * l.freq + l.ph);
        v = Math.max(v, smooth(l.hw, l.hw * 0.3, Math.abs(x - sx)));
      }
      w.wax[cy * GRID_W + cx] = v;
    }
  }
}

// ---------- bugs ----------
export function makeBugs(w, count, rng) {
  w.bugs = [];
  let guard = 0;
  while (w.bugs.length < count && guard++ < 200) {
    const b = { x: 1 + rng() * (W - 2), y: 1.8 + rng() * (H - 3.6), r: 0.15 + rng() * 0.1, rot: rng() * 6.28, kind: Math.floor(rng() * 3) };
    if (w.bugs.every(o => Math.hypot(o.x - b.x, o.y - b.y) > 1.3)) w.bugs.push(b);
  }
}

// Returns true when the drop hit a bug this step.
export function bugHit(w, d) {
  if (d.bugCd > 0) return false;
  const r = radiusOf(d.m);
  for (const b of w.bugs) {
    const dx = d.x - b.x;
    const dy = d.y - b.y;
    const reach = r * 0.7 + b.r;
    if (dx * dx + dy * dy < reach * reach) {
      const dist = Math.hypot(dx, dy) || 0.001;
      d.vx += (dx / dist) * 0.9;
      d.bugCd = T.bugCooldown;
      d.jiggle = 1;
      if (d.mods.bugproof) {
        // Armoured: bounce off, keep everything.
        d.vy *= 0.6;
        w.events.push({ type: 'bug', id: d.id, x: b.x, y: b.y, harmless: true });
        return true;
      }
      d.m = Math.max(T.minMass, d.m * (1 - T.bugPenalty));
      d.vy *= 0.15;
      d.chain = 0;
      d.chainT = 0;
      w.events.push({ type: 'bug', id: d.id, x: b.x, y: b.y });
      return true;
    }
  }
  return false;
}

// ---------- wipers ----------
const REST = Math.PI * 0.94;
const END = Math.PI * 0.06;

export function makeWipers(stage, rng) {
  if (!stage.wipers) return null;
  return {
    phase: 'idle', // idle | warn | out | back
    t: 0,
    next: 5 + rng() * 3,
    angle: REST,
    every: stage.wipers.every,
    sweep: stage.wipers.sweep,
    id: 0,
    pivots: [
      { x: W * 0.27, y: H + 0.5 },
      { x: W * 0.72, y: H + 0.5 },
    ],
  };
}

export function wiperSegment(wp, i) {
  const p = wp.pivots[i];
  const dx = Math.cos(wp.angle);
  const dy = -Math.sin(wp.angle);
  return { x1: p.x + dx * 0.8, y1: p.y + dy * 0.8, x2: p.x + dx * T.wiperLen, y2: p.y + dy * T.wiperLen, dx, dy };
}

function distToSegment(px, py, s) {
  const vx = s.x2 - s.x1;
  const vy = s.y2 - s.y1;
  const t = clamp(((px - s.x1) * vx + (py - s.y1) * vy) / (vx * vx + vy * vy), 0, 1);
  return Math.hypot(px - (s.x1 + vx * t), py - (s.y1 + vy * t));
}

export function updateWipers(w, dt) {
  const wp = w.wipers;
  if (!wp) return;
  if (wp.phase === 'idle') {
    wp.angle = REST;
    wp.next -= dt;
    if (wp.next <= 0) {
      wp.phase = 'warn';
      wp.t = 0;
      wp.id++;
      w.events.push({ type: 'wiper-warn' });
    }
  } else if (wp.phase === 'warn') {
    wp.t += dt;
    wp.angle = REST - 0.04 * Math.sin(wp.t * 22) * Math.min(1, wp.t * 2);
    if (wp.t >= T.wiperWarn) {
      wp.phase = 'out';
      wp.t = 0;
      w.events.push({ type: 'wiper-start' });
    }
  } else {
    wp.t += dt;
    const u = clamp(wp.t / wp.sweep, 0, 1);
    const e = u * u * (3 - 2 * u);
    wp.angle = wp.phase === 'out' ? REST + (END - REST) * e : END + (REST - END) * e;
    if (wp.t >= wp.sweep) {
      if (wp.phase === 'out') {
        wp.phase = 'back';
        wp.t = 0;
      } else {
        wp.phase = 'idle';
        wp.next = wp.every * (0.8 + 0.4 * w.rng());
        wp.angle = REST;
      }
    }
    for (const d of w.drops) wiperHit(w, d);
  }
}

// Distance from a drop to the nearest blade (used by the AI to decide when to cling).
export function wiperDistance(w, d) {
  const wp = w.wipers;
  if (!wp || wp.phase === 'idle') return Infinity;
  let best = Infinity;
  for (let i = 0; i < wp.pivots.length; i++) best = Math.min(best, distToSegment(d.x, d.y, wiperSegment(wp, i)));
  return best;
}

function wiperHit(w, d) {
  if (d.finished || d.wipeCd > 0) return;
  const wp = w.wipers;
  const reach = T.wiperBlade * 0.5 + radiusOf(d.m) * 0.8;
  for (let i = 0; i < wp.pivots.length; i++) {
    const seg = wiperSegment(wp, i);
    if (distToSegment(d.x, d.y, seg) > reach) continue;
    d.wipeCd = 0.9;
    if (d.clinging) {
      w.events.push({ type: 'wiper-dodged', id: d.id });
    } else {
      d.m = Math.max(T.minMass, d.m * (1 - T.wiperHitLoss * d.mods.wiperLoss));
      d.y = Math.max(0.3, d.y - T.wiperThrow);
      d.vx += (wp.phase === 'out' ? 1 : -1) * 1.2;
      d.vy = -0.5;
      d.stun = T.wiperStun;
      d.chain = 0;
      d.chainT = 0;
      d.jiggle = 1;
      w.events.push({ type: 'wiper-hit', id: d.id, x: d.x, y: d.y });
    }
    return;
  }
}

// ---------- car events ----------
const KINDS = ['brake', 'left', 'right', 'pothole'];
const WARN = { brake: T.brakeWarn, left: T.turnWarn, right: T.turnWarn, pothole: T.potholeWarn };
const DUR = { brake: T.brakeDur, left: T.turnDur, right: T.turnDur, pothole: 0.3 };

export function makeCarEvents(stage, rng) {
  if (!stage.carEvents) return null;
  return { phase: 'idle', kind: null, t: 0, next: 6 + rng() * 3, every: stage.carEvents, id: 0 };
}

export function updateCarEvents(w, dt) {
  const ce = w.carEvt;
  if (!ce) return;
  if (ce.phase === 'idle') {
    w.push = null;
    ce.next -= dt;
    if (ce.next <= 0) {
      ce.kind = KINDS[Math.floor(w.rng() * KINDS.length)];
      ce.phase = 'warn';
      ce.t = 0;
      ce.id++;
      w.events.push({ type: 'car-warn', kind: ce.kind });
    }
  } else if (ce.phase === 'warn') {
    ce.t += dt;
    if (ce.t >= WARN[ce.kind]) {
      ce.phase = 'active';
      ce.t = 0;
      w.events.push({ type: 'car-start', kind: ce.kind });
      if (ce.kind === 'pothole') {
        for (const d of w.drops) {
          if (d.finished || d.clinging) continue;
          d.m = Math.max(T.minMass, d.m * (1 - T.potholeLoss));
          d.vx += (w.rng() - 0.5) * 1.2;
          d.jiggle = 1;
        }
      }
    }
  } else {
    ce.t += dt;
    const dur = DUR[ce.kind];
    const env = Math.sin(clamp(ce.t / dur, 0, 1) * Math.PI);
    if (ce.kind === 'brake') w.push = { vx: 0, vyMul: 1 + T.brakeBoost * env };
    else if (ce.kind === 'left') w.push = { vx: -T.turnPush * env, vyMul: 1 };
    else if (ce.kind === 'right') w.push = { vx: T.turnPush * env, vyMul: 1 };
    else w.push = null;
    if (ce.t >= dur) {
      ce.phase = 'idle';
      ce.next = ce.every * (0.8 + 0.4 * w.rng());
      w.push = null;
      w.events.push({ type: 'car-end', kind: ce.kind });
    }
  }
}
