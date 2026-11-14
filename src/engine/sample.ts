import type { Params } from '../state/types';

/** Mirror of the GLSL adjust() so CPU paths (diffusion, SVG) match the preview. */
export function adjust(l: number, p: Params): number {
  l = (l - 0.5) * p.contrast + 0.5 + p.brightness;
  l = Math.min(1, Math.max(0, l));
  l = Math.pow(l, p.gamma);
  if (p.invert) l = 1 - l;
  return Math.min(1, Math.max(0, (l - p.blackPoint) / Math.max(1 - p.blackPoint, 1e-3)));
}

export interface Grid {
  cols: number;
  rows: number;
  /** Raw rgb (0..1) per cell, row 0 = top. */
  rgb: Float32Array;
}

/** Average the source into a cols x rows grid using the browser's high-quality downscaler. */
export function sampleGrid(src: HTMLCanvasElement, cols: number, rows: number, rowsExact = rows): Grid {
  const c = document.createElement('canvas');
  c.width = cols;
  c.height = rows;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // GL rows are bottom-aligned, so a partial row sits at the top
  ctx.drawImage(src, 0, rows - rowsExact, cols, rowsExact);
  const d = ctx.getImageData(0, 0, cols, rows).data;
  const rgb = new Float32Array(cols * rows * 3);
  for (let i = 0; i < cols * rows; i++) {
    rgb[i * 3] = d[i * 4] / 255;
    rgb[i * 3 + 1] = d[i * 4 + 1] / 255;
    rgb[i * 3 + 2] = d[i * 4 + 2] / 255;
  }
  return { cols, rows, rgb };
}

export const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Floyd–Steinberg error diffusion. Returns bytes with row 0 = bottom (GL order). */
export function diffuse(grid: Grid, p: Params): Uint8Array {
  const { cols, rows, rgb } = grid;
  const L = Math.max(1, p.levels - 1);
  const buf = new Float32Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) buf[i] = adjust(luma(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]), p);
  const out = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    // Serpentine scan avoids directional worm artifacts
    const ltr = y % 2 === 0;
    for (let k = 0; k < cols; k++) {
      const x = ltr ? k : cols - 1 - k;
      const i = y * cols + x;
      const old = buf[i];
      const q = Math.min(1, Math.max(0, Math.round(old * L) / L));
      const err = old - q;
      const dx = ltr ? 1 : -1;
      if (x + dx >= 0 && x + dx < cols) buf[i + dx] += (err * 7) / 16;
      if (y + 1 < rows) {
        if (x - dx >= 0 && x - dx < cols) buf[i + cols - dx] += (err * 3) / 16;
        buf[i + cols] += (err * 5) / 16;
        if (x + dx >= 0 && x + dx < cols) buf[i + cols + dx] += (err * 1) / 16;
      }
      out[(rows - 1 - y) * cols + x] = Math.round(q * 255);
    }
  }
  return out;
}

export function gridSize(p: Params, w: number, h: number) {
  const cols = Math.max(1, Math.round(p.columns));
  const cell = w / cols;
  return { cols, rows: Math.max(1, Math.ceil(h / cell - 1e-6)), rowsExact: h / cell, cell };
}
