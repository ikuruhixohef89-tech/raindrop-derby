import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecord, submitRecord, settings, getCup, submitCup, getSurvival, submitSurvival } from '../../src/core/storage.js';

// In Node there is no window.localStorage; the module must still work from memory.

test('records keep the best time and best place separately', () => {
  assert.equal(getRecord('t1'), null);
  assert.deepEqual(submitRecord('t1', 40, 4), { newTime: true, newPlace: true });
  assert.deepEqual(submitRecord('t1', 45, 2), { newTime: false, newPlace: true });
  assert.deepEqual(submitRecord('t1', 38, 3), { newTime: true, newPlace: false });
  assert.deepEqual(getRecord('t1'), { time: 38, place: 2 });
});

test('an unfinished race (place 0) never counts', () => {
  assert.deepEqual(submitRecord('t2', 99, 0), { newTime: false, newPlace: false });
  assert.equal(getRecord('t2'), null);
});

test('cup progress keeps the furthest heat and the best final place', () => {
  assert.deepEqual(getCup(), { heats: 0, final: 0 });
  assert.deepEqual(submitCup(2, 0), { heats: 2, final: 0 });
  assert.deepEqual(submitCup(1, 0), { heats: 2, final: 0 });
  assert.deepEqual(submitCup(3, 4), { heats: 3, final: 4 });
  assert.deepEqual(submitCup(3, 2), { heats: 3, final: 2 });
  assert.deepEqual(submitCup(3, 5), { heats: 3, final: 2 });
});

test('survival keeps the furthest lap and the most rivals wiped, separately', () => {
  assert.deepEqual(getSurvival(), { laps: 0, kills: 0 });
  assert.deepEqual(submitSurvival(4, 1), { newLaps: true, newKills: true });
  assert.deepEqual(submitSurvival(3, 2), { newLaps: false, newKills: true });
  assert.deepEqual(submitSurvival(9, 1), { newLaps: true, newKills: false });
  assert.deepEqual(getSurvival(), { laps: 9, kills: 2 });
});

test('the rain-sound setting is remembered separately from mute', () => {
  assert.equal(settings.ambience, true);
  settings.ambience = false;
  assert.equal(settings.ambience, false);
  assert.equal(settings.muted, false);
  settings.ambience = true;
});

test('mute setting works without localStorage', () => {
  settings.muted = true;
  assert.equal(settings.muted, true);
  settings.muted = false;
  assert.equal(settings.muted, false);
});
