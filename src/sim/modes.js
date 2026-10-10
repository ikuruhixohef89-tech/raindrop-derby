// How the heats are strung together: the six-heat cup and the endless survival run.
import { STAGES } from '../config.js';

// Cup: the three glasses twice. Round two is the same glass, but angrier. cut = the player must finish this high to go on.
export const CUP = [
  { stage: 0, level: 0, cut: 4 },
  { stage: 1, level: 0, cut: 3 },
  { stage: 2, level: 0, cut: 3 },
  { stage: 0, level: 1, cut: 3 },
  { stage: 1, level: 1, cut: 2 },
  { stage: 2, level: 1, cut: 1 },
];

// A harder version of a base heat. Level 0 is the base itself.
export function scaleStage(base, level) {
  if (!level) return base;
  const k = level;
  return {
    ...base,
    name: `${base.name} · Round ${k + 1}`,
    wind: base.wind > 0 ? Math.min(1.15, base.wind * (1 + 0.18 * k)) : Math.min(0.5, 0.14 * k),
    rain: base.rain * (1 + 0.12 * k),
    grime: Math.min(1, base.grime + 0.1 * k),
    bugs: Math.min(14, base.bugs + 2 * k),
    wipers: base.wipers
      ? { every: Math.max(4.5, base.wipers.every * (1 - 0.17 * k)), sweep: Math.max(1.2, base.wipers.sweep * (1 - 0.1 * k)) }
      : null,
    carEvents: base.carEvents ? Math.max(3.5, base.carEvents * (1 - 0.15 * k)) : 0,
    splashEvery: base.splashEvery ? Math.max(5, base.splashEvery * (1 - 0.15 * k)) : 0,
    skillBonus: base.skillBonus + 0.04 * k,
  };
}

export function cupStage(index) {
  const h = CUP[index];
  return scaleStage(STAGES[h.stage], h.level);
}

// Survival: lap n runs on glass n mod 3, and every three laps the glass gets one level worse.
export function survivalStage(lap) {
  return scaleStage(STAGES[lap % STAGES.length], Math.floor(lap / STAGES.length));
}

// Being last (or too slow) costs a life. A life comes back for every few laps you survive, up to the starting number.
export const START_LIVES = 3;
export const LIFE_EVERY = 3;

// Alone on the glass you must beat the clock, and the clock gets shorter.
// The floor is below what anyone can do alone even with every upgrade (about 13 s), so a run always ends: it is a high-score mode.
export function parTime(lap) {
  return Math.max(10, 38 - 1.3 * lap);
}

export function rivalBoost(lap) {
  return Math.min(0.25, lap * 0.03);
}
