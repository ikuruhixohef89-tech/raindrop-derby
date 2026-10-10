// Balance helper: how much faster each upgrade makes a lone AI-driven drop (median finish time at survival lap 6).
// Usage: node tools/upgrade-power.mjs
import { survivalStage } from '../src/sim/modes.js';
import { UPGRADES } from '../src/sim/upgrades.js';
import { createWorld, step } from '../src/sim/world.js';

const DT = 1 / 60;
function median(ups) {
  const times = [];
  for (let s = 1; s <= 16; s++) {
    const w = createWorld(survivalStage(6), s * 313, { autopilot: true, quickStart: true, survival: true, field: [0], par: 0, upgrades: ups });
    let g = 0;
    while (!w.over && g++ < 60 * 100) step(w, DT, null);
    times.push(w.drops[0].finished ? w.drops[0].finishTime : 100);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

const base = median([]);
console.log(`no upgrades: ${base.toFixed(1)} s`);
for (const u of UPGRADES) {
  const t = median([u.id]);
  console.log(`${u.id.padEnd(10)} ${t.toFixed(1).padStart(5)} s  (${(((base - t) / base) * 100).toFixed(0).padStart(3)}% faster)`);
}
console.log(`all ${UPGRADES.length}: ${median(UPGRADES.map(u => u.id)).toFixed(1)} s`);
