import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, GRID_W, GRID_H, CELL } from '../../src/config.js';
import { targetVelocity } from '../../src/sim/physics.js';
import { buildMods, UPGRADES, rollChoices } from '../../src/sim/upgrades.js';
import { mulberry32, shuffle } from '../../src/core/rng.js';
import { valueNoise2 } from '../../src/sim/noise.js';

function blankWorld(wind = 0) {
  return {
    wet: new Float32Array(GRID_W * GRID_H),
    wetOwner: new Int16Array(GRID_W * GRID_H).fill(-1),
    grime: new Float32Array(GRID_W * GRID_H),
    wax: new Float32Array(GRID_W * GRID_H),
    wind,
    push: null,
  };
}
const out = { vx: 0, vy: 0 };
const idxAt = (x, y) => Math.floor(y / CELL) * GRID_W + Math.floor(x / CELL);
const vy = (w, m, steer = 0, d = null) => {
  targetVelocity(w, 8, 3, m, steer, false, d, out);
  return out.vy;
};

test('bigger drops slide faster', () => {
  const w = blankWorld();
  assert.ok(vy(w, 3) > vy(w, 1.2) * 1.5);
});

test('dirty glass slows a drop', () => {
  const w = blankWorld();
  const clean = vy(w, 2);
  w.grime[idxAt(8, 3)] = 1;
  assert.ok(vy(w, 2) < clean * 0.8);
});

test('a fresh trail left by someone else is a slipstream, your own trail is not', () => {
  const w = blankWorld();
  const me = { id: 0, seedA: 1, seedB: 2, mods: buildMods([]), chain: 0 };
  const base = vy(w, 2, 0, me);
  w.wet[idxAt(8, 3)] = 1;
  w.wetOwner[idxAt(8, 3)] = 3;
  const drafted = vy(w, 2, 0, me);
  w.wetOwner[idxAt(8, 3)] = 0;
  const own = vy(w, 2, 0, me);
  assert.ok(drafted > base * 1.5, `drafted ${drafted} base ${base}`);
  assert.ok(Math.abs(own - base) < 1e-9, 'own trail helped');
});

test('wax lanes are fast', () => {
  const w = blankWorld();
  const base = vy(w, 2);
  w.wax[idxAt(8, 3)] = 1;
  assert.ok(vy(w, 2) > base * 1.5);
});

test('each link of a chain adds speed', () => {
  const w = blankWorld();
  const mods = buildMods([]);
  const a = vy(w, 2, 0, { id: 0, seedA: 1, seedB: 2, mods, chain: 0 });
  const b = vy(w, 2, 0, { id: 0, seedA: 1, seedB: 2, mods, chain: 5 });
  assert.ok(b > a * 1.4);
});

test('a small drop gets stuck on heavy grime but can still steer out sideways', () => {
  const w = blankWorld();
  w.grime[idxAt(8, 3)] = 1;
  targetVelocity(w, 8, 3, 0.6, 0, false, null, out);
  assert.equal(out.vy, 0);
  targetVelocity(w, 8, 3, 0.6, 1, false, null, out);
  assert.ok(out.vx > 0.1);
});

test('wind pushes drops up the windshield and out toward the pillars, small ones more', () => {
  const w = blankWorld(0.8);
  const calm = blankWorld(0);
  assert.ok(vy(w, 3) < vy(calm, 3));
  targetVelocity(w, 13, 3, 3, 0, false, null, out);
  assert.ok(out.vx > 0, 'right side is not pushed right');
  targetVelocity(w, 3, 3, 3, 0, false, null, out);
  assert.ok(out.vx < 0, 'left side is not pushed left');
});

test('clinging freezes a drop', () => {
  const w = blankWorld(0.7);
  targetVelocity(w, 8, 3, 3, 1, true, null, out);
  assert.equal(out.vx, 0);
  assert.equal(out.vy, 0);
});

test('turning costs downward speed', () => {
  const w = blankWorld();
  assert.ok(vy(w, 2, 1) < vy(w, 2, 0));
});

test('braking throws drops down, a turn throws them sideways', () => {
  const w = blankWorld();
  const base = vy(w, 2);
  w.push = { vx: 0, vyMul: 2 };
  assert.ok(vy(w, 2) > base * 1.8);
  w.push = { vx: 1.5, vyMul: 1 };
  targetVelocity(w, 8, 3, 2, 0, false, null, out);
  assert.ok(out.vx > 1);
});

test('upgrades change the numbers they say they change', () => {
  const m = buildMods(['sponge', 'heavy', 'slick']);
  assert.ok(m.absorb > 1.5);
  assert.ok(m.startMass > 0.5 && m.shed < 1);
  assert.equal(m.slick, 0);
  assert.ok(UPGRADES.length >= 6);
});

test('upgrade offers are three different ones the player does not own', () => {
  const rng = mulberry32(3);
  const offer = rollChoices(['sponge', 'heavy'], rng, 3);
  assert.equal(offer.length, 3);
  assert.equal(new Set(offer.map(o => o.id)).size, 3);
  assert.ok(offer.every(o => o.id !== 'sponge' && o.id !== 'heavy'));
});

test('stage data is sane', () => {
  for (const s of STAGES) {
    assert.ok(s.startSpan[1] > s.startSpan[0]);
    assert.ok(s.rain > 0 && s.initialDroplets >= 0);
    assert.ok(s.cut >= 1 && s.cut <= 6);
  }
  assert.equal(STAGES[STAGES.length - 1].cut, 1, 'the final must be won');
});

test('seeded random and noise are deterministic', () => {
  const a = mulberry32(5);
  const b = mulberry32(5);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
  assert.deepEqual(shuffle([1, 2, 3, 4, 5, 6], mulberry32(9)), shuffle([1, 2, 3, 4, 5, 6], mulberry32(9)));
  assert.equal(valueNoise2(1.3, 2.7, 4), valueNoise2(1.3, 2.7, 4));
  const v = valueNoise2(3.3, 1.1, 2);
  assert.ok(v >= 0 && v <= 1);
});
