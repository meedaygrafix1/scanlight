/* Figma Community listing art for the plugin.
   /demo/figma-assets.html?asset=cover  → 1920 × 1080 cover
   /demo/figma-assets.html?asset=icon   → 128 × 128 icon (&size=512 for a larger master)

   One idea, same family as og.ts: a layer selected on the Figma canvas, and the scan line
   crossing it. Left of the line is the layer as drawn; right of it is the real engine output. */
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { Pipeline } from '../src/engine/pipeline';
import { PRESETS, presetParams } from '../src/state/presets';
import { sampleCanvas } from '../src/ui/samples';
import type { Params } from '../src/state/types';

const SANS = '"Geist Variable", system-ui, sans-serif';
const MONO = '"Geist Mono Variable", ui-monospace, monospace';
const ACCENT = '#ff4d2e';
const BG = '#0b0b0c';
const TEXT = '#ececef';
const TEXT3 = '#82828c';

type Ctx = CanvasRenderingContext2D;
const spacing = (c: Ctx, px: number) => { try { (c as unknown as { letterSpacing: string }).letterSpacing = `${px}px`; } catch { /* noop */ } };

function mono(c: Ctx, text: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = 'left') {
  c.font = `500 ${size}px ${MONO}`;
  const track = size * 0.1;
  spacing(c, track);
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  c.fillStyle = color;
  c.fillText(text, align === 'right' ? x + track : x, y);
  spacing(c, 0);
}

/** The 3 × 3 dot mark from favicon.svg, drawn into a box of size s. */
function mark(c: Ctx, x: number, y: number, s: number, glow = 0) {
  const k = s / 32;
  const dots: [number, number, string, number][] = [
    [10, 10, ACCENT, 1], [16, 10, ACCENT, 1], [22, 10, ACCENT, 0.4],
    [10, 16, ACCENT, 1], [16, 16, '#fff', 1], [22, 16, ACCENT, 1],
    [10, 22, ACCENT, 0.4], [16, 22, ACCENT, 1], [22, 22, ACCENT, 1],
  ];
  for (const [dx, dy, fill, a] of dots) {
    c.save();
    c.globalAlpha = a;
    c.fillStyle = fill;
    if (glow && a === 1) { c.shadowColor = fill === '#fff' ? 'rgba(255,255,255,0.7)' : 'rgba(255,77,46,0.75)'; c.shadowBlur = glow; }
    c.beginPath(); c.arc(x + dx * k, y + dy * k, 2.5 * k, 0, Math.PI * 2); c.fill();
    c.restore();
  }
}

function dotGrid(c: Ctx, w: number, h: number, step: number, color: string) {
  c.fillStyle = color;
  for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) c.fillRect(Math.round(x), Math.round(y), 2, 2);
}

function icon(c: Ctx, s: number) {
  c.fillStyle = BG;
  c.fillRect(0, 0, s, s);
  // The mark fills the tile: dots on a 3 × 3 grid, lit like LEDs
  const box = s * 1.42;
  mark(c, (s - box) / 2, (s - box) / 2, box, s * 0.09);
}

async function cover(c: Ctx, W: number, H: number) {
  c.fillStyle = BG;
  c.fillRect(0, 0, W, H);
  dotGrid(c, W, H, 32, '#1d1d21');

  // The layer
  const L = { x: 136, y: 196, w: 1000, h: 750 };
  const src = sampleCanvas('orb', L.w, L.h);
  const p: Params = {
    ...presetParams(PRESETS.find((x) => x.id === 'red-signal')!),
    columns: 84, anim: 'none', vignette: 0.35, noise: 0.05, glow: 1.1,
  };
  const pl = new Pipeline(document.createElement('canvas'), true);
  pl.setSource({ canvas: src, width: L.w, height: L.h, name: 'orb', url: '' });
  await pl.ready(p, L.w, L.h);
  pl.render(p, 0, L.w, L.h);
  c.drawImage(pl.r.canvas, L.x, L.y);

  // Left of the seam: the layer as drawn
  const seam = L.x + Math.round(L.w * 0.4);
  c.save();
  c.beginPath(); c.rect(L.x, L.y, seam - L.x, L.h); c.clip();
  c.drawImage(src, L.x, L.y);
  c.restore();

  // The scan line runs past the layer, like a beam crossing the canvas
  const beam = c.createLinearGradient(0, L.y - 120, 0, L.y + L.h + 120);
  beam.addColorStop(0, 'rgba(255,255,255,0)');
  beam.addColorStop(0.12, 'rgba(255,255,255,1)');
  beam.addColorStop(0.88, 'rgba(255,255,255,1)');
  beam.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = beam;
  c.fillRect(seam - 1, L.y - 120, 2, L.h + 240);

  mono(c, 'SOURCE', seam - 20, L.y + 44, '#9a9aa3', 20, 'right');
  mono(c, 'RED SIGNAL', seam + 20, L.y + 44, '#ffb4a6', 20);

  // Selection: outline, handles, name tag above, size pill below
  c.strokeStyle = ACCENT;
  c.lineWidth = 2;
  c.strokeRect(L.x - 1, L.y - 1, L.w + 2, L.h + 2);
  for (const [hx, hy] of [[L.x, L.y], [L.x + L.w, L.y], [L.x, L.y + L.h], [L.x + L.w, L.y + L.h]]) {
    c.fillStyle = '#fff';
    c.fillRect(hx - 7, hy - 7, 14, 14);
    c.strokeRect(hx - 7, hy - 7, 14, 14);
  }
  c.font = `550 22px ${SANS}`;
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = ACCENT;
  c.fillText('Orb', L.x, L.y - 18);
  const dims = '1000 × 750';
  c.font = `500 18px ${MONO}`;
  const dw = c.measureText(dims).width + 20;
  const px = L.x + L.w / 2 - dw / 2, py = L.y + L.h + 18;
  c.fillStyle = ACCENT;
  c.beginPath(); c.roundRect(px, py, dw, 32, 4); c.fill();
  c.fillStyle = '#fff';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(dims, L.x + L.w / 2, py + 17);

  // Right column: name, one line of what it does, the effect index
  const R = 1240;
  mark(c, R - 6, 186, 76, 10);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = TEXT;
  c.font = `650 84px ${SANS}`;
  spacing(c, -2.5);
  c.fillText('Scanlight', R, 356);
  spacing(c, 0);
  mono(c, 'FOR FIGMA', R + 4, 404, ACCENT, 22);

  c.fillStyle = '#b4b4bc';
  c.font = `450 32px ${SANS}`;
  spacing(c, -0.4);
  c.fillText('Select a layer. Get it back as', R, 506);
  c.fillText('dots, dither, type or a CRT glow.', R, 550);
  spacing(c, 0);

  const effects = ['LED MATRIX', 'HALFTONE', 'ORDERED', 'DIFFUSION', 'ASCII', 'CRT'];
  const row = 47;
  const top = L.y + L.h - 13 - (effects.length - 1) * row; // last rule sits on the layer's bottom edge
  c.fillStyle = '#26262b';
  c.fillRect(R, top - 34, 560, 1);
  effects.forEach((e, i) => {
    const y = top + i * row;
    const on = i === 0;
    mono(c, String(i + 1).padStart(2, '0'), R, y, on ? ACCENT : '#55555e', 20);
    mono(c, e, R + 64, y, on ? TEXT : TEXT3, 20);
    if (on) { c.fillStyle = ACCENT; c.beginPath(); c.arc(R + 552, y - 7, 6, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#26262b';
    c.fillRect(R, y + 13, 560, 1);
  });
}

async function main() {
  const q = new URLSearchParams(location.search);
  const asset = q.get('asset') ?? 'cover';
  await Promise.all([
    document.fonts.load(`650 84px ${SANS}`, 'Scanlight'),
    document.fonts.load(`450 32px ${SANS}`, 'Select'),
    document.fonts.load(`500 20px ${MONO}`, 'SOURCE'),
  ]);
  const canvas = document.getElementById('out') as HTMLCanvasElement;
  const c = canvas.getContext('2d')!;
  if (asset === 'icon') {
    const s = Number(q.get('size') ?? 128);
    canvas.width = canvas.height = s;
    icon(c, s);
  } else {
    canvas.width = 1920; canvas.height = 1080;
    await cover(c, 1920, 1080);
  }
  document.title = 'ready';
}

main();
