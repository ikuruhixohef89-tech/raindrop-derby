import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, W, H, TUNING as T } from '../../src/config.js';
import { createWorld, step, drainEvents } from '../../src/sim/world.js';
import { wiperDistance } from '../../src/sim/hazards.js';

const DT = 1 / 60;
const stage = id => STAGES.find(s => s.id === id);

function startRace(w) {
  while (w.phase === 'grid') step(w, DT, null);
}
// A quiet glass: no rain, no random hazards unless the test asks for them.
function quiet(w) {
  w.droplets.length = 0;
  w.nextRain = 1e9;
  w.splash.next = 1e9;
  if (w.wipers) w.wipers.next = 1e9;
  if (w.carEvt) w.carEvt.next = 1e9;
  w.bugs.length = 0;
  for (const d of w.drops) if (!d.isPlayer) d.y = 0.4;
}
const IDLE = { steer: 0, cling: false };

test('swallowing droplets quickly builds a chain, and it runs out', () => {
  const w = createWorld(stage('parked'), 4, { quickStart: true });
  startRace(w);
  quiet(w);
  const p = w.drops[0];
  p.x = 8;
  p.y = 3;
  for (let i = 0; i < 4; i++) w.droplets.push({ x: p.x + 0.02, y: p.y + 0.02, m: 0.15, id: 500 + i });
  step(w, DT, IDLE);
  assert.ok(p.chain >= 4, `chain ${p.chain}`);
  assert.ok(drainEvents(w).some(e => e.type === 'chain' && e.id === 0));
  for (let i = 0; i < 60 * 3; i++) step(w, DT, IDLE);
  assert.equal(p.chain, 0);
});

test('a wiper blade throws a loose drop back up the glass and costs mass', () => {
  const w = createWorld(stage('city'), 6, { quickStart: true });
  startRace(w);
  quiet(w);
  const p = w.drops[0];
  p.m = 3;
  p.x = w.wipers.pivots[0].x - 3;
  p.y = H - 1.2;
  const y0 = p.y;
  w.wipers.next = 0;
  let hit = false;
  for (let i = 0; i < 60 * 8 && !hit; i++) {
    step(w, DT, IDLE);
    hit = drainEvents(w).some(e => e.type === 'wiper-hit' && e.id === 0);
  }
  assert.ok(hit, 'the wiper never hit the drop');
  assert.ok(p.m < 3 * 0.7, `mass ${p.m}`);
  assert.ok(p.y < y0, 'not thrown back up');
});

test('clinging gets you through a wiper sweep untouched', () => {
  const w = createWorld(stage('city'), 6, { quickStart: true });
  startRace(w);
  quiet(w);
  const p = w.drops[0];
  p.m = 3;
  p.x = w.wipers.pivots[0].x - 3;
  p.y = H - 1.2;
  w.wipers.next = 0;
  let dodged = false;
  let hit = false;
  for (let i = 0; i < 60 * 8; i++) {
    // Hold cling only while a blade is near, like a player would.
    const near = wiperDistance(w, p) < 1.7;
    step(w, DT, { steer: 0, cling: near });
    for (const e of drainEvents(w)) {
      if (e.type === 'wiper-dodged' && e.id === 0) dodged = true;
      if (e.type === 'wiper-hit' && e.id === 0) hit = true;
    }
  }
  assert.ok(dodged, 'never dodged');
  assert.ok(!hit, 'was hit anyway');
});

test('a bug costs mass and kills the chain', () => {
  const w = createWorld(stage('city'), 2, { quickStart: true });
  startRace(w);
  quiet(w);
  const p = w.drops[0];
  p.m = 2;
  p.x = 8;
  p.y = 3;
  p.chain = 3;
  p.chainT = 1;
  w.bugs.push({ x: 8.02, y: 3.02, r: 0.2, rot: 0, kind: 0 });
  step(w, DT, IDLE);
  assert.ok(drainEvents(w).some(e => e.type === 'bug' && e.id === 0));
  assert.ok(p.m < 2 * 0.95);
  assert.equal(p.chain, 0);
});

test('car events are announced, then happen, then end', () => {
  const w = createWorld(stage('highway'), 12, { quickStart: true });
  startRace(w);
  quiet(w);
  w.carEvt.next = 0;
  const seen = new Set();
  for (let i = 0; i < 60 * 6; i++) {
    step(w, DT, IDLE);
    for (const e of drainEvents(w)) seen.add(e.type);
  }
  assert.ok(seen.has('car-warn'));
  assert.ok(seen.has('car-start'));
  assert.ok(seen.has('car-end'));
  assert.equal(w.push, null);
});

test('rain keeps feeding a drop, so nobody is stuck forever', () => {
  const w = createWorld(stage('highway'), 3, { quickStart: true });
  startRace(w);
  quiet(w);
  const p = w.drops[0];
  p.m = T.minMass;
  p.clinging = false;
  const before = p.m;
  for (let i = 0; i < 60 * 5; i++) step(w, DT, { steer: 0, cling: true });
  assert.ok(p.m > before + 0.2, `mass only ${p.m}`);
});

test('player upgrades reach the player and nobody else', () => {
  const w = createWorld(stage('parked'), 1, { quickStart: true, upgrades: ['heavy', 'sponge'] });
  assert.ok(w.drops[0].m > w.drops[1].m + 0.5);
  assert.ok(w.drops[0].mods.absorb > 1);
  assert.equal(w.drops[1].mods.absorb, 1);
});

test('rival boost makes later heats harder', () => {
  const a = createWorld(stage('city'), 1, { quickStart: true });
  const b = createWorld(stage('city'), 1, { quickStart: true, rivalBoost: 0.1 });
  assert.ok(b.drops[1].skill > a.drops[1].skill);
  assert.ok(W > 0);
});
