import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, RACERS, TUNING as T } from '../../src/config.js';
import { CUP, scaleStage, cupStage, survivalStage, parTime, rivalBoost } from '../../src/sim/modes.js';
import { UPGRADES, buildMods, rollChoices } from '../../src/sim/upgrades.js';
import { createWorld, step, drainEvents } from '../../src/sim/world.js';
import { mulberry32 } from '../../src/core/rng.js';

const DT = 1 / 60;

function startRace(w) {
  while (w.phase === 'grid') step(w, DT, null);
}
function quiet(w) {
  w.droplets.length = 0;
  w.nextRain = 1e9;
  w.splash.next = 1e9;
  if (w.wipers) w.wipers.next = 1e9;
  if (w.carEvt) w.carEvt.next = 1e9;
  w.bugs.length = 0;
}

test('the cup is six heats, gets tighter, and ends with a final you must win', () => {
  assert.equal(CUP.length, 6);
  assert.equal(CUP[CUP.length - 1].cut, 1);
  for (const h of CUP) assert.ok(h.cut >= 1 && h.cut <= RACERS && STAGES[h.stage]);
  assert.ok(CUP[3].level > CUP[0].level);
});

test('a higher level is harder on every axis', () => {
  const base = STAGES[1];
  const hard = scaleStage(base, 2);
  assert.ok(hard.wind > base.wind);
  assert.ok(hard.bugs > base.bugs);
  assert.ok(hard.wipers.every < base.wipers.every);
  assert.ok(hard.carEvents < base.carEvents);
  assert.ok(hard.skillBonus > base.skillBonus);
  assert.equal(hard.id, base.id);
  assert.equal(scaleStage(base, 0), base);
  // A parked car never brakes, even in a harder round.
  assert.equal(scaleStage(STAGES[0], 3).carEvents, 0);
});

test('survival laps cycle the glass and grow nastier forever', () => {
  assert.equal(survivalStage(0).id, STAGES[0].id);
  assert.equal(survivalStage(4).id, STAGES[1].id);
  assert.ok(survivalStage(10).bugs >= survivalStage(1).bugs);
  assert.ok(parTime(20) < parTime(0));
  assert.ok(parTime(500) >= 10 && parTime(500) < 12, 'par has a floor that nobody can beat alone');
  assert.ok(rivalBoost(500) <= 0.25);
  const w = createWorld(survivalStage(30), 3, { quickStart: true });
  assert.ok(Number.isFinite(w.stage.wind) && w.stage.wind <= 1.15);
});

test('there are enough upgrades for a long run', () => {
  assert.ok(UPGRADES.length >= 10);
  assert.equal(new Set(UPGRADES.map(u => u.id)).size, UPGRADES.length);
  const all = UPGRADES.map(u => u.id);
  assert.equal(rollChoices(all, mulberry32(1), 3).length, 0);
  assert.equal(rollChoices(all.slice(1), mulberry32(1), 3).length, 1);
});

test('new upgrades do what they say', () => {
  const m = buildMods(['rainmaker', 'shell', 'wiperwax', 'thirsty']);
  assert.ok(m.rain > 2 && m.bugproof === 1 && m.wiperLoss < 1 && m.bite > 1.5);
});

test('drops that are out of the field never race', () => {
  const w = createWorld(STAGES[1], 5, { quickStart: true, field: [0, 2, 4] });
  assert.equal(w.fieldSize, 3);
  assert.equal(w.drops.length, RACERS);
  assert.equal(w.standings.length, 3);
  assert.ok(w.drops[1].out && w.drops[3].out && w.drops[5].out);
  assert.ok(!w.drops[0].out && !w.drops[2].out && !w.drops[4].out);
  startRace(w);
  for (let i = 0; i < 60 * 3; i++) step(w, DT, { steer: 0, cling: false });
  assert.ok(w.drops[1].y < 0, 'an eliminated drop wandered onto the glass');
  assert.ok(w.standings.every(d => !d.out));
});

test('survival: the last drop home is wiped', () => {
  const w = createWorld(STAGES[0], 9, { quickStart: true, survival: true });
  startRace(w);
  quiet(w);
  // Everybody but drop 5 reaches the bottom.
  for (const d of w.drops) {
    d.y = d.id === 5 ? 3 : 7.95;
    d.x = 2 + d.id * 2;
  }
  step(w, DT, { steer: 0, cling: false });
  step(w, DT, { steer: 0, cling: false });
  const ev = drainEvents(w);
  const wipe = ev.find(e => e.type === 'wiped');
  assert.ok(wipe, 'nobody was wiped');
  assert.equal(wipe.id, 5);
  assert.equal(w.drops[5].place, RACERS);
  assert.equal(w.standings[w.standings.length - 1], w.drops[5]);
  // The lap ends a beat later, never instantly and never before the wipe.
  assert.ok(!w.over);
  for (let i = 0; i < 60 * 2; i++) step(w, DT, { steer: 0, cling: false });
  assert.ok(w.over);
});

test('survival: if the stragglers dawdle, the lap is cut and the furthest-back drop is wiped', () => {
  const w = createWorld(STAGES[0], 9, { quickStart: true, survival: true });
  startRace(w);
  quiet(w);
  for (const d of w.drops) {
    d.clingLock = 99; // keep them still so the test controls positions
    d.y = 2 + d.id * 0.5;
  }
  w.drops[2].y = 7.95; // a winner
  step(w, DT, { steer: 0, cling: false });
  assert.equal(w.finishOrder.length, 1);
  for (let i = 0; i < 60 * (T.lapCutoff + 1); i++) {
    for (const d of w.drops) if (!d.finished) { d.vy = 0; d.vx = 0; }
    step(w, DT, { steer: 0, cling: false });
    for (const d of w.drops) if (!d.finished) d.y = Math.min(d.y, 5); // nobody makes it home
  }
  const wiped = w.drops.filter(d => d.wiped);
  assert.equal(wiped.length, 1, 'exactly one drop is wiped');
  assert.ok(w.drops.filter(d => d.cut).length === RACERS - 2);
  assert.ok(w.drops.every(d => d.finished));
});

test('survival: alone, being too slow gets you wiped', () => {
  const w = createWorld(STAGES[0], 9, { quickStart: true, survival: true, field: [0], par: 6 });
  startRace(w);
  quiet(w);
  const me = w.drops[0];
  for (let i = 0; i < 60 * 8; i++) {
    me.y = 2;
    me.clingLock = 99;
    step(w, DT, { steer: 0, cling: false });
  }
  assert.ok(me.wiped);
  assert.ok(drainEvents(w).some(e => e.type === 'wiped' && e.id === 0 && e.why === 'time'));
});

test('survival: alone and fast enough, you finish and the lap is yours', () => {
  const w = createWorld(STAGES[0], 9, { quickStart: true, survival: true, field: [0], par: 30 });
  startRace(w);
  quiet(w);
  w.drops[0].y = 7.95;
  step(w, DT, { steer: 0, cling: false });
  assert.ok(w.drops[0].finished && !w.drops[0].wiped);
  for (let i = 0; i < 60 * 3; i++) step(w, DT, { steer: 0, cling: false });
  assert.ok(w.over);
});

test('an armoured drop bounces off a bug without losing anything', () => {
  const w = createWorld(STAGES[1], 2, { quickStart: true, upgrades: ['shell'] });
  startRace(w);
  quiet(w);
  const p = w.drops[0];
  p.m = 2;
  p.x = 8;
  p.y = 3;
  p.chain = 3;
  p.chainT = 1;
  w.bugs.push({ x: 8.02, y: 3.02, r: 0.2, rot: 0, kind: 0 });
  step(w, DT, { steer: 0, cling: false });
  assert.ok(p.m > 1.99);
  assert.equal(p.chain, 3);
  assert.ok(cupStage(0).id === 'parked');
});
