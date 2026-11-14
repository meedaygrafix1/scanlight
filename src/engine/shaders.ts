export const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const COMMON = /* glsl */ `
#define TAU 6.28318530718
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

export const EFFECT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uSrc;
uniform sampler2D uGlyphs;
uniform sampler2D uData;
uniform vec2 uRes;
uniform vec2 uSrcRes;
uniform int uEffect;
uniform float uCols;
uniform float uDot;
uniform int uShape;
uniform float uAngle;
uniform float uGap;
uniform float uLevels;
uniform int uMatrix;
uniform float uGlyphCount;
uniform int uGlyphRandom;

uniform float uBright, uContrast, uGamma, uBlack, uInvert;
uniform vec3 uBg, uMid, uHigh;
uniform int uColorMode;
uniform float uAmbient;

uniform int uAnim;
uniform float uPhase, uCycles, uIntensity;

${COMMON}

vec3 srcAt(vec2 uv, float cellPx) {
  float lod = log2(max(cellPx * uSrcRes.x / uRes.x, 1.0));
  return textureLod(uSrc, uv, lod).rgb;
}

float adjust(float l) {
  l = (l - 0.5) * uContrast + 0.5 + uBright;
  l = clamp(l, 0.0, 1.0);
  l = pow(l, uGamma);
  l = mix(l, 1.0 - l, uInvert);
  return clamp((l - uBlack) / max(1.0 - uBlack, 1e-3), 0.0, 1.0);
}

vec3 ramp(float l) {
  vec3 c = mix(uBg, uMid, smoothstep(0.0, 0.55, l));
  return mix(c, uHigh, smoothstep(0.5, 1.0, l));
}

vec3 colorFor(float l, vec3 src) {
  if (uColorMode == 1) {
    vec3 tinted = clamp(src * (l / max(luma(src), 0.02)), 0.0, 1.0);
    return mix(uBg, tinted, smoothstep(0.0, 0.12, l));
  }
  return ramp(l);
}

float shapeDist(vec2 p) {
  if (uShape == 1) return max(abs(p.x), abs(p.y));
  if (uShape == 2) return (abs(p.x) + abs(p.y)) * 0.7071;
  return length(p);
}

float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

// Animation: modulates luminance and mark size per cell. All functions of uPhase
// (0..1 over the loop) with integer cycles, so exported loops are seamless.
float gSize = 1.0;
float animate(float l, vec2 cell, vec2 grid, vec2 cuv) {
  gSize = 1.0;
  if (uAnim == 0) return l;
  float ph = uPhase * uCycles;
  float y = 1.0 - cuv.y; // 0 at top
  if (uAnim == 1) { // flicker
    float st = floor(ph * 18.0);
    float f = hash(cell + st * 1.618);
    float g = 0.5 + 0.5 * cos(TAU * ph * 3.0);
    return l * (1.0 - uIntensity * (0.85 * smoothstep(0.72, 1.0, f) + 0.12 * g));
  }
  if (uAnim == 2) { // scan
    float pos = fract(ph);
    float d = y - pos;
    d = d - floor(d + 0.5);
    float band = exp(-d * d * 260.0);
    float trail = d < 0.0 ? exp(d * 9.0) * 0.35 : 0.0;
    gSize = 1.0 + band * uIntensity * 0.35;
    return clamp(l * (1.0 - uIntensity * 0.35) + (band + trail) * uIntensity * (0.25 + 0.9 * l), 0.0, 1.0);
  }
  if (uAnim == 3) { // pulse
    float p = 0.5 + 0.5 * cos(TAU * ph);
    gSize = 1.0 - uIntensity * 0.35 * p;
    return l * (1.0 - uIntensity * 0.45 * p);
  }
  if (uAnim == 4) { // wave
    vec2 c = (cuv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float s = 0.5 + 0.5 * sin(TAU * (length(c) * 2.5 - ph));
    gSize = mix(1.0, 0.35 + 0.9 * s, uIntensity);
    return l * mix(1.0, 0.55 + 0.6 * s, uIntensity);
  }
  if (uAnim == 5) { // rain
    float col = cell.x;
    float spd = 1.0 + floor(hash(vec2(col, 3.1)) * 2.0);
    float head = fract(ph * spd + hash(vec2(col, 7.7)));
    float tr = fract(head - y);
    float r = pow(1.0 - tr, 5.0);
    float headGlow = exp(-tr * 60.0);
    return clamp(l * mix(1.0, 0.12 + 1.3 * r, uIntensity) + headGlow * uIntensity * 0.6 * step(0.04, l + 0.3), 0.0, 1.0);
  }
  return l; // glitch handled in composite
}

float aaMask(float d, float r, float cs) {
  float aa = 1.0 / max(cs, 1.0);
  return 1.0 - smoothstep(r - aa, r + aa, d);
}

void main() {
  vec2 px = vUv * uRes;
  float cs = uRes.x / uCols;
  vec3 col;

  if (uEffect == 0) { // LED
    vec2 g = px / cs;
    vec2 cell = floor(g);
    vec2 lp = fract(g) - 0.5;
    vec2 cuv = (cell + 0.5) * cs / uRes;
    vec3 s = srcAt(cuv, cs);
    float l = animate(adjust(luma(s)), cell, uRes / cs, cuv);
    float r = 0.5 * uDot * gSize;
    float d = shapeDist(lp);
    float m = aaMask(d, r, cs);
    vec3 lit = colorFor(l, s) * (1.0 + 0.25 * (1.0 - clamp(d / max(r, 1e-3), 0.0, 1.0)));
    vec3 off = mix(uBg, uMid, uAmbient * 0.35);
    vec3 dotC = mix(off, lit, smoothstep(0.015, 0.12, l));
    col = mix(uBg, dotC, m);
  }
  else if (uEffect == 1) { // Halftone
    float a = radians(uAngle);
    mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
    vec2 rp = R * (px - uRes * 0.5);
    vec2 cell = floor(rp / cs);
    vec2 lp = fract(rp / cs) - 0.5;
    vec2 cpx = transpose(R) * ((cell + 0.5) * cs) + uRes * 0.5;
    vec2 cuv = cpx / uRes;
    vec3 s = srcAt(clamp(cuv, 0.0, 1.0), cs);
    float l = animate(adjust(luma(s)), cell, uRes / cs, cuv);
    float r = 0.5 * sqrt(l) * uDot * 1.42 * gSize;
    float m = aaMask(shapeDist(lp), r, cs) * step(0.002, l);
    vec3 ink = uColorMode == 1 ? colorFor(max(l, 0.6), s) : mix(uMid, uHigh, smoothstep(0.2, 0.9, l));
    col = mix(uBg, ink, m);
  }
  else if (uEffect == 2 || uEffect == 3) { // Ordered / Diffusion
    vec2 g = px / cs;
    vec2 cell = floor(g);
    vec2 lp = fract(g) - 0.5;
    vec2 cuv = (cell + 0.5) * cs / uRes;
    vec3 s = srcAt(cuv, cs);
    float q;
    float L = max(uLevels - 1.0, 1.0);
    if (uEffect == 2) {
      float l = animate(adjust(luma(s)), cell, uRes / cs, cuv);
      float t = uMatrix == 2 ? bayer2(cell) : uMatrix == 4 ? bayer4(cell) : bayer8(cell);
      q = clamp(floor(l * L + t) / L, 0.0, 1.0);
    } else {
      q = texelFetch(uData, ivec2(cell), 0).r;
      q = animate(q, cell, uRes / cs, cuv);
      q = floor(q * L + 0.5) / L;
    }
    float m = aaMask(max(abs(lp.x), abs(lp.y)), 0.5 - uGap * 0.5, cs);
    if (uGap <= 0.001) m = 1.0;
    col = mix(uBg, colorFor(q, s), m);
  }
  else if (uEffect == 4) { // ASCII
    vec2 csz = vec2(cs, cs * 1.45);
    vec2 g = px / csz;
    vec2 cell = floor(g);
    vec2 lp = fract(g);
    vec2 cuv = (cell + 0.5) * csz / uRes;
    vec3 s = srcAt(cuv, cs);
    float l = animate(adjust(luma(s)), cell, uRes / csz, cuv);
    float idx;
    if (uGlyphRandom == 1) {
      float st = (uAnim == 5 || uAnim == 1) ? floor(uPhase * uCycles * 10.0 * (0.5 + hash(cell + 9.0))) : 0.0;
      idx = floor(hash(cell + st * 3.17) * uGlyphCount);
    } else {
      idx = floor(l * (uGlyphCount - 1.0) + 0.5);
    }
    vec2 guv = vec2((idx + lp.x) / uGlyphCount, lp.y);
    float a = texture(uGlyphs, guv).r;
    float vis = uGlyphRandom == 1 ? smoothstep(0.02, 0.15, l) : 1.0;
    vec3 off = mix(uBg, uMid, uAmbient * 0.25);
    // Glyph coverage already carries the tone, so keep the ink itself bright
    float ink = l > 0.0 ? 0.38 + 0.62 * l : 0.0;
    col = mix(uBg, mix(off, colorFor(ink, s), vis), a * max(vis, uAmbient * 0.5));
  }
  else { // CRT beam lines
    float rows = uCols;
    float rh = uRes.y / rows;
    float gy = px.y / rh;
    float row = floor(gy);
    float ly = fract(gy) - 0.5;
    vec2 cuv = vec2(vUv.x, (row + 0.5) * rh / uRes.y);
    vec3 s = srcAt(cuv, rh * 0.5);
    float l = animate(adjust(luma(s)), vec2(floor(px.x / rh), row), uRes / rh, cuv);
    float w = (0.12 + 0.38 * l) * uDot * gSize;
    float beam = exp(-(ly * ly) / max(w * w, 1e-4));
    col = mix(uBg, colorFor(l, s) * 1.35, beam * smoothstep(0.0, 0.08, l + 0.02));
  }

  outColor = vec4(col, 1.0);
}`;

export const BRIGHT_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec3 uBg;
${COMMON}
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  float k = smoothstep(0.04, 0.5, luma(max(c - uBg, 0.0)));
  outColor = vec4(c * k, 1.0);
}`;

export const BLUR_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uDir; // texel step * radius
void main() {
  float w[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec3 c = texture(uTex, vUv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    c += texture(uTex, vUv + uDir * float(i)).rgb * w[i];
    c += texture(uTex, vUv - uDir * float(i)).rgb * w[i];
  }
  outColor = vec4(c, 1.0);
}`;

export const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uImg;
uniform sampler2D uGlow;
uniform sampler2D uGlow2;
uniform vec2 uRes;
uniform vec3 uBg;
uniform float uGlowAmt, uScan, uNoise, uVig, uAberr, uCurve;
uniform int uAnim;
uniform float uPhase, uCycles, uIntensity;
${COMMON}
void main() {
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float aspect = uRes.x / uRes.y;
  // Barrel curvature
  if (uCurve > 0.001) {
    // Normalised so the edge midpoints stay put and only the corners pull in
    float kc = uCurve * 0.5;
    cc *= (1.0 + kc * dot(cc, cc)) / (1.0 + kc * 0.25);
    uv = cc + 0.5;
  }
  float ab = uAberr * 0.004;
  float flick = 1.0;
  if (uAnim == 6) { // glitch
    float st = floor(uPhase * uCycles * 14.0);
    float on = step(0.5, hash(vec2(st, 1.3)));
    float bands = mix(5.0, 28.0, hash(vec2(st, 2.1)));
    float band = floor(uv.y * bands);
    float shift = (hash(vec2(band, st)) - 0.5) * 0.09 * uIntensity;
    uv.x += shift * on * step(0.55, hash(vec2(band, st + 4.0)));
    ab += on * uIntensity * 0.006;
    flick = 1.0 - on * uIntensity * 0.12 * hash(vec2(st, 9.0));
  }
  vec3 c;
  c.r = texture(uImg, uv + vec2(ab, 0.0)).r;
  c.g = texture(uImg, uv).g;
  c.b = texture(uImg, uv - vec2(ab, 0.0)).b;
  vec3 gl = texture(uGlow, uv).rgb * 0.65 + texture(uGlow2, uv).rgb * 0.75;
  c += gl * uGlowAmt;

  float px = uRes.y / 900.0;
  float lines = uRes.y / max(3.0 * px, 1.0);
  float sl = 0.5 + 0.5 * cos(uv.y * lines * TAU);
  c *= 1.0 - uScan * 0.55 * (1.0 - sl);

  float nst = floor(uPhase * max(uCycles, 1.0) * 24.0);
  float n = hash(floor(vUv * uRes / max(px * 1.5, 1.0)) + nst * 0.731);
  c += (n - 0.5) * uNoise * 0.22;

  vec2 vk = (vUv - 0.5) * vec2(1.0, 1.0);
  float v = smoothstep(0.85, 0.2, length(vk) * 1.1);
  c *= mix(1.0, v, uVig);
  c *= flick;

  if (uCurve > 0.001) {
    vec2 e = smoothstep(vec2(0.0), vec2(0.004), uv) * smoothstep(vec2(0.0), vec2(0.004), 1.0 - uv);
    c = mix(uBg * 0.25, c, e.x * e.y);
  }
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
