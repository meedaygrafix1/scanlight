/* Renders the Open Graph image (public/og.png, 1200 × 630).
   One idea: the wordmark is the before/after. "SCAN" is the flat source,
   "LIGHT" is the same pixels through the real engine.
   Open /demo/og.html while `npm run dev` is running, then screenshot at 1200 × 630
   (or right-click the canvas and save it). */
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { Pipeline } from '../src/engine/pipeline';
import { PRESETS, presetParams } from '../src/state/presets';
import type { Params } from '../src/state/types';

const W = 1200, H = 630;
const SANS = '"Geist Variable", system-ui, sans-serif';
const MONO = '"Geist Mono Variable", ui-monospace, monospace';
const ACCENT = '#ff4d2e';
const WORD_Y = 296;
const WORD_SIZE = 184;
const WORD_SPACING = -1;

type Ctx = CanvasRenderingContext2D;
const spacing = (c: Ctx, px: number) => { try { (c as unknown as { letterSpacing: string }).letterSpacing = `${px}px`; } catch { /* noop */ } };

function wordmark(c: Ctx, color: string) {
  c.fillStyle = color;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.font = `900 ${WORD_SIZE}px ${SANS}`;
  spacing(c, WORD_SPACING);
  const total = c.measureText('SCANLIGHT').width - WORD_SPACING;
  const x0 = Math.round((W - total) / 2);
  c.fillText('SCANLIGHT', x0, WORD_Y);
  // The seam sits in the gap between N and L
  const split = Math.round(x0 + c.measureText('SCAN').width - WORD_SPACING / 2);
  spacing(c, 0);
  return split;
}

function label(c: Ctx, text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left', size = 15) {
  c.font = `500 ${size}px ${MONO}`;
  spacing(c, 1.6);
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  c.fillStyle = color;
  // letterSpacing trails the last glyph; pull right-aligned text back onto the margin
  c.fillText(text, align === 'right' ? x + 1.6 : x, y);
  spacing(c, 0);
}

function mark(c: Ctx, x: number, y: number, s: number) {
  // Same 3 × 3 dot mark as favicon.svg
  const k = s / 32;
  const dots: [number, number, string, number][] = [
    [10, 10, ACCENT, 1], [16, 10, ACCENT, 1], [22, 10, ACCENT, 0.4],
    [10, 16, ACCENT, 1], [16, 16, '#fff', 1], [22, 16, ACCENT, 1],
    [10, 22, ACCENT, 0.4], [16, 22, ACCENT, 1], [22, 22, ACCENT, 1],
  ];
  for (const [dx, dy, fill, a] of dots) {
    c.globalAlpha = a;
    c.fillStyle = fill;
    c.beginPath(); c.arc(x + dx * k, y + dy * k, 2.5 * k, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
}

async function main() {
  await Promise.all([
    document.fonts.load(`900 ${WORD_SIZE}px ${SANS}`, 'SCANLIGHT'),
    document.fonts.load(`600 30px ${SANS}`, 'Dither Studio'),
    document.fonts.load(`500 15px ${MONO}`, 'SOURCE'),
  ]);

  // Source: the wordmark, white on black — what a user would upload
  const src = document.createElement('canvas');
  src.width = W; src.height = H;
  const sc = src.getContext('2d')!;
  sc.fillStyle = '#000';
  sc.fillRect(0, 0, W, H);
  const split = wordmark(sc, '#e4e4e4');

  // Render: the same source through the Red Signal preset
  const p: Params = {
    ...presetParams(PRESETS.find((x) => x.id === 'red-signal')!),
    columns: 132, anim: 'none', vignette: 0.6, noise: 0.06,
  };
  const pl = new Pipeline(document.createElement('canvas'), true);
  pl.setSource({ canvas: src, width: W, height: H, name: 'og', url: '' });
  await pl.ready(p, W, H);
  pl.render(p, 0, W, H);

  const c = (document.getElementById('og') as HTMLCanvasElement).getContext('2d')!;
  c.drawImage(pl.r.canvas, 0, 0, W, H);

  // Left of the seam: the untouched source
  c.save();
  c.beginPath(); c.rect(0, 0, split, H); c.clip();
  c.fillStyle = '#0b0b0c';
  c.fillRect(0, 0, W, H);
  wordmark(c, '#ececef');
  c.restore();

  // The seam — the scan line itself
  c.fillStyle = '#fff';
  c.fillRect(split - 1, 0, 2, H);

  // Labels either side of the seam
  label(c, 'SOURCE', split - 18, 62, '#82828c', 'right');
  label(c, 'RED SIGNAL', split + 18, 62, '#ffb4a6');

  // Footer: brand left, what it does right
  const fy = H - 56;
  mark(c, 46, fy - 30, 44);
  c.font = `600 30px ${SANS}`;
  spacing(c, -0.6);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#ececef';
  c.fillText('Dither Studio', 98, fy + 2);
  spacing(c, 0);
  label(c, 'IMAGE IN. DITHER, LED, ASCII, CRT OUT.', W - 56, fy, '#ffd9d2', 'right', 17);

  document.title = 'og-ready';
}

main();
