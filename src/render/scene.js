// Three.js side: the windshield, the car around it, every drop as one instanced mesh, wipers, bugs, particles, speed lines and the camera.
// Reads the simulation, never changes it.
import * as THREE from '../../vendor/three.min.js';
import { W, H, GRID_W, GRID_H } from '../config.js';
import { radiusOf } from '../sim/physics.js';
import { makeBackdrop } from './backdrop.js';
import {
  GLASS_VERT, GLASS_FRAG, DROP_VERT, DROP_FRAG, RING_VERT, RING_FRAG, SPEED_VERT, SPEED_FRAG, PART_VERT, PART_FRAG,
} from './shaders.js';

const FOV = 36;
const MAX_DROPS = 128;
const MAX_PARTS = 160;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const toWorldX = x => x - W / 2;
const toWorldY = y => H / 2 - y;

function roundedHole(path, hw, hh, rTL, rTR, rBR, rBL) {
  path.moveTo(-hw + rBL, -hh);
  path.lineTo(hw - rBR, -hh);
  path.quadraticCurveTo(hw, -hh, hw, -hh + rBR);
  path.lineTo(hw, hh - rTR);
  path.quadraticCurveTo(hw, hh, hw - rTR, hh);
  path.lineTo(-hw + rTL, hh);
  path.quadraticCurveTo(-hw, hh, -hw, hh - rTL);
  path.lineTo(-hw, -hh + rBL);
  path.quadraticCurveTo(-hw, -hh, -hw + rBL, -hh);
}

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const g = c.getContext('2d');
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 32; x++) {
      g.fillStyle = (x + y) % 2 ? '#f4f4f0' : '#15171c';
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function leatherTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1d24';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 20 + Math.random() * 18;
    g.fillStyle = `rgba(${v},${v + 2},${v + 8},0.5)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 6);
  return t;
}

const PART_KINDS = {
  gulp: { color: [0.55, 0.9, 1.0], n: 7, speed: 0.9, size: 0.1, life: 0.55 },
  chain: { color: [1.0, 0.85, 0.35], n: 10, speed: 1.2, size: 0.12, life: 0.6 },
  bite: { color: [1.0, 0.45, 0.4], n: 12, speed: 1.5, size: 0.12, life: 0.6 },
  wiper: { color: [0.85, 0.93, 1.0], n: 26, speed: 2.8, size: 0.16, life: 0.8 },
  bug: { color: [0.75, 0.92, 0.3], n: 12, speed: 1.4, size: 0.12, life: 0.6 },
  splash: { color: [0.8, 0.9, 1.0], n: 30, speed: 3.0, size: 0.14, life: 0.8 },
  finish: { color: [1.0, 0.82, 0.35], n: 46, speed: 3.2, size: 0.16, life: 1.1 },
};

export function createView(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x05070c, 1);
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 80);

  const uniforms = {
    uSize: { value: new THREE.Vector2(W, H) },
    uScroll: { value: 0 },
    uPar: { value: new THREE.Vector2(0, 0) },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uSoftFar: { value: null },
    uSoftNear: { value: null },
    uSharpFar: { value: null },
    uSharpNear: { value: null },
    uWet: { value: null },
    uGrime: { value: null },
    uWax: { value: null },
    uSplashFront: { value: -99 },
    uSplashOn: { value: 0 },
    uWarn: { value: 0 },
    uRain: { value: 1 },
  };

  // Wet-trail, grime and wax maps (one texel per sim grid cell).
  const wetData = new Uint8Array(GRID_W * GRID_H * 4);
  const grimeData = new Uint8Array(GRID_W * GRID_H * 4);
  const waxData = new Uint8Array(GRID_W * GRID_H * 4);
  const mkData = data => {
    const t = new THREE.DataTexture(data, GRID_W, GRID_H, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };
  uniforms.uWet.value = mkData(wetData);
  uniforms.uGrime.value = mkData(grimeData);
  uniforms.uWax.value = mkData(waxData);

  // ---- glass ----
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 2, H + 2),
    new THREE.ShaderMaterial({ uniforms, vertexShader: GLASS_VERT, fragmentShader: GLASS_FRAG }),
  );
  scene.add(glass);

  // ---- the car around the glass: one extruded slab with a rounded opening (roof, pillars, cowl) ----
  const outer = new THREE.Shape();
  const ow = W / 2 + 12;
  const oh = H / 2 + 8;
  outer.moveTo(-ow, -oh);
  outer.lineTo(ow, -oh);
  outer.lineTo(ow, oh);
  outer.lineTo(-ow, oh);
  outer.lineTo(-ow, -oh);
  const hole = new THREE.Path();
  roundedHole(hole, W / 2, H / 2, 2.0, 2.0, 0.5, 0.5);
  outer.holes.push(hole);
  const slabGeo = new THREE.ExtrudeGeometry(outer, {
    depth: 0.5, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.16, bevelSegments: 3, curveSegments: 10,
  });
  const slab = new THREE.Mesh(
    slabGeo,
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: leatherTexture(), roughness: 0.62, metalness: 0.08 }),
  );
  slab.position.z = 0.02;
  scene.add(slab);

  // Dashboard under the glass, with a glowing edge and vent slats.
  const dash = new THREE.Mesh(
    new THREE.BoxGeometry(W + 10, 1.6, 3.0),
    new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: 0.5, metalness: 0.08 }),
  );
  dash.position.set(0, -H / 2 - 1.2, 1.5);
  scene.add(dash);
  const dashGlow = new THREE.Mesh(
    new THREE.BoxGeometry(W + 10, 0.07, 0.07),
    new THREE.MeshBasicMaterial({ color: 0xff9a4a }),
  );
  dashGlow.position.set(0, -H / 2 - 0.38, 3.02);
  scene.add(dashGlow);
  for (let i = 0; i < 6; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x2a2f3a }));
    slat.position.set(4.0, -H / 2 - 0.55 - i * 0.12, 3.03);
    scene.add(slat);
  }

  // Rear-view mirror hanging at the top.
  const mirror = new THREE.Group();
  const mBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.55, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x0f1116, roughness: 0.35, metalness: 0.3 }),
  );
  const mFace = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.4), new THREE.MeshBasicMaterial({ color: 0x1a2b44 }));
  mFace.position.z = 0.12;
  const mStalk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.7, 8),
    new THREE.MeshStandardMaterial({ color: 0x0c0d11, roughness: 0.5 }),
  );
  mStalk.position.set(0, 0.55, -0.05);
  mirror.add(mBody, mFace, mStalk);
  mirror.position.set(1.4, H / 2 - 0.15, 1.25);
  scene.add(mirror);

  // Finish line: a checkered strip on the cowl, at the bottom of the glass.
  const finish = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 1.3, 0.2),
    new THREE.MeshBasicMaterial({ map: checkerTexture(), transparent: true, opacity: 0.9 }),
  );
  finish.position.set(0, -H / 2 + 0.2, 0.012);
  scene.add(finish);

  // ---- wipers ----
  const wiperMat = new THREE.MeshStandardMaterial({
    color: 0x3a3f4a, roughness: 0.35, metalness: 0.7, emissive: 0xff2a1a, emissiveIntensity: 0,
  });
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0x14151a, roughness: 0.5, metalness: 0.1, emissive: 0xff2a1a, emissiveIntensity: 0,
  });
  const wiperArms = [];
  const wiperGroup = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.17, 0.12), wiperMat);
    arm.position.set(3.05, 0, 0.1);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.3, 0.1), bladeMat);
    blade.position.set(3.55, 0, 0.05);
    g.add(arm, blade);
    wiperGroup.add(g);
    wiperArms.push(g);
  }
  wiperGroup.visible = false;
  scene.add(wiperGroup);

  // ---- bugs ----
  const bugGroup = new THREE.Group();
  scene.add(bugGroup);
  const bugMats = [0x4b5a22, 0x3a2a1a, 0x5a2a1c].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 }));
  const splatMat = new THREE.MeshBasicMaterial({ color: 0x6f8a2c, transparent: true, opacity: 0.3 });

  function buildBugs(bugs) {
    while (bugGroup.children.length) {
      const c = bugGroup.children.pop();
      c.traverse(o => o.geometry && o.geometry.dispose());
    }
    for (const b of bugs) {
      const g = new THREE.Group();
      const splat = new THREE.Mesh(new THREE.CircleGeometry(b.r * 2.1, 14), splatMat);
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), bugMats[b.kind % 3]);
      body.scale.set(b.r, b.r * 1.35, b.r * 0.55);
      body.position.z = b.r * 0.3;
      const head = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), bugMats[b.kind % 3]);
      head.scale.set(b.r * 0.55, b.r * 0.5, b.r * 0.4);
      head.position.set(0, b.r * 1.35, b.r * 0.25);
      g.add(splat, body, head);
      // Legs and feelers, so it reads as a bug and not a bean.
      const legMat = bugMats[(b.kind + 1) % 3];
      for (let s = -1; s <= 1; s += 2) {
        for (let k = 0; k < 3; k++) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(b.r * 1.5, b.r * 0.1, b.r * 0.08), legMat);
          leg.position.set(s * b.r * 1.0, (k - 1) * b.r * 0.7, b.r * 0.12);
          leg.rotation.z = s * (0.35 + k * 0.28) * (k === 0 ? -1 : 1) + (s > 0 ? 0 : Math.PI);
          g.add(leg);
        }
        const feeler = new THREE.Mesh(new THREE.BoxGeometry(b.r * 0.08, b.r * 0.9, b.r * 0.06), legMat);
        feeler.position.set(s * b.r * 0.35, b.r * 2.0, b.r * 0.2);
        feeler.rotation.z = -s * 0.5;
        g.add(feeler);
      }
      const shine = new THREE.Mesh(
        new THREE.SphereGeometry(1, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xcfe8a0, transparent: true, opacity: 0.45 }),
      );
      shine.scale.set(b.r * 0.22, b.r * 0.5, b.r * 0.1);
      shine.position.set(-b.r * 0.3, b.r * 0.2, b.r * 0.62);
      g.add(shine);
      g.position.set(toWorldX(b.x), toWorldY(b.y), 0.02);
      g.rotation.z = b.rot;
      bugGroup.add(g);
    }
  }

  // ---- lights for the interior parts ----
  scene.add(new THREE.AmbientLight(0x6070a0, 0.9));
  const key = new THREE.DirectionalLight(0xa8bcff, 0.8);
  key.position.set(-4, 6, 8);
  scene.add(key);
  const dashLight = new THREE.PointLight(0xff9a50, 14, 16, 1.6);
  dashLight.position.set(1, -H / 2 - 0.2, 3);
  scene.add(dashLight);

  // ---- drops: one InstancedMesh, per-instance data in two vec4 attributes ----
  const dropGeo = new THREE.IcosahedronGeometry(1, 3);
  const aDrop = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DROPS * 4), 4);
  const aTint = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DROPS * 4), 4);
  aDrop.setUsage(THREE.DynamicDrawUsage);
  aTint.setUsage(THREE.DynamicDrawUsage);
  dropGeo.setAttribute('aDrop', aDrop);
  dropGeo.setAttribute('aTint', aTint);
  const drops = new THREE.InstancedMesh(
    dropGeo,
    new THREE.ShaderMaterial({
      uniforms, vertexShader: DROP_VERT, fragmentShader: DROP_FRAG, transparent: true, depthWrite: false,
    }),
    MAX_DROPS,
  );
  drops.frustumCulled = false;
  scene.add(drops);

  // ---- marker ring around the player's drop ----
  const ringUniforms = {
    uColor: { value: new THREE.Color(1, 0.8, 0.34) },
    uTime: { value: 0 },
    uCling: { value: 0 },
    uAlpha: { value: 1 },
  };
  const ring = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      uniforms: ringUniforms, vertexShader: RING_VERT, fragmentShader: RING_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  ring.position.z = 0.02;
  scene.add(ring);

  // ---- particles ----
  const pPos = new Float32Array(MAX_PARTS * 3);
  const pLife = new Float32Array(MAX_PARTS);
  const pSize = new Float32Array(MAX_PARTS);
  const pCol = new Float32Array(MAX_PARTS * 3);
  const pVel = new Float32Array(MAX_PARTS * 2);
  const pDecay = new Float32Array(MAX_PARTS);
  const partGeo = new THREE.BufferGeometry();
  partGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  partGeo.setAttribute('aLife', new THREE.BufferAttribute(pLife, 1));
  partGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
  partGeo.setAttribute('aColor', new THREE.BufferAttribute(pCol, 3));
  const partUniforms = { uScale: { value: 400 } };
  const parts = new THREE.Points(
    partGeo,
    new THREE.ShaderMaterial({
      uniforms: partUniforms, vertexShader: PART_VERT, fragmentShader: PART_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  parts.frustumCulled = false;
  scene.add(parts);
  let partCursor = 0;

  function burst(simX, simY, kind) {
    const k = PART_KINDS[kind];
    if (!k) return;
    for (let i = 0; i < k.n; i++) {
      const j = partCursor;
      partCursor = (partCursor + 1) % MAX_PARTS;
      const a = Math.random() * Math.PI * 2;
      const sp = k.speed * (0.35 + Math.random() * 0.8);
      pPos[j * 3] = toWorldX(simX);
      pPos[j * 3 + 1] = toWorldY(simY);
      pPos[j * 3 + 2] = 0.12;
      pVel[j * 2] = Math.cos(a) * sp;
      pVel[j * 2 + 1] = Math.sin(a) * sp;
      pLife[j] = 1;
      pDecay[j] = 1 / (k.life * (0.6 + Math.random() * 0.7));
      pSize[j] = k.size * (0.6 + Math.random() * 0.8);
      pCol[j * 3] = k.color[0];
      pCol[j * 3 + 1] = k.color[1];
      pCol[j * 3 + 2] = k.color[2];
    }
  }

  // ---- speed lines (a full-screen overlay) ----
  const speedUniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uAspect: { value: 1.78 },
    uTint: { value: new THREE.Color(0.75, 0.88, 1.0) },
  };
  const speed = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: speedUniforms, vertexShader: SPEED_VERT, fragmentShader: SPEED_FRAG,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  speed.frustumCulled = false;
  speed.renderOrder = 999;
  scene.add(speed);

  const cam = { x: 0, y: H / 2 - 1.2, dist: 12, shake: 0, init: false, roll: 0, fov: FOV, intensity: 0 };
  let stageId = '';
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  const maxDpr = dpr;
  let size = { w: 1, h: 1 };

  function setStage(stage) {
    const b = makeBackdrop(stage.sky);
    uniforms.uSoftFar.value = b.softFar;
    uniforms.uSoftNear.value = b.softNear;
    uniforms.uSharpFar.value = b.sharpFar;
    uniforms.uSharpNear.value = b.sharpNear;
    uniforms.uRain.value = 0.7 + stage.rain * 0.4;
    stageId = stage.id;
  }

  // Static things that belong to one world: dirt, wax lanes, bugs, whether wipers exist.
  function loadWorld(world) {
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      grimeData[i * 4] = Math.round(clamp(world.grime[i], 0, 1) * 255);
      grimeData[i * 4 + 3] = 255;
      waxData[i * 4] = Math.round(clamp(world.wax[i], 0, 1) * 255);
      waxData[i * 4 + 3] = 255;
    }
    uniforms.uGrime.value.needsUpdate = true;
    uniforms.uWax.value.needsUpdate = true;
    buildBugs(world.bugs);
    wiperGroup.visible = !!world.wipers;
    partCursor = 0;
    pLife.fill(0);
  }

  function resize(wpx, hpx) {
    size = { w: Math.max(2, wpx), h: Math.max(2, hpx) };
    renderer.setPixelRatio(dpr);
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
    speedUniforms.uAspect.value = camera.aspect;
  }

  function setPixelRatio(v) {
    dpr = clamp(v, 0.6, maxDpr);
    resize(size.w, size.h);
  }

  function frameDistance(spanW, minW) {
    const t = Math.tan((FOV * Math.PI) / 360) * 2 * camera.aspect;
    return clamp(Math.max(minW, spanW) / t, 4.2, 16);
  }

  const tmp = new THREE.Vector3();

  function update(world, dt, time, fx) {
    const stage = world.stage;
    const p = world.drops[0];
    const pv = Math.hypot(p.vx, p.vy);
    const racing = world.phase === 'race';

    // ---- camera: overview on the grid, then a low chase view that looks ahead of the player's drop ----
    let tx;
    let ty;
    let dist;
    if (world.phase === 'grid' && !fx.follow) {
      const [x0, x1] = stage.startSpan;
      tx = toWorldX((x0 + x1) / 2);
      dist = frameDistance(x1 - x0 + 3.2, 7);
      // Put the top of the glass near the top of the frame, so the whole starting line and the road ahead are in view.
      ty = H / 2 + 0.9 - dist * Math.tan((FOV * Math.PI) / 360) + 0.3;
    } else {
      // Keep the nearest rivals in the shot: a race needs company. The player stays the centre of attention.
      let near = 0;
      let sumX = p.x * 2;
      let spanHalf = 2.7;
      for (const d of world.drops) {
        if (d === p || d.finished) continue;
        if (Math.abs(d.y - p.y) < 2.4 && Math.abs(d.x - p.x) < 4.6) {
          near++;
          sumX += d.x;
          spanHalf = Math.max(spanHalf, Math.abs(d.x - p.x) + 1.3);
        }
      }
      tx = toWorldX(sumX / (2 + near)) + p.vx * 0.35;
      ty = toWorldY(p.y) - 0.62 - Math.min(0.6, Math.max(0, p.vy) * 0.28);
      dist = frameDistance(Math.min(10, spanHalf * 2), 4.9);
      if (fx.zoomOut) dist *= 1.35;
    }
    tx = clamp(tx, -W / 2 + 1.5, W / 2 - 1.5);
    if (world.phase !== 'grid' || fx.follow) ty = clamp(ty, -H / 2 + 0.9, H / 2 - 0.6);
    if (!cam.init) {
      cam.x = tx; cam.y = ty; cam.dist = dist; cam.init = true;
    }
    const k = 1 - Math.exp(-dt * (world.phase === 'grid' ? 1.8 : 4.2));
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    cam.dist += (dist - cam.dist) * (1 - Math.exp(-dt * 1.6));
    cam.shake *= Math.exp(-dt * 6);

    // Speed feel: field of view widens, the view rolls into turns, streaks fly past.
    const push = world.push;
    const brake = push ? push.vyMul - 1 : 0;
    const wantFov = FOV + (racing ? clamp(pv * 3.2, 0, 6) + p.chain * 0.55 + brake * 2.5 : 0);
    cam.fov += (wantFov - cam.fov) * (1 - Math.exp(-dt * 5));
    const wantRoll = clamp(-p.vx * 0.045, -0.1, 0.1) + (push ? -push.vx * 0.04 : 0);
    cam.roll += (wantRoll - cam.roll) * (1 - Math.exp(-dt * 4));
    const wantInt = racing && !p.finished ? clamp(pv / 1.7, 0, 1) * 0.8 + p.chain * 0.05 + Math.max(0, brake) * 0.3 : 0;
    cam.intensity += (wantInt - cam.intensity) * (1 - Math.exp(-dt * 3));

    const sx = Math.sin(time * 61) * cam.shake * 0.05;
    const sy = Math.cos(time * 53) * cam.shake * 0.05;
    camera.position.set(cam.x + Math.sin(time * 0.35) * 0.06 + sx, cam.y - 0.75 + Math.cos(time * 0.27) * 0.04 + sy, cam.dist);
    camera.lookAt(cam.x, cam.y + 0.1, 0);
    camera.rotateZ(cam.roll);
    if (Math.abs(camera.fov - cam.fov) > 0.01) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    uniforms.uPar.value.set(camera.position.x, camera.position.y);
    partUniforms.uScale.value = (size.h * dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    speedUniforms.uTime.value = time;
    speedUniforms.uIntensity.value = fx.hideSpeed ? 0 : cam.intensity;

    // ---- uniforms from the world ----
    uniforms.uTime.value = time;
    uniforms.uScroll.value -= (0.004 + stage.carSpeed * 0.1 + (brake > 0 ? brake * 0.05 : 0)) * dt;
    const flashBase = stage.carSpeed > 0 ? Math.max(0, Math.sin(time * 0.37 + 1.2)) ** 14 : 0;
    uniforms.uFlash.value = flashBase * 0.9 + fx.flash;
    const s = world.splash;
    uniforms.uSplashOn.value = s.phase === 'sweep' ? 1 : 0;
    uniforms.uSplashFront.value = s.phase === 'sweep' ? toWorldX(s.front) : -99;
    uniforms.uWarn.value = s.phase === 'warn' ? Math.min(1, s.t / 0.5) : 0;

    // Wet trail texture
    const wet = world.wet;
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      const o = i * 4;
      wetData[o] = Math.round(wet[i] * 255);
      wetData[o + 3] = 255;
    }
    uniforms.uWet.value.needsUpdate = true;

    // ---- wipers ----
    if (world.wipers) {
      const wp = world.wipers;
      // The arms glow red while a sweep is announced, so the danger is hard to miss.
      const glow = wp.phase === 'warn' ? 0.5 + 0.5 * Math.sin(time * 18) : wp.phase === 'idle' ? 0 : 0.25;
      wiperMat.emissiveIntensity = glow * 0.9;
      bladeMat.emissiveIntensity = glow * 1.4;
      for (let i = 0; i < 2; i++) {
        const g = wiperArms[i];
        g.position.set(toWorldX(wp.pivots[i].x), toWorldY(wp.pivots[i].y), 0.16);
        g.rotation.z = wp.angle;
      }
    }

    // ---- drops ----
    let n = 0;
    const d4 = aDrop.array;
    const t4 = aTint.array;
    const put = (x, y, r, stretch, cr, cg, cb, flag) => {
      const o = n * 4;
      d4[o] = toWorldX(x);
      d4[o + 1] = toWorldY(y);
      d4[o + 2] = r;
      d4[o + 3] = stretch;
      t4[o] = cr;
      t4[o + 1] = cg;
      t4[o + 2] = cb;
      t4[o + 3] = flag;
      n++;
    };
    for (const p2 of world.droplets) {
      if (n >= MAX_DROPS - 6) break;
      put(p2.x, p2.y, radiusOf(p2.m), 0.05, 0.5, 0.62, 0.8, 0);
    }
    for (const d of world.drops) {
      if (d.out || d.wiped) continue; // out of the race, or wiped off the glass
      const wob = 1 + 0.1 * d.jiggle * Math.sin(time * 38 + d.id);
      const rr = radiusOf(d.m) * wob;
      put(d.x, d.y, rr, d.stretch + 0.04 * d.jiggle, d.color[0], d.color[1], d.color[2], d.isPlayer ? 2 : 1);
    }
    drops.count = n;
    aDrop.needsUpdate = true;
    aTint.needsUpdate = true;

    // ---- ring ----
    ring.visible = !fx.hideRing && !p.finished && !p.wiped;
    const pr = radiusOf(p.m);
    const rs = pr * 2.9 + 0.12;
    ring.scale.set(rs, rs, 1);
    ring.position.x = toWorldX(p.x);
    ring.position.y = toWorldY(p.y);
    ringUniforms.uTime.value = time;
    ringUniforms.uCling.value = p.clinging ? 1 : 0;
    ringUniforms.uAlpha.value = world.phase === 'grid' ? 0.75 : 1;
    ringUniforms.uColor.value.setRGB(p.color[0], p.color[1], p.color[2]);

    // ---- particles ----
    for (let j = 0; j < MAX_PARTS; j++) {
      if (pLife[j] <= 0) continue;
      pLife[j] -= pDecay[j] * dt;
      if (pLife[j] <= 0) {
        pLife[j] = 0;
        continue;
      }
      pPos[j * 3] += pVel[j * 2] * dt;
      pPos[j * 3 + 1] += pVel[j * 2 + 1] * dt;
      pVel[j * 2] *= 1 - 2.2 * dt;
      pVel[j * 2 + 1] = pVel[j * 2 + 1] * (1 - 2.2 * dt) - 0.7 * dt;
    }
    partGeo.attributes.position.needsUpdate = true;
    partGeo.attributes.aLife.needsUpdate = true;
    partGeo.attributes.aSize.needsUpdate = true;
    partGeo.attributes.aColor.needsUpdate = true;
  }

  return {
    renderer,
    camera,
    setStage,
    loadWorld,
    resize,
    setPixelRatio,
    update,
    burst,
    shake(a) {
      cam.shake = Math.min(1.6, cam.shake + a);
    },
    resetCamera() {
      cam.init = false;
    },
    render() {
      renderer.render(scene, camera);
    },
    get pixelRatio() {
      return dpr;
    },
    get stageId() {
      return stageId;
    },
    info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
    projectToScreen(x, y) {
      tmp.set(toWorldX(x), toWorldY(y), 0.05).project(camera);
      return { x: (tmp.x * 0.5 + 0.5) * size.w, y: (-tmp.y * 0.5 + 0.5) * size.h };
    },
  };
}
