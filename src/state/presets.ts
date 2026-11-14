import type { Params, Preset, EffectId } from './types';

export const DEFAULTS: Params = {
  effect: 'led',
  columns: 90,
  dot: 0.78,
  shape: 'circle',
  angle: 45,
  gap: 0,
  levels: 2,
  matrix: 4,
  charset: ' .:-=+*#%@',
  glyphMode: 'luma',

  brightness: 0,
  contrast: 1.15,
  gamma: 1,
  blackPoint: 0.05,
  invert: false,

  colorMode: 'palette',
  bg: '#1a0204',
  mid: '#e0182d',
  high: '#fff4f2',
  ambient: 0.22,

  glow: 0.9,
  glowRadius: 0.5,
  scanlines: 0.1,
  noise: 0.08,
  vignette: 0.45,
  aberration: 0.1,
  curvature: 0,

  anim: 'none',
  cycles: 1,
  loopSeconds: 4,
  intensity: 0.6,
};

export const CHARSETS: { label: string; value: string }[] = [
  { label: 'Classic', value: ' .:-=+*#%@' },
  { label: 'Binary', value: '01' },
  { label: 'Blocks', value: ' ░▒▓█' },
  { label: 'Dense', value: " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$" },
  { label: 'Hex', value: '0123456789ABCDEF' },
];

export const EFFECTS: { id: EffectId; name: string; hint: string }[] = [
  { id: 'led', name: 'LED Matrix', hint: 'Glowing dot grid' },
  { id: 'halftone', name: 'Halftone', hint: 'Print-style dots' },
  { id: 'bayer', name: 'Ordered', hint: 'Bayer dither' },
  { id: 'diffusion', name: 'Diffusion', hint: 'Floyd–Steinberg' },
  { id: 'ascii', name: 'ASCII', hint: 'Characters & binary' },
  { id: 'crt', name: 'CRT', hint: 'Phosphor scanlines' },
];

export const PALETTES: { name: string; bg: string; mid: string; high: string }[] = [
  { name: 'Signal', bg: '#1a0204', mid: '#e0182d', high: '#fff4f2' },
  { name: 'Phosphor', bg: '#020a05', mid: '#1fb35a', high: '#d9ffe4' },
  { name: 'Amber', bg: '#120a00', mid: '#e09a12', high: '#fff3d1' },
  { name: 'Ice', bg: '#020611', mid: '#2f7bff', high: '#e6f1ff' },
  { name: 'Brass', bg: '#2a2508', mid: '#8a7a1c', high: '#e8dc8a' },
  { name: 'Mono', bg: '#000000', mid: '#7a7a7a', high: '#ffffff' },
  { name: 'Paper', bg: '#f1ece1', mid: '#6b665c', high: '#141414' },
  { name: 'Pocket', bg: '#0f380f', mid: '#4f7f2f', high: '#c4d99a' },
  { name: 'Vapor', bg: '#12021f', mid: '#ff2d9a', high: '#7ff6ff' },
];

export const PRESETS: Preset[] = [
  { id: 'red-signal', name: 'Red Signal', group: 'LED', params: {} },
  {
    id: 'amber-board', name: 'Amber Board', group: 'LED',
    params: { columns: 70, bg: '#120a00', mid: '#e09a12', high: '#fff3d1', shape: 'square', dot: 0.7, glow: 1.1 },
  },
  {
    id: 'ice-wall', name: 'Ice Wall', group: 'LED',
    params: { columns: 120, bg: '#020611', mid: '#2f7bff', high: '#e6f1ff', ambient: 0.3, anim: 'scan', intensity: 0.7 },
  },
  {
    id: 'newsprint', name: 'Newsprint', group: 'Print',
    params: {
      effect: 'halftone', columns: 80, invert: true, bg: '#f1ece1', mid: '#34312b', high: '#141414',
      glow: 0, scanlines: 0, vignette: 0.15, noise: 0.12, aberration: 0, dot: 1, blackPoint: 0,
    },
  },
  {
    id: 'pop-dots', name: 'Pop Dots', group: 'Print',
    params: {
      effect: 'halftone', columns: 60, angle: 15, bg: '#12021f', mid: '#ff2d9a', high: '#7ff6ff',
      glow: 0.6, scanlines: 0, aberration: 0.25, dot: 1, anim: 'wave', intensity: 0.5,
    },
  },
  {
    id: 'one-bit', name: '1-Bit Mac', group: 'Dither',
    params: {
      effect: 'bayer', columns: 220, levels: 2, matrix: 8, bg: '#000000', mid: '#7a7a7a', high: '#ffffff',
      glow: 0, scanlines: 0, noise: 0, vignette: 0, aberration: 0, blackPoint: 0,
    },
  },
  {
    id: 'pocket', name: 'Pocket', group: 'Dither',
    params: {
      effect: 'bayer', columns: 160, levels: 4, matrix: 4, bg: '#0f380f', mid: '#4f7f2f', high: '#c4d99a',
      glow: 0.15, scanlines: 0, noise: 0.03, vignette: 0.2, aberration: 0, blackPoint: 0, gap: 0.08,
    },
  },
  {
    id: 'diffuse-ink', name: 'Ink Diffuse', group: 'Dither',
    params: {
      effect: 'diffusion', columns: 260, levels: 2, bg: '#f1ece1', mid: '#6b665c', high: '#141414', invert: true,
      glow: 0, scanlines: 0, noise: 0.05, vignette: 0.1, aberration: 0, blackPoint: 0,
    },
  },
  {
    id: 'binary-rain', name: 'Binary Rain', group: 'Type',
    params: {
      effect: 'ascii', columns: 70, charset: '01', glyphMode: 'random', bg: '#020a05', mid: '#1fb35a', high: '#d9ffe4',
      anim: 'rain', intensity: 0.8, cycles: 1, glow: 1, scanlines: 0.2, ambient: 0,
    },
  },
  {
    id: 'terminal', name: 'Terminal', group: 'Type',
    params: {
      effect: 'ascii', columns: 110, charset: ' .:-=+*#%@', glyphMode: 'luma', bg: '#120a00', mid: '#e09a12', high: '#fff3d1',
      glow: 0.7, scanlines: 0.3, curvature: 0.35, anim: 'flicker', intensity: 0.35,
    },
  },
  {
    id: 'phosphor', name: 'Phosphor', group: 'Screen',
    params: {
      effect: 'crt', columns: 220, dot: 0.8, bg: '#020a05', mid: '#1fb35a', high: '#e6ffe9', glow: 1.1, glowRadius: 0.7,
      scanlines: 0.25, noise: 0.12, vignette: 0.6, aberration: 0.35, curvature: 0.3, blackPoint: 0.02,
    },
  },
  {
    id: 'brass-tape', name: 'Brass Tape', group: 'Screen',
    params: {
      effect: 'crt', columns: 160, dot: 0.9, bg: '#2a2508', mid: '#8a7a1c', high: '#efe39a', glow: 0.5, glowRadius: 0.4,
      scanlines: 0.15, noise: 0.45, vignette: 0.3, aberration: 0.15, contrast: 1.35, anim: 'glitch', intensity: 0.4,
    },
  },
];

export function presetParams(p: Preset): Params {
  return { ...DEFAULTS, ...p.params };
}

/** Defaults used for double-click-to-reset on sliders. */
export const RESET = DEFAULTS;
