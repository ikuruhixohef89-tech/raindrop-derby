// Balance helper: how long an AI-driven drop needs to finish alone on glass at different survival laps.
import { survivalStage } from '../src/sim/modes.js';
import { createWorld, step } from '../src/sim/world.js';

const DT = 1 / 60;
const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const lap of [0, 1, 2, 3, 5, 8, 11, 14, 17, 20, 26, 32, 40]) {
  const times = [];
  let dnf = 0;
  for (let s = 1; s <= 12; s++) {
    const w = createWorld(survivalStage(lap), s * 313 + lap, { autopilot: true, quickStart: true, survival: true, field: [0], par: 0 });
    let g = 0;
    while (!w.over && g++ < 60 * 100) step(w, DT, null);
    if (w.drops[0].finished) times.push(w.drops[0].finishTime);
    else dnf++;
  }
  times.sort((a, b) => a - b);
  const p90 = times.length ? times[Math.floor(times.length * 0.9)].toFixed(1) : '-';
  console.log(`lap ${String(lap).padStart(2)}: median ${times.length ? med(times).toFixed(1) : '-'} s, p90 ${p90} s, unfinished ${dnf}/12`);
}
