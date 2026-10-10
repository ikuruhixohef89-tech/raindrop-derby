// GLSL for the glass, the drops and the marker ring. World units: x right, y up, glass plane at z = 0, viewer at +z.

const COMMON = /* glsl */ `
uniform vec2 uSize;
uniform float uScroll;
uniform vec2 uPar;
uniform sampler2D uSoftFar;
uniform sampler2D uSoftNear;
uniform sampler2D uSharpFar;
uniform sampler2D uSharpNear;
// Two layers of the street: the far one (sky, skyline, road) drifts slowly, the near one (lights, streaks) flies past.
vec2 bgUVk(vec2 xy, float k) {
  return vec2(xy.x / uSize.x * 0.62 + uScroll * k - uPar.x * 0.014 * k, xy.y / uSize.y * 0.9 + 0.5 - uPar.y * 0.014 * k);
}
vec3 backSoft(vec2 xy) {
  return texture2D(uSoftFar, bgUVk(xy, 0.35)).rgb + texture2D(uSoftNear, bgUVk(xy, 1.0)).rgb;
}
vec3 backSharp(vec2 xy) {
  return texture2D(uSharpFar, bgUVk(xy, 0.35)).rgb + texture2D(uSharpNear, bgUVk(xy, 1.0)).rgb;
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vvnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

export const GLASS_VERT = /* glsl */ `
varying vec2 vXY;
void main() {
  vXY = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const GLASS_FRAG = /* glsl */ `
precision highp float;
${COMMON}
uniform sampler2D uWet;
uniform sampler2D uGrime;
uniform sampler2D uWax;
uniform float uTime;
uniform float uFlash;
uniform float uSplashFront;
uniform float uSplashOn;
uniform float uWarn;
uniform float uRain;
varying vec2 vXY;

// Tiny static droplets: one jittered circle per grid cell.
vec3 tiny(vec2 xy, float cell, float seed, float density, float maxR, out float mask) {
  vec2 g = xy / cell;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float present = step(1.0 - density, hash12(id + seed));
  vec2 c = (hash22(id * 1.7 + seed + 4.0) - 0.5) * 0.28;
  float rad = mix(0.1, maxR, hash12(id * 2.3 + seed * 3.1));
  vec2 p = f - c;
  float d = length(p);
  mask = present * smoothstep(rad, rad * 0.72, d);
  return vec3(p / rad, rad * cell);
}

// A tiny droplet seen as a lens: an upside-down bright picture, a light rim and a glint.
vec3 tinyShade(vec2 xy, vec3 t) {
  vec2 n = t.xy;
  float len = length(n);
  vec3 c = backSharp(xy - n * t.z * 2.6) * 1.7 + vec3(0.05, 0.06, 0.09);
  float edge = smoothstep(0.5, 1.0, len);
  vec3 N = normalize(vec3(n, sqrt(max(0.0, 1.0 - min(1.0, len * len)))));
  c = mix(c, c * 0.55 + vec3(0.1, 0.13, 0.18), edge * 0.65);
  c += pow(max(dot(N, normalize(vec3(-0.45, 0.65, 0.62))), 0.0), 18.0) * 0.8;
  c += pow(max(dot(N, normalize(vec3(0.5, -0.55, 0.6))), 0.0), 10.0) * 0.18;
  return c;
}

void main() {
  vec2 xy = vXY;
  vec2 uvSim = vec2(xy.x / uSize.x + 0.5, 0.5 - xy.y / uSize.y);

  vec3 col = backSoft(xy);

  // Grime: milky, speckled haze that also hides the view.
  float grime = texture2D(uGrime, uvSim).r;
  float lum = dot(col, vec3(0.3, 0.55, 0.15));
  float speck = vvnoise(xy * 7.0) * 0.6 + vvnoise(xy * 19.0) * 0.4;
  float haze = grime * (0.45 + 0.7 * speck);
  col = mix(col, vec3(0.3, 0.33, 0.37) * (0.4 + lum * 0.8), clamp(haze, 0.0, 1.0) * 0.6);
  col *= 1.0 - grime * 0.1;

  // Wet trails: clear streaks that show a sharper picture, with bright edges.
  float e = 1.0 / 256.0;
  // Five soft taps: the trail grid is coarse, this hides the stair steps.
  float wet = (texture2D(uWet, uvSim).r * 2.0 + texture2D(uWet, uvSim + vec2(e, 0.0) * 0.8).r + texture2D(uWet, uvSim - vec2(e, 0.0) * 0.8).r
             + texture2D(uWet, uvSim + vec2(0.0, e * 2.0) * 0.8).r + texture2D(uWet, uvSim - vec2(0.0, e * 2.0) * 0.8).r) / 6.0;
  wet = clamp(wet * 1.25, 0.0, 1.0);
  float wx = texture2D(uWet, uvSim + vec2(e, 0.0) * 1.6).r - texture2D(uWet, uvSim - vec2(e, 0.0) * 1.6).r;
  float wy = texture2D(uWet, uvSim + vec2(0.0, e * 2.0) * 1.6).r - texture2D(uWet, uvSim - vec2(0.0, e * 2.0) * 1.6).r;
  vec3 sharpCol = backSharp(xy + vec2(wx, wy) * 0.35);
  col = mix(col, sharpCol * 1.05, wet * 0.3);
  col += vec3(0.55, 0.68, 0.9) * length(vec2(wx, wy)) * 0.22 * (0.6 + uFlash);

  // Wax lanes: glossy, teal-tinted strips where drops fly.
  float wax = texture2D(uWax, uvSim).r;
  vec3 waxView = backSharp(xy);
  col = mix(col, waxView * 0.95, wax * 0.3);
  col += vec3(0.04, 0.3, 0.36) * wax * (0.45 + 0.35 * sin(xy.y * 2.6 - uTime * 2.2 + xy.x * 0.7));
  col += vec3(0.5, 0.9, 1.0) * smoothstep(0.35, 0.5, wax) * (1.0 - smoothstep(0.5, 0.65, wax)) * 0.25;

  // Fine mist: two layers of tiny droplets.
  float m1;
  vec3 t1 = tiny(xy, 0.2, 1.0, 0.42 * uRain, 0.3, m1);
  if (m1 > 0.01) {
    col = mix(col, tinyShade(xy, t1), m1 * 0.9);
  }
  float m2;
  vec3 t2 = tiny(xy + 3.7, 0.46, 7.0, 0.3 * uRain, 0.27, m2);
  if (m2 > 0.01) {
    col = mix(col, tinyShade(xy, t2), m2 * 0.92);
  }

  // Truck splash: a sheet of water racing from the front (left) to the rear (right).
  if (uSplashOn > 0.5) {
    float d = (uSplashFront - xy.x) / 1.5;
    float sheet = smoothstep(0.0, 0.07, d) * (1.0 - smoothstep(0.55, 1.15, d));
    float streak = hash12(vec2(floor(xy.y * 22.0), floor(uTime * 20.0)));
    vec3 water = vec3(0.62, 0.74, 0.86) * (0.5 + 0.35 * streak) + sharpCol * 0.25;
    col = mix(col, water, sheet * 0.88);
    col += vec3(0.8, 0.9, 1.0) * smoothstep(0.0, 0.06, d) * (1.0 - smoothstep(0.06, 0.2, d)) * 0.6;
  }
  // Headlight glare from the front, while a truck is coming.
  float glare = exp(-pow((xy.x + uSize.x * 0.5 + 0.6) / 2.4, 2.0)) * uWarn;
  col += vec3(1.0, 0.93, 0.78) * glare * (0.55 + 0.25 * sin(uTime * 22.0));

  col *= 1.0 + uFlash * 0.25;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export const DROP_VERT = /* glsl */ `
attribute vec4 aDrop;
attribute vec4 aTint;
varying vec3 vWorld;
varying vec3 vN;
varying vec4 vTint;
varying vec3 vC;
void main() {
  float st = aDrop.w;
  float r = aDrop.z;
  vec3 p = position;
  float zc = max(p.z, 0.0);
  vec3 local = vec3(p.x * r * (1.0 - 0.26 * st), p.y * r * (1.0 + st), zc * r * 0.58);
  vec3 world = vec3(aDrop.xy, 0.003) + local;
  vWorld = world;
  vC = vec3(aDrop.xy, r);
  vN = normalize(vec3(p.x, p.y / (1.0 + st), p.z > 0.0 ? p.z / 0.58 : 0.0));
  vTint = aTint;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const DROP_FRAG = /* glsl */ `
precision highp float;
${COMMON}
uniform float uFlash;
varying vec3 vWorld;
varying vec3 vN;
varying vec4 vTint;
varying vec3 vC;
void main() {
  vec3 N = normalize(vN);
  float nz = N.z;
  vec3 V = normalize(cameraPosition - vWorld);
  vec2 rel = (vWorld.xy - vC.xy) / vC.z;
  // A drop is a lens: it shows a wide, upside-down picture of the street.
  vec2 off = -(rel * (0.55 + 0.45 * dot(rel, rel))) * vC.z * 3.3 + N.xy * vC.z * 0.9;
  vec3 col = backSharp(vC.xy + off);
  col = col * 1.3 + vec3(0.03, 0.04, 0.06);
  vec3 tint = vTint.rgb;
  vec3 L1 = normalize(vec3(-0.45, 0.65, 0.62));
  float spec = pow(max(dot(N, normalize(L1 + V)), 0.0), 70.0) * 1.5;
  vec3 L2 = normalize(vec3(0.6, -0.5, 0.55));
  float spec2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 40.0) * 0.4;
  float fres = pow(1.0 - clamp(nz, 0.0, 1.0), 2.4);
  float caustic = pow(clamp(dot(N.xy, normalize(vec2(0.5, -0.6))) * 0.5 + 0.5, 0.0, 1.0), 3.0)
                * smoothstep(0.35, 0.9, length(N.xy)) * 0.5;
  col = mix(col, col * vec3(0.22, 0.28, 0.36), fres * 0.7);
  col += tint * (0.06 + fres * 0.6);
  col += caustic * (vec3(0.8, 0.9, 1.0) * 0.55 + tint * 0.45);
  col += spec + spec2;
  col *= 1.0 + uFlash * 0.3;
  if (vTint.a > 1.5) col += vec3(1.0, 0.78, 0.3) * 0.1;
  float alpha = smoothstep(0.0, 0.22, nz) * (vTint.a < 0.5 ? 0.9 : 0.98);
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;

// Full-screen streaks flowing down the screen: the faster you go, the more of them.
export const SPEED_VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const SPEED_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uIntensity;
uniform float uAspect;
uniform vec3 uTint;
varying vec2 vP;
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
void main() {
  float lanes = 52.0;
  float u = vP.x * 0.5 + 0.5;
  float lane = floor(u * lanes);
  float h = hash11(lane * 1.7 + 3.0);
  float x = fract(u * lanes);
  float line = 1.0 - smoothstep(0.05, 0.16, abs(x - 0.5));
  float y = vP.y * 0.5 + 0.5 + uTime * (1.4 + h * 2.4);
  float s = fract(y * (0.7 + h * 1.1) + h * 7.0);
  float streak = smoothstep(0.32 + 0.2 * h, 0.0, s) * smoothstep(0.0, 0.015, s);
  float on = step(1.0 - uIntensity * 0.85, h);
  float edge = smoothstep(0.3, 1.15, length(vec2(vP.x * 0.9, vP.y * 0.8)));
  float a = line * streak * on * edge * uIntensity * 1.15;
  gl_FragColor = vec4(uTint, a);
}
`;

export const PART_VERT = /* glsl */ `
attribute float aSize;
attribute float aLife;
attribute vec3 aColor;
uniform float uScale;
varying float vLife;
varying vec3 vColor;
void main() {
  vLife = aLife;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z) * (0.4 + 0.6 * aLife);
  gl_Position = projectionMatrix * mv;
}
`;

export const PART_FRAG = /* glsl */ `
precision highp float;
varying float vLife;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.15, d) * clamp(vLife * 1.4, 0.0, 1.0);
  gl_FragColor = vec4(vColor, a);
}
`;

export const RING_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const RING_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uTime;
uniform float uCling;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float pulse = 0.5 + 0.5 * sin(uTime * 4.0);
  float ringR = 0.82 - 0.04 * pulse;
  float ring = smoothstep(0.07, 0.0, abs(d - ringR));
  float glow = smoothstep(1.0, 0.55, d) * 0.12;
  float a = (ring * (0.55 + 0.35 * pulse + uCling * 0.4) + glow) * uAlpha;
  gl_FragColor = vec4(uColor * (1.0 + uCling * 0.6), a);
  #include <colorspace_fragment>
}
`;
