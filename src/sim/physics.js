// The one motion model every drop uses (player, rivals, and the AI's look-ahead).
// Down the glass: a drop slides when (its radius x the pull on it) beats how hard the glass holds it. Bigger = faster.
// Sideways: steering gives its own lateral speed, slowed by dirt. Turning costs some downward speed.
import { W, CELL, GRID_W, GRID_H, R1, TUNING as T } from '../config.js';
import { valueNoise2 } from './noise.js';
import { defaultMods } from './upgrades.js';

export const radiusOf = m => R1 * Math.sqrt(m);
const NO_MODS = defaultMods();

export function cellIndex(x, y) {
  const cx = Math.min(GRID_W - 1, Math.max(0, Math.floor(x / CELL)));
  const cy = Math.min(GRID_H - 1, Math.max(0, Math.floor(y / CELL)));
  return cy * GRID_W + cx;
}

// Writes the velocity the drop is heading for into out. Returns the sliding speed (0 when stuck).
export function targetVelocity(w, x, y, m, steer, clinging, d, out) {
  if (clinging) {
    out.vx = 0;
    out.vy = 0;
    return 0;
  }
  const mods = d && d.mods ? d.mods : NO_MODS;
  const r = radiusOf(m);
  const i = cellIndex(x, y);
  // Your own trail does not help you; a fresh trail someone else left does (slipstream).
  const wet = d && w.wetOwner[i] === d.id ? 0 : w.wet[i];
  const grime = w.grime[i];
  const wax = w.wax[i];
  const sa = d ? d.seedA : 0;
  const sb = d ? d.seedB : 0;
  const stick = 0.82 + 0.45 * valueNoise2(y * 1.3 + sa, x * 0.9 + sb, 5);
  const draft = wet * mods.draft;
  const pin =
    T.pin * (1 + T.grimePin * grime) * Math.max(0.1, 1 - T.wetPin * draft) * Math.max(0.1, 1 - T.waxPin * wax * mods.wax) * stick;

  // Pull: gravity down, wind up and outward.
  const k = R1 / r;
  const wk = w.wind * mods.wind * Math.pow(k, 0.7);
  const fy = 1 - T.windUp * wk;
  const side = (x - W / 2) / (W / 2);
  const fx = T.windSide * wk * Math.sign(side) * Math.sqrt(Math.abs(side));
  const f = Math.hypot(fx, fy);
  const slide = r * f * T.drive - pin;

  let sp = 0;
  let vx = 0;
  let vy = 0;
  if (slide > 0) {
    sp = T.speedK * slide;
    sp *= 1 + T.draftBoost * draft;
    sp *= 1 + T.waxBoost * wax * mods.wax;
    if (d && d.chain > 0) sp *= 1 + T.chainBoost * mods.flow * d.chain;
    sp = Math.min(T.maxSpeed, sp);
    vx = (fx / f) * sp;
    vy = (fy / f) * sp;
  }
  const lateral = steer * T.steerSpeed * mods.steer * Math.pow(k, 0.3) * (1 - T.steerGrime * grime) * (1 + 0.25 * draft);
  vx += lateral;
  vy *= 1 - T.steerCost * mods.slick * Math.abs(steer);

  // The car itself: braking throws everything down, turning throws it sideways.
  if (w.push) {
    vx += w.push.vx;
    vy *= w.push.vyMul;
  }
  out.vx = vx;
  out.vy = vy;
  return sp;
}
