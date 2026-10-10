// All sound is made here with Web Audio: rain, engine, wind and the effects. No audio files.
// The AudioContext is created only after the player clicks PLAY (autoplay rules inside an iframe).
// Design rule: nothing harsh. Rain is soft pink noise with slow swells and quiet drips; effects use sine and triangle tones.
export function createAudio() {
  let ctx = null;
  let master = null;
  let ambience = null; // everything that plays in the background, so it can be switched off alone
  let rainGain = null;
  let roofGain = null;
  let carGain = null;
  let windGain = null;
  let pinkBuf = null;
  let brownBuf = null;
  let muted = false;
  let bedOn = true;
  let level = { rain: 0.4, car: 0, wind: 0 };
  let dripClock = 0;

  const MASTER = 0.6;

  function loopSource(buf) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    return src;
  }

  function makeNoiseBuffers() {
    const len = ctx.sampleRate * 4;
    pinkBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const p = pinkBuf.getChannelData(0);
    const b = brownBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let brown = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      // Paul Kellet's pink noise filter.
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
      brown = (brown + 0.02 * white) / 1.02;
      b[i] = brown * 3.5;
    }
  }

  function start() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER;
    master.connect(comp);
    comp.connect(ctx.destination);
    ambience = ctx.createGain();
    ambience.gain.value = bedOn ? 1 : 0;
    ambience.connect(master);
    makeNoiseBuffers();

    // Rain on glass: soft pink noise, no hiss, with a slow swell like real rain.
    const rain = loopSource(pinkBuf);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 220;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    lp.Q.value = 0.4;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    rain.connect(hp).connect(lp).connect(rainGain).connect(ambience);
    rain.start();
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.13;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.018;
    swell.connect(swellDepth).connect(rainGain.gain);
    swell.start();

    // Rain on the roof: a low, distant wash.
    const roof = loopSource(brownBuf);
    const roofLp = ctx.createBiquadFilter();
    roofLp.type = 'lowpass';
    roofLp.frequency.value = 520;
    roofGain = ctx.createGain();
    roofGain.gain.value = 0;
    roof.connect(roofLp).connect(roofGain).connect(ambience);
    roof.start();

    // Car: a low rumble, only while it moves.
    const car = loopSource(brownBuf);
    const carLp = ctx.createBiquadFilter();
    carLp.type = 'lowpass';
    carLp.frequency.value = 130;
    carGain = ctx.createGain();
    carGain.gain.value = 0;
    car.connect(carLp).connect(carGain).connect(ambience);
    car.start();

    // Wind: gentle air, a band of pink noise.
    const wind = loopSource(pinkBuf);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.35;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(bp).connect(windGain).connect(ambience);
    wind.start();
  }

  // A pure tone with a soft attack and a smooth fall.
  function tone(freq, dur, type = 'sine', vol = 0.12, freqEnd = null, delay = 0, bus = null) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.015, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  // A burst of filtered noise (swooshes). Always low-passed so it never turns into hiss.
  function whoosh(dur, freq, vol, freqEnd = null, delay = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = pinkBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.06, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.05);
  }

  // One drip on the glass: a very short, quiet, falling sine.
  function drip(vol) {
    const f = 700 + Math.random() * 1700;
    tone(f, 0.05 + Math.random() * 0.04, 'sine', vol, f * 0.62, 0, ambience);
  }

  return {
    start,
    get ready() {
      return !!ctx;
    },
    setStage(stage) {
      level = { rain: stage.rain, car: stage.carSpeed, wind: stage.wind };
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.setTargetAtTime(m ? 0 : MASTER, ctx.currentTime, 0.04);
    },
    setAmbience(on) {
      bedOn = on;
      if (ambience) ambience.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.1);
    },
    suspend() {
      if (ctx && ctx.state === 'running') ctx.suspend();
    },
    resume() {
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    // Called every frame: smooth the beds, sprinkle drips.
    update(dt, world, active) {
      if (!ctx || !bedOn) return;
      const t = ctx.currentTime;
      const calm = active ? 1 : 0.6;
      rainGain.gain.setTargetAtTime((0.05 + level.rain * 0.045) * calm, t, 0.3);
      roofGain.gain.setTargetAtTime((0.05 + level.rain * 0.05) * calm, t, 0.3);
      carGain.gain.setTargetAtTime(level.car > 0 ? (0.05 + level.car * 0.09) * calm : 0, t, 0.5);
      const wind = world ? world.wind : level.wind;
      windGain.gain.setTargetAtTime(Math.min(0.14, wind * 0.12) * calm, t, 0.4);
      // Quiet drips, more in heavier rain.
      dripClock += dt * (3 + level.rain * 5) * (active ? 1 : 0.5);
      while (dripClock >= 1) {
        dripClock -= 1;
        if (Math.random() < 0.85) drip(0.006 + Math.random() * 0.012);
      }
    },
    count(n) {
      tone(n === 0 ? 880 : 440, n === 0 ? 0.35 : 0.12, 'sine', 0.12);
    },
    gulp(mass) {
      tone(300 + mass * 26, 0.09, 'sine', 0.1, 560 + mass * 36);
    },
    bite() {
      tone(200, 0.16, 'triangle', 0.09, 80);
    },
    bitten() {
      tone(240, 0.22, 'triangle', 0.1, 100);
    },
    splashWarn() {
      whoosh(1.5, 400, 0.08, 1800);
    },
    splashStart() {
      whoosh(1.3, 1600, 0.16, 200);
    },
    splashHit() {
      tone(140, 0.28, 'triangle', 0.12, 55);
    },
    cling() {
      tone(1500, 0.04, 'triangle', 0.05);
    },
    clingEmpty() {
      tone(170, 0.18, 'triangle', 0.07, 90);
    },
    finish(place) {
      const notes = place === 1 ? [523, 659, 784, 1047] : place <= 3 ? [440, 554, 659] : [330, 262];
      notes.forEach((f, i) => tone(f, 0.28, 'triangle', 0.11, null, i * 0.11));
    },
    rivalFinish() {
      tone(700, 0.05, 'sine', 0.04);
    },
    // Chain links climb a scale: the longer the flow, the higher it sings.
    chain(n) {
      const scale = [0, 2, 4, 7, 9, 12, 14, 16];
      const semi = scale[Math.min(scale.length - 1, Math.max(0, n - 1))];
      tone(440 * Math.pow(2, semi / 12), 0.13, 'triangle', 0.1);
    },
    chainLost() {
      tone(330, 0.2, 'sine', 0.05, 180);
    },
    brake() {
      whoosh(0.9, 1400, 0.1, 300);
      tone(260, 0.7, 'triangle', 0.04, 90);
    },
    turn() {
      whoosh(0.8, 500, 0.1, 1500);
    },
    pothole() {
      tone(90, 0.25, 'sine', 0.25, 40);
    },
    wiperWarn() {
      tone(520, 0.1, 'triangle', 0.06);
      tone(520, 0.1, 'triangle', 0.06, null, 0.18);
    },
    wiperSweep(len) {
      whoosh(len, 500, 0.07, 1800);
    },
    wiperHit() {
      tone(120, 0.32, 'triangle', 0.16, 50);
      whoosh(0.2, 900, 0.1);
    },
    bug() {
      tone(150, 0.12, 'sine', 0.1, 60);
    },
    upgrade() {
      [523, 659, 784].forEach((f, i) => tone(f, 0.2, 'triangle', 0.1, null, i * 0.07));
    },
    through() {
      [392, 523, 659].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, null, i * 0.1));
    },
    wiped() {
      tone(220, 0.5, 'triangle', 0.1, 70);
    },
  };
}
