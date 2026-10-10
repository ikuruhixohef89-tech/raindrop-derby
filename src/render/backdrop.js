// The night world outside the windshield, painted with canvas code (no image files).
// Two layers that scroll at different speeds, so the street has depth:
//   far  = sky, clouds, stars, a hazy skyline, the wet road      (opaque, scrolls slowly)
//   near = out-of-focus lights, street lamps, car light streaks  (additive, scrolls fast)
// Each layer exists twice: a heavily blurred one for the glass, and a sharper one that shows up upside down inside every drop.
import * as THREE from '../../vendor/three.min.js';
import { mulberry32 } from '../core/rng.js';

const TW = 2048;
const TH = 1024;
const HORIZON = TH * 0.56;

const PALETTES = [
  // 0: parked, dusk with a low moon and sodium lamps
  {
    sky: [[0, '#070d1c'], [0.45, '#14264a'], [0.8, '#3a4a78'], [1, '#c9824f']],
    haze: [255, 170, 110], cloud: [150, 170, 220], cloudAlpha: 0.16, stars: 150, moon: true, lightning: false, neon: 0, tail: 0.1,
    lights: [[255, 175, 95], [255, 205, 140], [130, 195, 255], [255, 130, 80]],
    building: ['#2a3350', '#161d33', '#0a0e1a'], windows: 0.12, lamps: 5,
  },
  // 1: city, wet neon night
  {
    sky: [[0, '#0a0820'], [0.45, '#241552'], [0.8, '#6a2a74'], [1, '#ff5aa5']],
    haze: [255, 90, 170], cloud: [170, 110, 220], cloudAlpha: 0.14, stars: 40, moon: false, lightning: false, neon: 14, tail: 0.5,
    lights: [[255, 70, 150], [60, 220, 255], [255, 200, 80], [255, 60, 60], [120, 255, 160]],
    building: ['#3a2a66', '#1c1444', '#0b0824'], windows: 0.2, lamps: 6,
  },
  // 2: highway storm, heavy clouds, lightning, streaming tail lights
  {
    sky: [[0, '#03060d'], [0.5, '#0b1624'], [0.85, '#1c3550'], [1, '#6aa6d8']],
    haze: [120, 175, 220], cloud: [110, 140, 175], cloudAlpha: 0.24, stars: 0, moon: false, lightning: true, neon: 3, tail: 1,
    lights: [[255, 60, 50], [255, 90, 70], [210, 235, 255], [255, 255, 255], [255, 150, 60]],
    building: ['#1b2c40', '#0e1a2a', '#05090f'], windows: 0.06, lamps: 4,
  },
];

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Blur by shrinking in halves and scaling back up. Works everywhere (no canvas filter needed).
function blur(src, divisor, outW = src.width, outH = src.height) {
  let cur = src;
  const targetW = Math.max(4, Math.round(src.width / divisor));
  while (cur.width / 2 >= targetW) {
    const next = makeCanvas(Math.round(cur.width / 2), Math.round(cur.height / 2));
    const ctx = next.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, next.width, next.height);
    cur = next;
  }
  const out = makeCanvas(outW, outH);
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(cur, 0, 0, out.width, out.height);
  return out;
}

const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Draw something that may cross the right edge, again shifted left by one width, so the texture tiles without a seam.
function wrapped(x, width, draw) {
  draw(x);
  if (x + width > TW) draw(x - TW);
  if (x < 0) draw(x + TW);
}

function paintSky(ctx, rng, pal) {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON + 30);
  for (const [t, c] of pal.sky) g.addColorStop(t, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TW, HORIZON + 30);

  for (let i = 0; i < pal.stars; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 + rng() * 0.6})`;
    const s = rng() < 0.12 ? 2 : 1;
    ctx.fillRect(rng() * TW, rng() * HORIZON * 0.55, s, s);
  }
  if (pal.moon) {
    const mx = TW * 0.72;
    const my = HORIZON * 0.38;
    const halo = ctx.createRadialGradient(mx, my, 0, mx, my, 220);
    halo.addColorStop(0, 'rgba(255,225,180,0.55)');
    halo.addColorStop(0.2, 'rgba(255,200,150,0.18)');
    halo.addColorStop(1, 'rgba(255,200,150,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(mx - 240, my - 240, 480, 480);
    ctx.fillStyle = 'rgba(255,240,215,0.92)';
    ctx.beginPath();
    ctx.arc(mx, my, 34, 0, Math.PI * 2);
    ctx.fill();
  }
  // Clouds: big soft ellipses, lit from below by the city.
  const clouds = pal.lightning ? 26 : 16;
  for (let i = 0; i < clouds; i++) {
    const cx = rng() * TW;
    const cy = HORIZON * (0.08 + rng() * 0.62);
    const rx = 150 + rng() * 330;
    const ry = 26 + rng() * 60;
    const lit = cy / HORIZON;
    const col = mix(pal.cloud, pal.haze, lit * 0.55);
    wrapped(cx - rx, rx * 2, ox => {
      ctx.save();
      ctx.translate(ox + rx, cy);
      ctx.scale(1, ry / rx);
      const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g2.addColorStop(0, rgba(col, pal.cloudAlpha));
      g2.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
  if (pal.lightning) {
    // A faint flash behind the clouds, high up.
    const lx = TW * (0.2 + rng() * 0.6);
    const g3 = ctx.createRadialGradient(lx, HORIZON * 0.3, 0, lx, HORIZON * 0.3, 360);
    g3.addColorStop(0, 'rgba(190,220,255,0.38)');
    g3.addColorStop(1, 'rgba(190,220,255,0)');
    ctx.fillStyle = g3;
    ctx.fillRect(lx - 400, 0, 800, HORIZON);
  }
}

function paintSkyline(ctx, rng, pal) {
  const haze = pal.haze;
  // Three rows of buildings. The far row is pale and hazy, the near row is dark and detailed.
  for (let layer = 0; layer < 3; layer++) {
    const base = hex(pal.building[layer]);
    const fog = [0.5, 0.22, 0][layer];
    let x = rng() * 40;
    while (x < TW) {
      const bw = 46 + rng() * (layer === 0 ? 120 : 100);
      const bh = 70 + rng() * (layer === 0 ? 150 : layer === 1 ? 210 : 270);
      const top = HORIZON + 6 - bh + layer * 10;
      wrapped(x, bw, ox => {
        const g = ctx.createLinearGradient(0, top, 0, HORIZON + 40);
        g.addColorStop(0, rgba(mix(base, haze, fog * 0.45), 1));
        g.addColorStop(1, rgba(mix(base, haze, fog + 0.18), 1));
        ctx.fillStyle = g;
        ctx.fillRect(ox, top, bw, bh + 40);
        // A lit edge on one side gives the blocks volume.
        ctx.fillStyle = rgba(mix(base, haze, 0.45), 0.35);
        ctx.fillRect(ox, top, 2, bh + 40);
        if (layer > 0) {
          const cols = Math.floor(bw / 12);
          const rows = Math.floor(bh / 15);
          for (let cx = 0; cx < cols; cx++) {
            for (let cy = 0; cy < rows; cy++) {
              if (rng() < pal.windows * (layer === 2 ? 1.6 : 1)) {
                const c = pal.lights[Math.floor(rng() * pal.lights.length)];
                ctx.fillStyle = rgba(c, 0.35 + rng() * 0.55);
                ctx.fillRect(ox + 4 + cx * 12, top + 8 + cy * 15, 6, 8);
              }
            }
          }
        }
        if (layer === 2 && bh > 190 && rng() < 0.5) {
          // Aerial with a blinking red light.
          ctx.fillStyle = 'rgba(8,10,16,1)';
          ctx.fillRect(ox + bw / 2 - 1, top - 34, 2, 34);
          ctx.save();
          ctx.shadowColor = 'rgba(255,40,40,1)';
          ctx.shadowBlur = 14;
          ctx.fillStyle = 'rgba(255,70,60,1)';
          ctx.fillRect(ox + bw / 2 - 2, top - 38, 4, 4);
          ctx.restore();
        }
      });
      x += bw + rng() * 14;
    }
  }
  // Neon signs on the near row.
  for (let i = 0; i < pal.neon; i++) {
    const c = pal.lights[Math.floor(rng() * pal.lights.length)];
    const sx = rng() * TW;
    const sy = HORIZON - 30 - rng() * 150;
    const sw = 26 + rng() * 60;
    const sh = 8 + rng() * 22;
    wrapped(sx, sw, ox => {
      ctx.save();
      ctx.shadowColor = rgba(c, 1);
      ctx.shadowBlur = 26;
      ctx.fillStyle = rgba(c, 0.95);
      ctx.fillRect(ox, sy, sw, sh);
      ctx.restore();
    });
  }
}

function paintRoad(ctx, rng, pal) {
  const g = ctx.createLinearGradient(0, HORIZON, 0, TH);
  g.addColorStop(0, rgba(mix(hex(pal.building[2]), pal.haze, 0.16), 1));
  g.addColorStop(0.18, rgba(hex(pal.building[2]), 1));
  g.addColorStop(1, 'rgb(3,4,8)');
  ctx.fillStyle = g;
  ctx.fillRect(0, HORIZON, TW, TH - HORIZON);
  // Haze over the horizon line.
  const hz = ctx.createLinearGradient(0, HORIZON - 70, 0, HORIZON + 50);
  hz.addColorStop(0, rgba(pal.haze, 0));
  hz.addColorStop(0.55, rgba(pal.haze, 0.3));
  hz.addColorStop(1, rgba(pal.haze, 0));
  ctx.fillStyle = hz;
  ctx.fillRect(0, HORIZON - 70, TW, 120);
  // Wet reflections: long vertical smears under the lights, with a ripple.
  for (let i = 0; i < 90; i++) {
    const c = pal.lights[Math.floor(rng() * pal.lights.length)];
    const x = rng() * TW;
    const w = 5 + rng() * 26;
    const h = (TH - HORIZON) * (0.25 + rng() * 0.7);
    wrapped(x, w, ox => {
      const rg = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + h);
      rg.addColorStop(0, rgba(c, 0.55));
      rg.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = rg;
      ctx.fillRect(ox, HORIZON, w, h);
    });
  }
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = HORIZON + 14; y < TH; y += 9 + rng() * 14) ctx.fillRect(0, y, TW, 1.5);
}

function makeLights(rng, pal, count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push({
      x: rng() * TW,
      y: TH * (0.28 + rng() * 0.52),
      r: 0.4 + rng() * 0.6,
      c: pal.lights[Math.floor(rng() * pal.lights.length)],
      a: 0.35 + rng() * 0.65,
    });
  }
  return list;
}

// Out-of-focus lights with a bright rim, like real bokeh. `scale` is the disc size in pixels for r = 1.
function drawBokeh(ctx, lights, scale, alphaMul) {
  for (const l of lights) {
    const r = l.r * scale;
    wrapped(l.x - r, r * 2, ox => {
      const x = ox + r;
      const g = ctx.createRadialGradient(x, l.y, 0, x, l.y, r);
      g.addColorStop(0, rgba(l.c, l.a * alphaMul * 0.45));
      g.addColorStop(0.75, rgba(l.c, l.a * alphaMul * 0.6));
      g.addColorStop(0.92, rgba(l.c, l.a * alphaMul * 1.0));
      g.addColorStop(1, rgba(l.c, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, l.y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

// Street lamps: a bright head and a wide warm halo.
function drawLamps(ctx, rng, pal, scale) {
  for (let i = 0; i < pal.lamps; i++) {
    const x = rng() * TW;
    const y = HORIZON - 60 - rng() * 110;
    const c = pal.lights[Math.floor(rng() * 2)];
    wrapped(x - 200 * scale, 400 * scale, ox => {
      const cx = ox + 200 * scale;
      const g = ctx.createRadialGradient(cx, y, 0, cx, y, 200 * scale);
      g.addColorStop(0, rgba(c, 0.5));
      g.addColorStop(0.12, rgba(c, 0.22));
      g.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - 200 * scale, y - 200 * scale, 400 * scale, 400 * scale);
    });
  }
}

// Car lights moving along the road: soft horizontal streaks, tail lights red, headlights white.
function drawStreaks(ctx, rng, pal, thick) {
  const n = Math.round(22 * pal.tail);
  for (let i = 0; i < n; i++) {
    const red = rng() < 0.65;
    const c = red ? [255, 55, 45] : [235, 245, 255];
    const x = rng() * TW;
    const len = 120 + rng() * 380;
    const y = HORIZON + 18 + Math.pow(rng(), 1.4) * (TH - HORIZON) * 0.55;
    const t = thick * (0.6 + rng() * 0.8);
    wrapped(x, len, ox => {
      const g = ctx.createLinearGradient(ox, 0, ox + len, 0);
      g.addColorStop(0, rgba(c, 0));
      g.addColorStop(0.7, rgba(c, 0.5));
      g.addColorStop(1, rgba(c, 0.95));
      ctx.save();
      ctx.shadowColor = rgba(c, 1);
      ctx.shadowBlur = 16;
      ctx.fillStyle = g;
      ctx.fillRect(ox, y, len, t);
      ctx.restore();
    });
  }
}

function paintNear(pal, seedBase, scale, thick, blurDiv) {
  const rng = mulberry32(seedBase);
  const c = makeCanvas(TW, TH);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; // opaque black, then light is added: the layer is "additive"
  ctx.fillRect(0, 0, TW, TH);
  ctx.globalCompositeOperation = 'lighter';
  drawLamps(ctx, rng, pal, scale > 20 ? 1.6 : 1);
  drawStreaks(ctx, rng, pal, thick);
  drawBokeh(ctx, makeLights(mulberry32(seedBase + 7), pal, scale > 20 ? 44 : 64), scale, scale > 20 ? 0.62 : 1);
  return blurDiv ? blur(c, blurDiv) : c;
}

const cache = new Map();

export function makeBackdrop(skyIndex) {
  if (cache.has(skyIndex)) return cache.get(skyIndex);
  const pal = PALETTES[skyIndex] || PALETTES[0];
  const seed = 900 + skyIndex * 31;
  const far = makeCanvas(TW, TH);
  {
    const rng = mulberry32(seed);
    const ctx = far.getContext('2d');
    paintSky(ctx, rng, pal);
    paintSkyline(ctx, rng, pal);
    paintRoad(ctx, rng, pal);
  }

  const tex = c => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    return t;
  };

  // The glass sees everything out of focus: far layer blurred, near layer as big creamy discs and fat streaks.
  const out = {
    softFar: tex(blur(far, 11)),
    softNear: tex(paintNear(pal, seed + 100, 56, 22, 5)),
    // The drops focus closer: a lightly blurred far layer and small bright points.
    sharpFar: tex(blur(far, 3)),
    sharpNear: tex(paintNear(pal, seed + 100, 17, 7, 0)),
  };
  cache.set(skyIndex, out);
  return out;
}
