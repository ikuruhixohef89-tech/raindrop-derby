// Balance helper: runs races headless and prints finish-time and placement stats.
// Usage: node tools/sim-stats.mjs [seeds]
//   "AI player" = the player's drop driven by the same AI as the rivals (a stand-in for an average human).
//   "idle player" = the player never presses anything.
import { STAGES } from '../src/config.js';
import { createWorld, step } from '../src/sim/world.js';

const seeds = Number(process.argv[2] || 12);
const DT = 1 / 60;

const median = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const histogram = places => {
  const h = [0, 0, 0, 0, 0, 0];
  for (const p of places) h[Math.min(6, Math.max(1, p)) - 1]++;
  return h.join('/');
};

for (const stage of STAGES) {
  const winners = [];
  const aiPlaces = [];
  const idlePlaces = [];
  const wins = new Array(6).fill(0);
  for (let seed = 1; seed <= seeds; seed++) {
    const w = createWorld(stage, seed * 7919, { autopilot: true, quickStart: true });
    let guard = 0;
    while (!w.over && guard++ < 60 * 130) step(w, DT, null);
    const fin = w.drops.filter(d => d.finished).sort((a, b) => a.finishTime - b.finishTime);
    if (fin.length) {
      winners.push(fin[0].finishTime);
      wins[fin[0].id]++;
    }
    aiPlaces.push(w.standings.indexOf(w.drops[0]) + 1);

    const idle = createWorld(stage, seed * 7919, { quickStart: true });
    guard = 0;
    while (!idle.over && guard++ < 60 * 130) step(idle, DT, { steer: 0, cling: false });
    idlePlaces.push(idle.drops[0].finished ? idle.drops[0].place : 6);
  }
  console.log(
    `${stage.id.padEnd(8)} winner median ${median(winners).toFixed(1)}s (min ${Math.min(...winners).toFixed(1)}, max ${Math.max(...winners).toFixed(1)})` +
      ` | wins by id ${wins.join('/')}` +
      ` | AI-player places 1..6: ${histogram(aiPlaces)}` +
      ` | idle-player places 1..6: ${histogram(idlePlaces)} (cut: top ${stage.cut})`,
  );
}
