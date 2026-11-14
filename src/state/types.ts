export type EffectId = 'led' | 'halftone' | 'bayer' | 'diffusion' | 'ascii' | 'crt';
export type Shape = 'circle' | 'square' | 'diamond';
export type AnimId = 'none' | 'flicker' | 'scan' | 'pulse' | 'wave' | 'rain' | 'glitch';
export type ColorMode = 'palette' | 'source';
export type GlyphMode = 'luma' | 'random';

export interface Params {
  effect: EffectId;
  /** Grid density: number of columns across the image. Resolution-independent. */
  columns: number;
  /** Dot / mark size, 0..1 of cell. */
  dot: number;
  shape: Shape;
  angle: number;
  gap: number;
  levels: number;
  matrix: 2 | 4 | 8;
  charset: string;
  glyphMode: GlyphMode;

  brightness: number;
  contrast: number;
  gamma: number;
  blackPoint: number;
  invert: boolean;

  colorMode: ColorMode;
  bg: string;
  mid: string;
  high: string;
  ambient: number;

  glow: number;
  glowRadius: number;
  scanlines: number;
  noise: number;
  vignette: number;
  aberration: number;
  curvature: number;

  anim: AnimId;
  cycles: number;
  loopSeconds: number;
  intensity: number;
}

export interface Preset {
  id: string;
  name: string;
  group: string;
  params: Partial<Params>;
}
