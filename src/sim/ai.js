// Rival brains. One-step look-ahead with the same motion model the player's drop obeys, no cheating.
import { W, TUNING as T } from '../config.js';
import { cellIndex, radiusOf, targetVelocity } from './physics.js';
import { wiperDistance } from './hazards.js';

const CANDIDATES = [-1, -0.5, 0, 0.5, 1];
const STYLE = {
  rail: { wet: 2.4, drop: 1, grime: 1, bigger: 1, smaller: 0.4, wax: 1.2 },
  hunter: { wet: 1, drop: 2.4, grime: 1, bigger: 1, smaller: 0.4, wax: 1 },
  bully: { wet: 1, drop: 1, grime: 1, bigger: 0.7, smaller: 2.6, wax: 1 },
  dodger: { wet: 1, drop: 1, grime: 1.5, bigger: 2.6, smaller: 0.2, wax: 1.4 },
};
const out = { vx: 0, vy: 0 };

function scoreCandidate(w, d, steer, st) {
  let x = d.x;
  let y = d.y;
  const r = radiusOf(d.m);
  let score = 0;
  const dt = 0.32;
  for (let k = 0; k < 4; k++) {
    targetVelocity(w, x, y, d.m, steer, false, d, out);
    x += out.vx * dt;
    y += out.vy * dt;
    const i = cellIndex(x, y);
    const draftable = w.wetOwner[i] === d.id ? 0 : w.wet[i];
    score += (draftable * 1.1 * st.wet - w.grime[i] * 1.6 * st.grime + w.wax[i] * 1.4 * st.wax) * 0.25;
    for (const b of w.bugs) {
      const bx = b.x - x;
      const by = b.y - y;
      if (bx * bx + by * by < 0.5) score -= 1.1;
    }
  }
  score += (y - d.y) * 4;
  // Even a drop that cannot move right now has a preference: where it would like to go.
  const px = x + steer * 0.8;
  const py = y + 0.5;
  const ip = cellIndex(px, py);
  score += w.wet[ip] * 0.5 * st.wet - w.grime[ip] * 0.9 * st.grime + w.wax[ip] * 0.6 * st.wax;
  for (const p of w.droplets) {
    const dx = p.x - px;
    const dy = p.y - (py - 0.2);
    const dist2 = dx * dx + dy * dy;
    if (dist2 < 0.55) score += p.m * (d.chain > 0 ? 3.2 : 2.4) * st.drop * (1 - dist2 / 0.55);
  }
  for (const o of w.drops) {
    if (o === d || o.finished) continue;
    const dx = o.x - px;
    const dy = o.y - py;
    const dist2 = dx * dx + dy * dy;
    const reach = (r + radiusOf(o.m) + 0.5) ** 2;
    if (dist2 < reach) {
      const near = 1 - dist2 / reach;
      if (o.m > d.m * 1.08) score -= 1.8 * near * st.bigger;
      else if (o.m < d.m * 0.9) score += 0.9 * near * st.smaller;
    }
  }
  const wallGap = Math.min(x, W - x) - 0.6;
  if (wallGap < 0) score += wallGap * 3;
  score -= Math.abs(steer) * 0.06;
  return score;
}

export function aiThink(w, d, dt) {
  const skill = Math.min(0.97, Math.max(0.2, d.skill + w.stage.skillBonus));
  d.aiCling = false;

  // Cling when the splash wave is about to reach this drop.
  const s = w.splash;
  if (s.phase === 'sweep' && d.stamina > 0.2 && d.clingLock <= 0) {
    if (d.clingPlanId !== s.id) {
      d.clingPlanId = s.id;
      d.willCling = w.rng() < skill + 0.1;
    }
    if (d.willCling && s.front > d.x - 3.2 && s.front < d.x + T.splashBand + 0.4) d.aiCling = true;
  }
  // Cling when a wiper blade is close.
  const wp = w.wipers;
  if (wp && (wp.phase === 'out' || wp.phase === 'back') && d.stamina > 0.12 && d.clingLock <= 0) {
    if (d.wipePlanId !== wp.id) {
      d.wipePlanId = wp.id;
      d.willWipe = w.rng() < skill + 0.12;
    }
    if (d.willWipe && wiperDistance(w, d) < 1.7) d.aiCling = true;
  }

  d.aiT -= dt;
  if (d.aiT > 0) return;
  d.aiT = 0.16 + (1 - skill) * 0.4 * (0.5 + w.rng());
  const st = STYLE[d.style] || STYLE.rail;
  let best = 0;
  let bestScore = -Infinity;
  for (const c of CANDIDATES) {
    const sc = scoreCandidate(w, d, c, st) + (w.rng() - 0.5) * (1 - skill) * 2.4;
    if (sc > bestScore) {
      bestScore = sc;
      best = c;
    }
  }
  d.aiSteer = best;
}
