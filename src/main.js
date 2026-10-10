// Boot, state machine (title -> race -> results -> upgrade -> race ...), the frame loop and event routing.
// Three ways to play: practice (one heat), the six-heat cup, and the endless survival run.
import { STAGES, RIVALS, RACERS } from './config.js';
import { createWorld, step, drainEvents } from './sim/world.js';
import { UPGRADES, rollChoices } from './sim/upgrades.js';
import { CUP, cupStage, survivalStage, parTime, rivalBoost, START_LIVES, LIFE_EVERY } from './sim/modes.js';
import { mulberry32 } from './core/rng.js';
import { createView } from './render/scene.js';
import { createInput } from './core/input.js';
import { createAudio } from './audio/audio.js';
import { createHud } from './ui/hud.js';
import { createScreens } from './ui/screens.js';
import { settings, getRecord, submitRecord, getCup, submitCup, getSurvival, submitSurvival } from './core/storage.js';
import { STR, ordinal, fmtTime } from './strings.js';

const DT = 1 / 60;
const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const SLOW_SCALE = 0.4;

const host = document.getElementById('stage');
const hud = createHud();
const audio = createAudio();
audio.setMuted(settings.muted);
audio.setAmbience(settings.ambience);

let mode = 'title'; // title | race | results
let paused = false;
let world = null;
let stageIndex = 0;
let cup = null; // { idx, ups } while the cup runs
let run = null; // { lap, field, lives, kills, ups } while a survival run goes
let seedCounter = (Date.now() & 0xfffff) + 1;
let time = 0;
let acc = 0;
let last = 0;
let racesStarted = 0;
let slowFrames = 0;
let slowT = 0;
let frameEma = 1 / 60;
const fx = { flash: 0, follow: true, zoomOut: false, hideRing: true };

const screens = createScreens({
  onPlayCup: () => startCup(),
  onPlaySurvival: () => startRun(),
  onPractice: i => startPractice(i),
  onResume: () => setPaused(false),
  onQuit: () => quitToMenu(),
  onToggleSound: () => toggleSound(),
  onToggleAmbience: () => toggleAmbience(),
});

let view;
try {
  view = createView(host);
} catch (err) {
  console.error('Could not start the renderer:', err);
  screens.showError(STR.noWebgl);
  throw err;
}
const input = createInput(host);
input.bindButtons(document.getElementById('touch'));

function nextSeed() {
  seedCounter = (seedCounter * 1664525 + 1013904223) >>> 0;
  return seedCounter;
}

function loadWorld(w, stage) {
  world = w;
  view.setStage(stage);
  view.loadWorld(w);
  view.resetCamera();
  audio.setStage(stage);
  acc = 0;
  slowT = 0;
}

function startDemo(index) {
  const i = index !== undefined ? index : Math.floor(Math.random() * STAGES.length);
  const stage = STAGES[i];
  loadWorld(createWorld(stage, nextSeed(), { autopilot: true, quickStart: true }), stage);
  fx.follow = true;
  fx.hideRing = true;
  fx.zoomOut = false;
}

function allRecords() {
  const out = {};
  for (const s of STAGES) {
    const r = getRecord(s.id);
    if (r) out[s.id] = r;
  }
  return out;
}

function refreshTitleData() {
  screens.setRecords(allRecords(), getCup(), getSurvival());
}

function hideAllScreens() {
  screens.hideTitle();
  screens.hideResult();
  screens.hideUpgrade();
}

function showTitle() {
  mode = 'title';
  cup = null;
  run = null;
  setPaused(false);
  hideAllScreens();
  hud.hide();
  hud.clearBanner();
  hud.clearHint();
  refreshTitleData();
  screens.showTitle();
  startDemo();
}

// ---------- starting races ----------
// Common start: build the world, set up the camera and the HUD. `label` is the small text top right.
function beginRace(stage, opts, label, banner, ups, lives) {
  audio.start();
  mode = 'race';
  setPaused(false);
  hideAllScreens();
  loadWorld(createWorld(stage, nextSeed(), opts), stage);
  fx.follow = false;
  fx.hideRing = false;
  fx.zoomOut = false;
  input.reset();
  hud.show(world, label, ups, lives);
  hud.clearHint();
  hud.banner(banner, '', 3200);
  racesStarted++;
}

function startPractice(i) {
  cup = null;
  run = null;
  stageIndex = i;
  beginRace(STAGES[i], {}, STAGES[i].name, STAGES[i].name, [], null);
}

function startCup() {
  cup = { idx: 0, ups: [] };
  run = null;
  startCupHeat();
}

function startCupHeat() {
  const def = CUP[cup.idx];
  const stage = cupStage(cup.idx);
  const label = STR.heatIntro(cup.idx + 1, CUP.length, stage.name);
  beginRace(stage, { upgrades: cup.ups, rivalBoost: cup.idx * 0.04 }, label, `${label} · ${STR.cutLine(def.cut)}`, cup.ups, null);
}

function startRun() {
  cup = null;
  run = { lap: 0, field: Array.from({ length: RACERS }, (_, i) => i), lives: START_LIVES, kills: 0, ups: [] };
  startLap();
}

function startLap() {
  const stage = survivalStage(run.lap);
  const alone = run.field.length === 1;
  const opts = {
    survival: true,
    field: run.field,
    par: alone ? parTime(run.lap) : 0,
    upgrades: run.ups,
    rivalBoost: rivalBoost(run.lap),
  };
  const intro = alone ? STR.soloIntro(run.lap + 1, parTime(run.lap).toFixed(0)) : STR.lapIntro(run.lap + 1, run.field.length);
  beginRace(stage, opts, `${stage.name}`, `${intro} · ${stage.name}`, run.ups, { now: run.lives, max: START_LIVES });
}

function setPaused(on) {
  if (on === paused) return;
  if (on && mode !== 'race') return;
  paused = on;
  screens.showPause(on);
  if (on) audio.suspend();
  else audio.resume();
  last = performance.now();
}

// Leaving a race from the pause screen. A survival run keeps the lap you were on as its score.
function quitToMenu() {
  if (run) submitSurvival(run.lap + 1, run.kills);
  audio.resume();
  showTitle();
}

function toggleSound() {
  settings.muted = !settings.muted;
  audio.setMuted(settings.muted);
  screens.setMuted(settings.muted);
}

function toggleAmbience() {
  settings.ambience = !settings.ambience;
  audio.setAmbience(settings.ambience);
  screens.setAmbience(settings.ambience);
}

// ---------- results ----------
// Offers three upgrades and calls `then` once one is picked (or at once if nothing is left to offer).
function offerUpgrade(owned, then) {
  const rng = mulberry32(nextSeed());
  const choices = rollChoices(owned, rng, 3);
  if (!choices.length) {
    then();
    return;
  }
  const have = owned.map(id => UPGRADES.find(u => u.id === id)).filter(Boolean);
  screens.hideResult();
  screens.showUpgrade(choices, have, u => {
    owned.push(u.id);
    audio.upgrade();
    then();
  });
}

function onOver(e) {
  if (mode !== 'race') return;
  const me = world.drops[0];
  mode = 'results';
  fx.zoomOut = true;
  hud.hide();
  hud.clearBanner();
  hud.clearHint();
  if (run) onSurvivalLapOver(me);
  else if (cup) onCupHeatOver(me);
  else onPracticeOver(me);
}

const menuAction = { label: STR.menu, run: () => showTitle() };

function baseStats(me, flags) {
  const finished = me.finished && !me.wiped;
  return [
    { label: STR.place, value: finished ? ordinal(me.place) : '—', isNew: !!flags.newPlace },
    { label: STR.time, value: finished && me.finishTime !== null ? fmtTime(me.finishTime) : '—', isNew: !!flags.newTime },
  ];
}

function recordTime(me, level0) {
  // Only the base glass counts for personal bests, so the harder rounds do not overwrite them.
  if (!me.finished || me.wiped || me.cut || !level0) return { newTime: false, newPlace: false };
  return submitRecord(world.stage.id, me.finishTime, me.place);
}

function onPracticeOver(me) {
  const stage = world.stage;
  const finished = me.finished && !me.wiped;
  const flags = recordTime(me, true);
  const [big, sub] = finished ? STR.results[me.place] : STR.results.dnf;
  const stats = baseStats(me, flags);
  const rec = getRecord(stage.id);
  if (rec) stats.push({ label: STR.best, value: fmtTime(rec.time), isNew: false });
  const actions = [{ label: STR.again, primary: true, run: () => startPractice(stageIndex) }];
  if (stageIndex < STAGES.length - 1) actions.push({ label: STR.next, run: () => startPractice(stageIndex + 1) });
  actions.push(menuAction);
  refreshTitleData();
  screens.showResult({ big, sub, stats, note: flags.newTime ? STR.newBest : '', standings: world.standings.slice(), actions });
}

function onCupHeatOver(me) {
  const def = CUP[cup.idx];
  const finished = me.finished && !me.wiped;
  const place = finished ? me.place : 0;
  const flags = recordTime(me, def.level === 0);
  const last = cup.idx === CUP.length - 1;
  const made = finished && place <= def.cut;
  let big;
  let sub;
  const actions = [];
  if (!last && made) {
    [big, sub] = STR.through(place);
    audio.through();
    actions.push({
      label: STR.continue,
      primary: true,
      run: () => offerUpgrade(cup.ups, () => {
        cup.idx++;
        startCupHeat();
      }),
    });
  } else if (!last) {
    [big, sub] = STR.wiped(place);
    audio.wiped();
    actions.push({ label: STR.retryCup, primary: true, run: () => startCup() });
  } else if (finished && place === 1) {
    [big, sub] = STR.champion;
    actions.push({ label: STR.retryCup, primary: true, run: () => startCup() });
  } else {
    [big, sub] = STR.finalPlace(place || 6);
    audio.wiped();
    actions.push({ label: STR.retryCup, primary: true, run: () => startCup() });
  }
  actions.push(menuAction);
  submitCup(cup.idx + 1, last && finished ? place : 0);
  refreshTitleData();
  const stats = baseStats(me, flags);
  stats.unshift({ label: 'Heat', value: `${cup.idx + 1} / ${CUP.length}`, isNew: false });
  screens.showResult({ big, sub, stats, note: '', standings: world.standings.slice(), actions });
}

function onSurvivalLapOver(me) {
  const lap = run.lap + 1;
  const alone = run.field.length === 1;
  const iAmWiped = !!me.wiped;
  const flags = recordTime(me, run.lap < STAGES.length); // only the first, unscaled laps can set a heat record
  const stats = [{ label: STR.lapReached, value: String(lap), isNew: false }, ...baseStats(me, flags)];
  let big;
  let sub;
  let note = '';
  const actions = [];

  if (iAmWiped) {
    run.lives--;
    audio.wiped();
  } else {
    const gone = world.drops.find(d => d.wiped);
    if (gone) {
      run.field = run.field.filter(id => id !== gone.id);
      run.kills++;
      note = STR.rivalWiped(gone.name);
    }
    if ((run.lap + 1) % LIFE_EVERY === 0 && run.lives < START_LIVES) {
      run.lives++;
      note = note ? `${note} · ${STR.lifeBack}` : STR.lifeBack;
    }
    audio.through();
  }

  if (iAmWiped && run.lives <= 0) {
    // The run is over.
    const best = submitSurvival(lap, run.kills);
    [big, sub] = STR.runOver(lap);
    stats.push({ label: STR.wipedStat, value: String(run.kills), isNew: best.newKills });
    stats[0].isNew = best.newLaps;
    note = best.newLaps ? STR.newBestLap : '';
    actions.push({ label: STR.again, primary: true, run: () => startRun() });
    actions.push(menuAction);
    refreshTitleData();
  } else {
    if (iAmWiped) {
      [big, sub] = [me.wipedWhy === 'time' ? STR.lifeLostTime : STR.lifeLost, `${run.lives} ${run.lives === 1 ? 'life' : 'lives'} left`];
    } else if (alone) {
      [big, sub] = STR.safeAlone;
    } else {
      [big, sub] = STR.safe(me.place);
    }
    stats.push({ label: STR.lives, value: `${run.lives} / ${START_LIVES}`, isNew: false });
    actions.push({
      label: STR.continue,
      primary: true,
      run: () => offerUpgrade(run.ups, () => {
        run.lap++;
        startLap();
      }),
    });
    actions.push({ label: STR.menu, run: () => {
      submitSurvival(lap, run.kills);
      showTitle();
    } });
  }
  screens.showResult({ big, sub, stats, note, standings: world.standings.slice(), actions });
}

// ---------- events ----------
const rivalName = id => (id === 0 ? 'You' : RIVALS[id - 1].name);
const nearPlayer = (x, y, r = 4.5) => {
  const p = world.drops[0];
  return Math.hypot(x - p.x, y - p.y) < r;
};

function handleEvent(e) {
  if (world.autopilot || mode === 'title') return;
  const me = world.drops[0];
  switch (e.type) {
    case 'count':
      hud.countdown(STR.count[e.n]);
      audio.count(e.n);
      break;
    case 'go':
      hud.countdown(STR.count.go);
      audio.count(0);
      if (racesStarted <= 2) hud.hint(STR.hint);
      else if (racesStarted <= 4) hud.hint(STR.hintFlow);
      break;
    case 'gulp':
      if (e.id === 0) audio.gulp(e.mass);
      if (nearPlayer(e.x, e.y)) view.burst(e.x, e.y, 'gulp');
      break;
    case 'chain':
      if (e.id === 0) {
        audio.chain(e.n);
        view.burst(me.x, me.y, 'chain');
      }
      break;
    case 'chain-lost':
      if (e.id === 0) audio.chainLost();
      break;
    case 'bite':
      if (e.small === 0) {
        hud.banner(STR.bitten(rivalName(e.big)), 'bad');
        audio.bitten();
        view.shake(0.7);
      } else if (e.big === 0) {
        hud.banner(STR.bit(rivalName(e.small)), 'good');
        audio.bite();
      }
      if (nearPlayer(e.x, e.y)) view.burst(e.x, e.y, 'bite');
      break;
    case 'bug':
      if (nearPlayer(e.x, e.y)) view.burst(e.x, e.y, 'bug');
      if (e.id === 0 && !e.harmless) {
        hud.banner(STR.bug, 'bad', 1300);
        audio.bug();
        view.shake(0.5);
      }
      break;
    case 'wiper-warn':
      hud.banner(STR.wiperWarn, 'warn', 1700);
      audio.wiperWarn();
      break;
    case 'wiper-start':
      audio.wiperSweep(world.wipers.sweep * 2);
      break;
    case 'wiper-hit':
      if (nearPlayer(e.x, e.y)) view.burst(e.x, e.y, 'wiper');
      if (e.id === 0) {
        hud.banner(STR.wiperHit, 'bad', 1600);
        audio.wiperHit();
        view.shake(1.3);
        slowT = 0.3;
      }
      break;
    case 'wiper-dodged':
      if (e.id === 0) hud.banner(STR.wiperDodged, 'good', 1200);
      break;
    case 'car-warn':
      hud.banner(STR.car[e.kind], 'warn', 1700);
      audio.wiperWarn();
      break;
    case 'car-start':
      if (e.kind === 'brake') audio.brake();
      else if (e.kind === 'pothole') {
        audio.pothole();
        view.shake(1.5);
        view.burst(me.x, me.y, 'splash');
      } else audio.turn();
      break;
    case 'splash-warn':
      hud.banner(STR.splashWarn, 'warn', 1900);
      audio.splashWarn();
      break;
    case 'splash-start':
      audio.splashStart();
      fx.flash = 0.7;
      view.shake(0.5);
      break;
    case 'splash-hit':
      if (e.id === 0) {
        hud.banner(STR.splashHit, 'bad', 1400);
        audio.splashHit();
        view.shake(1);
        view.burst(me.x, me.y, 'splash');
      }
      break;
    case 'splash-dodged':
      if (e.id === 0) hud.banner(STR.splashDodged, 'good', 1400);
      break;
    case 'cling':
      if (e.id === 0) audio.cling();
      break;
    case 'cling-empty':
      if (e.id === 0) {
        hud.banner(STR.clingEmpty, 'bad', 900);
        audio.clingEmpty();
      }
      break;
    case 'finish': {
      const d = world.drops[e.id];
      if (e.id === 0) {
        hud.banner(STR.finish(e.place), e.place <= 3 ? 'good' : '', 2400);
        audio.finish(e.place);
        view.burst(d.x, d.y, 'finish');
      } else {
        audio.rivalFinish();
      }
      break;
    }
    case 'wiped': {
      const d = world.drops[e.id];
      d.wipedWhy = e.why;
      view.burst(e.x, e.y, 'wiper');
      view.shake(e.id === 0 ? 1.4 : 0.4);
      audio.wiperHit();
      if (e.id === 0) hud.banner(e.why === 'time' ? STR.youWipedTime : STR.youWiped, 'bad', 2600);
      else hud.banner(STR.wipedBanner(d.name), 'good', 2200);
      break;
    }
    case 'over':
      onOver(e);
      break;
    default:
  }
}

function simulate(dt) {
  acc += dt;
  let n = 0;
  const inp = mode === 'race' ? input.read() : null;
  while (acc >= DT && n < 6) {
    step(world, DT, inp);
    acc -= DT;
    n++;
    for (const e of drainEvents(world)) handleEvent(e);
    if (mode === 'title' && world.over) startDemo();
  }
  if (acc > DT * 6) acc = 0;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (!paused) {
    // A short slow-motion beat when a wiper blade catches you.
    const simDt = slowT > 0 ? dt * SLOW_SCALE : dt;
    if (slowT > 0) slowT -= dt;
    simulate(simDt);
    time += dt;
    fx.flash = Math.max(0, fx.flash - dt * 1.6);
  }
  view.update(world, paused ? 0 : dt, time, fx);
  view.render();
  if (mode === 'race') hud.update(world);
  audio.update(dt, world, mode === 'race' && world.phase === 'race' && !paused);

  // Drop the pixel ratio if the device cannot keep up.
  frameEma = frameEma * 0.95 + dt * 0.05;
  if (frameEma > 0.027 && !paused) {
    if (++slowFrames > 150 && view.pixelRatio > 0.8) {
      view.setPixelRatio(view.pixelRatio * 0.85);
      slowFrames = 0;
    }
  } else {
    slowFrames = 0;
  }
}

function onResize() {
  view.resize(host.clientWidth || window.innerWidth, host.clientHeight || window.innerHeight);
}

function toggleFullscreen() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  } catch {
    // fullscreen not allowed here
  }
}

input.onKey(k => {
  if (k === 'h') document.body.classList.toggle('hide-ui');
  else if (k === 'f') toggleFullscreen();
  else if (k === 'm') toggleSound();
  else if (k === 'n') toggleAmbience();
  else if ((k === 'p' || k === 'escape') && mode === 'race') setPaused(!paused);
  else if (k === 'r' && mode === 'race' && !cup && !run) startPractice(stageIndex); // the cup and survival have no do-overs
  else if (k === 'enter' && !(document.activeElement && document.activeElement.tagName === 'BUTTON')) {
    if (paused) setPaused(false);
    else if (mode === 'title') startCup();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audio.suspend();
    if (mode === 'race' && world.phase === 'race') setPaused(true);
  } else if (!paused) {
    audio.resume();
    last = performance.now();
  }
});

window.addEventListener('resize', onResize);
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onResize).observe(host);
if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch-ui');
window.addEventListener('touchstart', () => document.body.classList.add('touch-ui'), { once: true, passive: true });

// Boot
const startStage = STAGES.findIndex(s => s.id === params.get('stage'));
if (startStage >= 0) screens.select(startStage);
screens.setMuted(settings.muted);
screens.setAmbience(settings.ambience);
onResize();
showTitle();
if (params.get('autostart') === '1') {
  if (params.get('mode') === 'survival') startRun();
  else if (startStage >= 0) startPractice(startStage);
  else startCup();
}
last = performance.now();
requestAnimationFrame(frame);

if (DEBUG) {
  // Drive the game from the console / the in-app browser: __rd.advance(5) steps the sim 5 seconds and renders.
  window.__rd = {
    get world() { return world; },
    get mode() { return mode; },
    get cup() { return cup; },
    get run() { return run; },
    view,
    input,
    advance(seconds = 1) {
      const n = Math.round(seconds / DT);
      const inp = mode === 'race' ? input.read() : null;
      for (let i = 0; i < n; i++) {
        step(world, DT, inp);
        for (const e of drainEvents(world)) handleEvent(e);
      }
      time += seconds;
      view.update(world, 0.016, time, fx);
      view.render();
      if (mode === 'race') hud.update(world);
      return { phase: world.phase, t: +world.raceTime.toFixed(1), place: world.standings.indexOf(world.drops[0]) + 1 };
    },
    start: i => startPractice(i),
    startCup: () => startCup(),
    startRun: () => startRun(),
    title: () => showTitle(),
    dev: {
      setMass(id, m) { world.drops[id].m = m; },
      place(id, x, y) { world.drops[id].x = x; world.drops[id].y = y; },
      info: () => view.info(),
      forceWin() { const p = world.drops[0]; p.y = 7.9; },
      ordinal,
    },
  };
}
