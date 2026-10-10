// Balance helper for survival: plays whole runs headless with the player's drop driven by the rival AI
// (a stand-in for an average human) and prints how long the runs last. Usage: node tools/sim-survival.mjs [runs]
import { RACERS } from '../src/config.js';
import { START_LIVES, LIFE_EVERY } from '../src/sim/modes.js';
import { survivalStage, parTime, rivalBoost } from '../src/sim/modes.js';
import { rollChoices } from '../src/sim/upgrades.js';
import { createWorld, step } from '../src/sim/world.js';
import { mulberry32 } from '../src/core/rng.js';

const runs = Number(process.argv[2] || 20);
const DT = 1 / 60;
const MENU_SECONDS = 9; // result screen + upgrade pick between laps
const MAX_LAPS = 60;
const skillBonus = Number(process.argv[3] || 0); // pretend the player is better (+) or worse (-) than a rival

const median = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const lapsList = [];
const killsList = [];
const minutes = [];

for (let r = 1; r <= runs; r++) {
  let field = Array.from({ length: RACERS }, (_, i) => i);
  const ups = [];
  const rng = mulberry32(r * 977);
  let lap = 0;
  let seconds = 0;
  let kills = 0;
  let lives = START_LIVES;
  while (lap < MAX_LAPS) {
    const alone = field.length === 1;
    const w = createWorld(survivalStage(lap), r * 7919 + lap * 131, {
      autopilot: true,
      quickStart: true,
      survival: true,
      field,
      par: alone ? parTime(lap) : 0,
      rivalBoost: rivalBoost(lap) - skillBonus,
      upgrades: ups,
    });
    let guard = 0;
    while (!w.over && guard++ < 60 * 120) step(w, DT, null);
    seconds += w.raceTime + MENU_SECONDS;
    if (w.drops[0].wiped) {
      // The player was last: a life is lost and every rival stays.
      lives--;
      if (lives <= 0) break;
    } else {
      const gone = w.drops.find(d => d.wiped);
      if (gone) {
        field = field.filter(id => id !== gone.id);
        kills++;
      }
      if ((lap + 1) % LIFE_EVERY === 0 && lives < START_LIVES) lives++;
    }
    const offer = rollChoices(ups, rng, 3);
    if (offer.length) ups.push(offer[Math.floor(rng() * offer.length)].id);
    lap++;
  }
  lapsList.push(lap + 1);
  killsList.push(kills);
  minutes.push(seconds / 60);
}

console.log(
  `survival, ${runs} runs of an average player: laps reached median ${median(lapsList)} (min ${Math.min(...lapsList)}, max ${Math.max(...lapsList)})` +
    ` | rivals wiped median ${median(killsList)} | run length median ${median(minutes).toFixed(1)} min (min ${Math.min(...minutes).toFixed(1)}, max ${Math.max(...minutes).toFixed(1)})`,
);
