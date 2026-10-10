import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, W, H, TUNING as T } from '../../src/config.js';
import { createWorld, step, drainEvents, radiusOf } from '../../src/sim/world.js';

const DT = 1 / 60;
const stage = id => STAGES.find(s => s.id === id);

function run(w, seconds, input = null) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n && !w.over; i++) step(w, DT, input);
}

function startRace(w) {
  while (w.phase === 'grid') step(w, DT, null);
}

function emptyGlass(w) {
  w.droplets.length = 0;
  w.stage = { ...w.stage, rain: 0.0001, splashEvery: 0 };
  w.nextRain = 1e9;
}

test('same seed gives the same race', () => {
  const a = createWorld(stage('city'), 4242, { autopilot: true, quickStart: true });
  const b = createWorld(stage('city'), 4242, { autopilot: true, quickStart: true });
  run(a, 25);
  run(b, 25);
  assert.deepEqual(a.drops.map(d => [d.x, d.y, d.m]), b.drops.map(d => [d.x, d.y, d.m]));
});

test('drops never leave the glass and mass stays within limits', () => {
  for (const s of STAGES) {
    const w = createWorld(s, 99, { autopilot: true, quickStart: true });
    for (let i = 0; i < 60 * 70 && !w.over; i++) {
      step(w, DT, null);
      for (const d of w.drops) {
        assert.ok(d.x >= 0 && d.x <= W, `${s.id}: x ${d.x}`);
        assert.ok(d.y >= 0 && d.y <= H, `${s.id}: y ${d.y}`);
        assert.ok(d.m >= T.minMass - 1e-9 && d.m <= T.maxMass + 1e-9, `${s.id}: mass ${d.m}`);
        assert.ok(Number.isFinite(d.x) && Number.isFinite(d.y));
      }
    }
  }
});

test('every stage ends on its own, even if the player does nothing', () => {
  for (const s of STAGES) {
    const w = createWorld(s, 7, { quickStart: true });
    let guard = 0;
    while (!w.over && guard++ < 60 * 130) step(w, DT, { steer: 0, cling: false });
    assert.ok(w.over, `${s.id} never ended`);
  }
});

test('a normal AI race has a winner between 12 and 35 seconds', () => {
  for (const s of STAGES) {
    const w = createWorld(s, 31337, { autopilot: true, quickStart: true });
    run(w, 100);
    const times = w.drops.filter(d => d.finished).map(d => d.finishTime);
    assert.ok(times.length > 0, `${s.id}: nobody finished`);
    const best = Math.min(...times);
    assert.ok(best > 12 && best < 35, `${s.id}: winner ${best.toFixed(1)}s`);
  }
});

test('swallowing a droplet adds mass and removes the droplet', () => {
  const w = createWorld(stage('parked'), 5, { quickStart: true });
  startRace(w);
  emptyGlass(w);
  const p = w.drops[0];
  p.x = 8;
  p.y = 3;
  const before = p.m;
  w.droplets.push({ x: 8.02, y: 3.02, m: 0.3, id: 9999 });
  step(w, DT, { steer: 0, cling: false });
  const ev = drainEvents(w);
  assert.equal(w.droplets.length, 0);
  assert.ok(p.m > before + 0.2);
  assert.ok(ev.some(e => e.type === 'gulp' && e.id === 0));
});

test('a bigger drop bites a smaller one, mass moves and is not created', () => {
  const w = createWorld(stage('parked'), 5, { quickStart: true });
  startRace(w);
  emptyGlass(w);
  const [a, b] = [w.drops[1], w.drops[2]];
  for (const d of w.drops) if (d !== a && d !== b) d.y = 0.4;
  a.x = 6;
  a.y = 4;
  a.m = 2.4;
  b.x = 6.05;
  b.y = 4.05;
  b.m = 1.2;
  const total = a.m + b.m;
  step(w, DT, { steer: 0, cling: false });
  const bite = drainEvents(w).find(e => e.type === 'bite');
  assert.ok(bite, 'no bite happened');
  assert.equal(bite.big, a.id);
  assert.ok(a.m > 2.4 && b.m < 1.2);
  assert.ok(a.m + b.m <= total + 1e-9, 'mass was created from nothing');
});

test('the splash shoves a loose drop but not a clinging one', () => {
  const w = createWorld(stage('city'), 11, { quickStart: true });
  startRace(w);
  emptyGlass(w);
  w.stage = { ...w.stage, splashEvery: 1000 };
  // The player (index 0) is the loose drop: it only does what the test input says.
  // The clinger is a rival with a perfect skill, so it always plans to cling, and it never steers.
  const [loose, clinger] = [w.drops[0], w.drops[1]];
  for (const d of w.drops) if (d !== loose && d !== clinger) d.y = 0.4;
  loose.x = 6;
  loose.y = 4;
  clinger.x = 6;
  clinger.y = 6;
  clinger.skill = 0.99;
  clinger.aiT = 1e9;
  clinger.aiSteer = 0;
  w.splash.phase = 'warn';
  w.splash.t = T.splashWarn - 0.001;
  w.splash.id = 1;
  const xs = [loose.x, clinger.x];
  let clingerMovedWhileClinging = 0;
  let prev = clinger.x;
  for (let i = 0; i < 60 * 2.2; i++) {
    step(w, DT, { steer: 0, cling: false });
    if (clinger.clinging) clingerMovedWhileClinging = Math.max(clingerMovedWhileClinging, Math.abs(clinger.x - prev));
    prev = clinger.x;
  }
  const ev = drainEvents(w);
  assert.ok(ev.some(e => e.type === 'splash-hit' && e.id === loose.id), 'loose drop was not hit');
  assert.ok(ev.some(e => e.type === 'splash-dodged' && e.id === clinger.id), 'clinger did not dodge');
  assert.ok(clingerMovedWhileClinging < 0.01, `clinging drop moved ${clingerMovedWhileClinging}`);
  assert.ok(Math.abs(clinger.x - xs[1]) < 0.1, `clinger ended ${clinger.x - xs[1]} away`);
  assert.ok(loose.x - xs[0] > 0.3, `loose drop moved only ${loose.x - xs[0]}`);
});

test('cling drains stamina and locks out when empty', () => {
  const w = createWorld(stage('parked'), 3, { quickStart: true });
  startRace(w);
  const p = w.drops[0];
  const y0 = p.y;
  for (let i = 0; i < 60 * 1; i++) step(w, DT, { steer: 0, cling: true });
  assert.ok(p.stamina < 0.7);
  assert.ok(Math.abs(p.y - y0) < 0.02, 'clinging drop moved');
  let lowest = 1;
  let sinceEmpty = -1;
  let clingedInLockout = 0;
  for (let i = 0; i < 60 * 3; i++) {
    step(w, DT, { steer: 0, cling: true });
    lowest = Math.min(lowest, p.stamina);
    if (sinceEmpty < 0 && p.stamina === 0) sinceEmpty = 0;
    else if (sinceEmpty >= 0) sinceEmpty++;
    // First 1.2 s after running dry: no cling at all (no flicker while the key stays held).
    if (sinceEmpty > 0 && sinceEmpty < 72 && p.clinging) clingedInLockout++;
  }
  assert.equal(lowest, 0);
  assert.ok(drainEvents(w).some(e => e.type === 'cling-empty'));
  assert.equal(clingedInLockout, 0, `clung ${clingedInLockout} frames during the lockout`);
});

test('reaching the bottom finishes the race and the results come after the grace time', () => {
  const w = createWorld(stage('parked'), 8, { quickStart: true });
  startRace(w);
  const p = w.drops[0];
  p.y = H - 0.2;
  step(w, DT, { steer: 0, cling: false });
  assert.ok(p.finished);
  assert.equal(p.place, 1);
  assert.ok(!w.over);
  run(w, T.endGrace + 0.2, { steer: 0, cling: false });
  assert.ok(w.over);
  assert.ok(drainEvents(w).some(e => e.type === 'over'));
});

test('steering moves a drop sideways', () => {
  const w = createWorld(stage('parked'), 21, { quickStart: true });
  startRace(w);
  emptyGlass(w);
  const p = w.drops[0];
  p.x = 8;
  p.y = 2;
  const x0 = p.x;
  for (let i = 0; i < 60 * 2; i++) step(w, DT, { steer: -1, cling: false });
  assert.ok(p.x < x0 - 0.5, `moved ${p.x - x0}`);
  assert.ok(radiusOf(p.m) > 0);
});
