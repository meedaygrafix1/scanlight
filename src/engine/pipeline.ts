import type { Params } from '../state/types';
import { Renderer } from './renderer';
import { buildGlyphAtlas } from './glyphs';
import { diffuse, gridSize, sampleGrid } from './sample';
import type { Source } from './load';

const atlasCache = new Map<string, Promise<{ canvas: HTMLCanvasElement; count: number }>>();
const getAtlas = (charset: string) => {
  let a = atlasCache.get(charset);
  if (!a) { a = buildGlyphAtlas(charset); atlasCache.set(charset, a); }
  return a;
};

/** Renderer + the CPU-side resources (glyph atlas, diffusion data) an effect needs. */
export class Pipeline {
  readonly r: Renderer;
  private src: Source | null = null;
  private glyphKey = '';
  private pendingGlyph = '';
  private dataKey = '';
  onAsyncReady: (() => void) | null = null;
  /** True while a long export owns this pipeline; other users (thumbnails) must wait. */
  busy = false;

  constructor(canvas: HTMLCanvasElement, preserve = false) {
    this.r = new Renderer(canvas, { preserve });
    this.r.onRestore = () => {
      this.glyphKey = '';
      this.pendingGlyph = '';
      this.dataKey = '';
      if (this.src) this.r.setSource(this.src.canvas, this.src.width, this.src.height);
      this.onAsyncReady?.();
    };
  }

  get source() { return this.src; }

  setSource(s: Source) {
    this.src = s;
    this.r.setSource(s.canvas, s.width, s.height);
    this.dataKey = '';
  }

  /** Prepares synchronously where possible. Returns false while a glyph atlas is still loading. */
  prepare(p: Params, w: number, h: number): boolean {
    let ready = true;
    if (p.effect === 'ascii' && p.charset !== this.glyphKey) {
      ready = false;
      if (this.pendingGlyph !== p.charset) {
        const cs = p.charset;
        this.pendingGlyph = cs;
        getAtlas(cs).then((a) => {
          if (this.pendingGlyph !== cs) return;
          this.r.setGlyphs(a.canvas, a.count);
          this.glyphKey = cs;
          this.pendingGlyph = '';
          this.onAsyncReady?.();
        });
      }
    }
    if (p.effect === 'diffusion' && this.src) {
      const g = gridSize(p, w, h);
      const key = [g.cols, g.rows, p.levels, p.brightness, p.contrast, p.gamma, p.blackPoint, p.invert].join('|');
      if (key !== this.dataKey) {
        const grid = sampleGrid(this.src.canvas, g.cols, g.rows, g.rowsExact);
        this.r.setData(diffuse(grid, p), g.cols, g.rows);
        this.dataKey = key;
      }
    }
    return ready;
  }

  async ready(p: Params, w: number, h: number) {
    if (p.effect === 'ascii' && p.charset !== this.glyphKey) {
      const a = await getAtlas(p.charset);
      this.r.setGlyphs(a.canvas, a.count);
      this.glyphKey = p.charset;
      this.pendingGlyph = '';
    }
    this.prepare(p, w, h);
  }

  render(p: Params, phase: number, w: number, h: number) {
    this.r.render(p, phase, w, h);
  }
}

/** Phones get a smaller live preview; exports still render at full size. */
export const PREVIEW_MAX = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 1024 : 1600;
export function previewSize(s: { width: number; height: number }) {
  const k = Math.min(1, PREVIEW_MAX / Math.max(s.width, s.height));
  return { w: Math.round(s.width * k), h: Math.round(s.height * k) };
}
