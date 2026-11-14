import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { Params } from '../state/types';
import type { Renderer } from './renderer';
import { hexToRgb } from './color';
import { adjust, diffuse, gridSize, luma, sampleGrid } from './sample';

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** On phones the share sheet is how a file reaches Photos or Files. Needs a fresh tap. */
export async function saveToDevice(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  download(blob, filename);
}

export function canvasBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Export failed'))), type, quality));
}

/* ---------------- SVG ---------------- */

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const toHex = (c: number[]) =>
  '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');

function rampFn(p: Params) {
  const bg = hexToRgb(p.bg), mid = hexToRgb(p.mid), high = hexToRgb(p.high);
  return (l: number, src?: number[]) => {
    if (p.colorMode === 'source' && src) {
      const k = l / Math.max(luma(src[0], src[1], src[2]), 0.02);
      return mix3(bg, src.map((v) => Math.min(1, v * k)), smooth(0, 0.12, l));
    }
    return mix3(mix3(bg, mid, smooth(0, 0.55, l)), high, smooth(0.5, 1, l));
  };
}

export const SVG_EFFECTS = ['led', 'halftone', 'bayer', 'diffusion', 'ascii'] as const;

export function buildSvg(p: Params, src: HTMLCanvasElement, w: number, h: number): string {
  const ramp = rampFn(p);
  const { cols, rows, rowsExact, cell } = gridSize(p, w, h);
  const f = (n: number) => +n.toFixed(2);
  const parts: string[] = [];
  const glow = p.glow > 0.01 && p.effect !== 'bayer' && p.effect !== 'diffusion';
  const yTop = (r: number) => h - (rows - r) * cell; // bottom-aligned rows, matching the preview

  if (p.effect === 'led' || p.effect === 'bayer') {
    const g = sampleGrid(src, cols, rows, rowsExact);
    const L = Math.max(1, p.levels - 1);
    const bay = (x: number, y: number) => {
      const b2 = (a: number, c: number) => ((Math.floor(a) / 2 + Math.floor(c) * Math.floor(c) * 0.75) % 1 + 1) % 1;
      const b4 = (a: number, c: number) => b2(a * 0.5, c * 0.5) * 0.25 + b2(a, c);
      const b8 = (a: number, c: number) => b4(a * 0.5, c * 0.5) * 0.25 + b2(a, c);
      return p.matrix === 2 ? b2(x, y) : p.matrix === 4 ? b4(x, y) : b8(x, y);
    };
    const off = toHex(mix3(hexToRgb(p.bg), hexToRgb(p.mid), p.ambient * 0.35));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 3;
        const s = [g.rgb[i], g.rgb[i + 1], g.rgb[i + 2]];
        const l = adjust(luma(s[0], s[1], s[2]), p);
        const x = c * cell, y = yTop(r);
        if (p.effect === 'led') {
          const lit = smooth(0.015, 0.12, l);
          const fill = lit < 0.5 ? (p.ambient > 0.01 ? off : null) : toHex(ramp(l, s));
          if (!fill) continue;
          const rad = 0.5 * p.dot * cell;
          parts.push(shapeEl(p.shape, x + cell / 2, y + cell / 2, rad, fill, f));
        } else {
          const glRow = rows - 1 - r;
          const q = Math.min(1, Math.max(0, Math.floor(l * L + bay(c, glRow)) / L));
          if (q <= 0) continue;
          const inset = (p.gap * cell) / 2;
          parts.push(`<rect x="${f(x + inset)}" y="${f(y + inset)}" width="${f(cell - inset * 2)}" height="${f(cell - inset * 2)}" fill="${toHex(ramp(q, s))}"/>`);
        }
      }
    }
  } else if (p.effect === 'diffusion') {
    const g = sampleGrid(src, cols, rows, rowsExact);
    const data = diffuse(g, p);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const q = data[(rows - 1 - r) * cols + c] / 255;
        if (q <= 0) continue;
        const i = (r * cols + c) * 3;
        const inset = (p.gap * cell) / 2;
        parts.push(`<rect x="${f(c * cell + inset)}" y="${f(yTop(r) + inset)}" width="${f(cell - inset * 2)}" height="${f(cell - inset * 2)}" fill="${toHex(ramp(q, [g.rgb[i], g.rgb[i + 1], g.rgb[i + 2]]))}"/>`);
      }
    }
  } else if (p.effect === 'halftone') {
    // Sample a fine grid and look up rotated cell centres in it
    const fine = 4;
    const fw = Math.max(1, cols * fine), fh = Math.max(1, Math.round((h / w) * cols * fine));
    const g = sampleGrid(src, fw, fh);
    const a = (p.angle * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    const diag = Math.hypot(w, h) / cell / 2 + 2;
    for (let j = -Math.ceil(diag); j <= diag; j++) {
      for (let i = -Math.ceil(diag); i <= diag; i++) {
        const lx = (i + 0.5) * cell, ly = (j + 0.5) * cell;
        // Same rotation as the shader (GL y-up), converted to SVG y-down
        const gx = ca * lx - sa * ly + w / 2;
        const gyUp = sa * lx + ca * ly + h / 2;
        if (gx < -cell || gx > w + cell || gyUp < -cell || gyUp > h + cell) continue;
        const sx = Math.min(fw - 1, Math.max(0, Math.floor((gx / w) * fw)));
        const sy = Math.min(fh - 1, Math.max(0, Math.floor(((h - gyUp) / h) * fh)));
        const k = (sy * fw + sx) * 3;
        const s = [g.rgb[k], g.rgb[k + 1], g.rgb[k + 2]];
        const l = adjust(luma(s[0], s[1], s[2]), p);
        if (l < 0.002) continue;
        const rad = 0.5 * Math.sqrt(l) * p.dot * 1.42 * cell;
        const ink = p.colorMode === 'source'
          ? ramp(Math.max(l, 0.6), s)
          : mix3(hexToRgb(p.mid), hexToRgb(p.high), smooth(0.2, 0.9, l));
        parts.push(shapeEl(p.shape, gx, h - gyUp, rad, toHex(ink), f, -p.angle));
      }
    }
  } else if (p.effect === 'ascii') {
    const ch = cell * 1.45;
    const arows = Math.ceil(h / ch - 1e-6);
    const g = sampleGrid(src, cols, arows, h / ch);
    const chars = Array.from(p.charset.length ? p.charset : ' ');
    const esc = (c: string) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const yT = (r: number) => h - (arows - r) * ch;
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let r = 0; r < arows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 3;
        const s = [g.rgb[i], g.rgb[i + 1], g.rgb[i + 2]];
        const l = adjust(luma(s[0], s[1], s[2]), p);
        const random = p.glyphMode === 'random';
        if (random && l < 0.08) continue;
        const idx = random ? Math.floor(rnd() * chars.length) : Math.round(l * (chars.length - 1));
        const glyph = chars[idx];
        if (!glyph || glyph === ' ') continue;
        parts.push(`<text x="${f(c * cell + cell / 2)}" y="${f(yT(r) + ch / 2)}" fill="${toHex(ramp(l, s))}">${esc(glyph)}</text>`);
      }
    }
    parts.unshift(`<g font-family="Geist Mono, ui-monospace, monospace" font-weight="600" font-size="${f(cell * 1.05)}" text-anchor="middle" dominant-baseline="central">`);
    parts.push('</g>');
  }

  const filter = glow
    ? `<defs><filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${f(cell * (0.4 + p.glowRadius * 1.6))}" result="b"/><feComponentTransfer in="b" result="bb"><feFuncA type="linear" slope="${f(Math.min(2, p.glow))}"/></feComponentTransfer><feMerge><feMergeNode in="bb"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${filter}<rect width="100%" height="100%" fill="${p.bg}"/><g${glow ? ' filter="url(#glow)"' : ''}>${parts.join('')}</g></svg>`;
}

function shapeEl(shape: Params['shape'], cx: number, cy: number, r: number, fill: string, f: (n: number) => number, rot = 0) {
  if (shape === 'circle') return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"/>`;
  if (shape === 'square') {
    const t = rot ? ` transform="rotate(${f(rot)} ${f(cx)} ${f(cy)})"` : '';
    return `<rect x="${f(cx - r)}" y="${f(cy - r)}" width="${f(r * 2)}" height="${f(r * 2)}" fill="${fill}"${t}/>`;
  }
  const d = r * 1.4142;
  const t = rot ? ` transform="rotate(${f(rot)} ${f(cx)} ${f(cy)})"` : '';
  return `<path d="M${f(cx)} ${f(cy - d)}L${f(cx + d)} ${f(cy)}L${f(cx)} ${f(cy + d)}L${f(cx - d)} ${f(cy)}Z" fill="${fill}"${t}/>`;
}

/* ---------------- Video ---------------- */

export interface VideoOpts {
  width: number;
  height: number;
  fps: number;
  loops: number;
  format: 'mp4' | 'webm';
  onProgress: (t: number) => void;
  signal: AbortSignal;
}

export const canEncodeMp4 = () => typeof window !== 'undefined' && 'VideoEncoder' in window;

export async function renderVideo(r: Renderer, p: Params, o: VideoOpts): Promise<Blob> {
  const w = o.width - (o.width % 2), h = o.height - (o.height % 2);
  const frames = Math.round(p.loopSeconds * o.fps * o.loops);
  if (o.format === 'mp4' && canEncodeMp4()) return renderMp4(r, p, { ...o, width: w, height: h }, frames);
  return renderWebm(r, p, { ...o, width: w, height: h }, frames);
}

async function pickAvc(w: number, h: number, fps: number, bitrate: number) {
  for (const codec of ['avc1.640028', 'avc1.640033', 'avc1.64003E', 'avc1.4D0033', 'avc1.42003E']) {
    const config: VideoEncoderConfig = { codec, width: w, height: h, bitrate, framerate: fps };
    try {
      const s = await VideoEncoder.isConfigSupported(config);
      if (s.supported) return config;
    } catch { /* try next */ }
  }
  return null;
}

async function renderMp4(r: Renderer, p: Params, o: VideoOpts, frames: number): Promise<Blob> {
  const bitrate = Math.min(40e6, Math.round(o.width * o.height * o.fps * 0.25));
  const config = await pickAvc(o.width, o.height, o.fps, bitrate);
  if (!config) return renderWebm(r, p, o, frames);
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: 'avc', width: o.width, height: o.height, frameRate: o.fps }, fastStart: 'in-memory' });
  let failure: unknown = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failure = e; },
  });
  enc.configure(config);
  const perLoop = Math.round(p.loopSeconds * o.fps);
  for (let i = 0; i < frames; i++) {
    if (o.signal.aborted) { enc.close(); throw new DOMException('Cancelled', 'AbortError'); }
    if (failure) throw failure;
    r.render(p, (i % perLoop) / perLoop, o.width, o.height);
    const frame = new VideoFrame(r.canvas, { timestamp: Math.round((i * 1e6) / o.fps), duration: Math.round(1e6 / o.fps) });
    enc.encode(frame, { keyFrame: i % (o.fps * 2) === 0 });
    frame.close();
    while (enc.encodeQueueSize > 6) await new Promise((res) => setTimeout(res, 1));
    if (i % 4 === 0) { o.onProgress(i / frames); await new Promise((res) => setTimeout(res, 0)); }
  }
  await enc.flush();
  enc.close();
  muxer.finalize();
  o.onProgress(1);
  return new Blob([target.buffer], { type: 'video/mp4' });
}

/** Fallback: real-time capture with MediaRecorder. */
async function renderWebm(r: Renderer, p: Params, o: VideoOpts, frames: number): Promise<Blob> {
  const stream = r.canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.min(40e6, o.width * o.height * o.fps * 0.2) });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((res) => (rec.onstop = () => res()));
  rec.start();
  const perLoop = Math.round(p.loopSeconds * o.fps);
  const start = performance.now();
  for (let i = 0; i < frames; i++) {
    if (o.signal.aborted) { rec.stop(); throw new DOMException('Cancelled', 'AbortError'); }
    r.render(p, (i % perLoop) / perLoop, o.width, o.height);
    track.requestFrame();
    o.onProgress(i / frames);
    const wait = start + ((i + 1) * 1000) / o.fps - performance.now();
    await new Promise((res) => setTimeout(res, Math.max(0, wait)));
  }
  rec.stop();
  await done;
  o.onProgress(1);
  return new Blob(chunks, { type: 'video/webm' });
}
