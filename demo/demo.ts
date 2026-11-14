/* Renders the Scanlight demo video. Every dithered frame comes from the real engine;
   this file only composes those renders into mock-ups and encodes them to MP4.
   Open /demo/index.html while `npm run dev` is running. */
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { Pipeline } from '../src/engine/pipeline';
import { PRESETS, presetParams } from '../src/state/presets';
import type { Params } from '../src/state/types';
import type { Source } from '../src/engine/load';
import { sampleCanvas } from '../src/ui/samples';

const W = 1280, H = 720, FPS = 30;
const SANS = '"Geist Variable", system-ui, sans-serif';
const MONO = '"Geist Mono Variable", ui-monospace, monospace';
const ACCENT = '#ff4d2e';

/* ---------------- sources ---------------- */

type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;
const sources = new Map<string, Source>();

function addSource(id: string, w: number, h: number, draw: Draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#000';
  c.fillRect(0, 0, w, h);
  draw(c, w, h);
  sources.set(id, { canvas, width: w, height: h, name: id, url: '' });
}

const stroke = (c: CanvasRenderingContext2D, width: number, color = '#fff') => {
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
};

function buildSources() {
  addSource('title', 1280, 720, (c, w, h) => {
    c.fillStyle = '#dcdcdc';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 196px ${SANS}`;
    try { (c as unknown as { letterSpacing: string }).letterSpacing = '-8px'; } catch { /* noop */ }
    c.fillText('SCANLIGHT', w / 2, h * 0.46);
  });
  for (const id of ['shield', 'print', 'orb']) {
    addSource(id, 800, 600, (c) => c.drawImage(sampleCanvas(id, 800, 600), 0, 0));
    // Portrait versions for phone screens and posters
    addSource(`${id}-tall`, 600, 1200, (c, w, h) => {
      const s = sampleCanvas(id, 800, 600);
      const dw = w * 1.15, dh = dw * 0.75;
      c.drawImage(s, (w - dw) / 2, h * 0.42 - dh / 2, dw, dh);
    });
  }
  addSource('network', 800, 600, (c, w, h) => {
    const box = (x: number, y: number) => { stroke(c, 30); c.strokeRect(x - 62, y - 62, 124, 124); };
    stroke(c, 22, '#7a7a7a');
    c.beginPath();
    c.moveTo(w / 2, 220); c.lineTo(w / 2, 300);
    c.moveTo(250, 380); c.lineTo(250, 300); c.lineTo(550, 300); c.lineTo(550, 380);
    c.stroke();
    box(w / 2, 150); box(250, 450); box(550, 450);
    void h;
  });
  addSource('lock', 800, 600, (c, w) => {
    stroke(c, 38);
    c.beginPath();
    c.arc(w / 2, 230, 92, Math.PI, 0);
    c.lineTo(w / 2 + 92, 290);
    c.moveTo(w / 2 - 92, 230); c.lineTo(w / 2 - 92, 290);
    c.stroke();
    c.beginPath();
    c.roundRect(w / 2 - 150, 290, 300, 210, 26);
    c.stroke();
    stroke(c, 30, '#8a8a8a');
    c.beginPath(); c.moveTo(w / 2, 370); c.lineTo(w / 2, 425); c.stroke();
  });
  addSource('sun', 600, 840, (c, w, h) => {
    const g = c.createLinearGradient(0, 180, 0, 600);
    g.addColorStop(0, '#fff'); g.addColorStop(1, '#555');
    c.fillStyle = g;
    c.beginPath(); c.arc(w / 2, 380, 210, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#000';
    for (let i = 0; i < 7; i++) c.fillRect(0, 400 + i * 30, w, 6 + i * 3);
    stroke(c, 5, '#666');
    for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(w / 2, 640); c.lineTo(-300 + i * 150, h); c.stroke(); }
    for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(0, 660 + i * i * 9); c.lineTo(w, 660 + i * i * 9); c.stroke(); }
  });
  addSource('words', 600, 840, (c, w) => {
    c.fillStyle = '#fff';
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.font = `900 232px ${SANS}`;
    try { (c as unknown as { letterSpacing: string }).letterSpacing = '-10px'; } catch { /* noop */ }
    ['NO', 'SIG', 'NAL'].forEach((t, i) => { c.globalAlpha = 1 - i * 0.25; c.fillText(t, 34, 250 + i * 215); });
    c.globalAlpha = 1;
    void w;
  });
}

/* ---------------- engine layers ---------------- */

const pipelines = new Map<string, Pipeline>();

async function layer(slot: string, source: string, p: Params, phase: number, w: number, h: number) {
  let pl = pipelines.get(slot);
  if (!pl) { pl = new Pipeline(document.createElement('canvas'), true); pipelines.set(slot, pl); }
  const src = sources.get(source)!;
  if (pl.source !== src) pl.setSource(src);
  await pl.ready(p, w, h);
  pl.render(p, phase, w, h);
  return pl.r.canvas;
}

const P = (id: string, patch: Partial<Params> = {}): Params => ({ ...presetParams(PRESETS.find((x) => x.id === id)!), ...patch });

/* ---------------- drawing helpers ---------------- */

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function cover(c: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number, x: number, y: number, w: number, h: number, r = 0) {
  const s = Math.max(w / iw, h / ih);
  c.save();
  c.beginPath(); c.roundRect(x, y, w, h, r); c.clip();
  c.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
  c.restore();
}

function hairline(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, alpha = 0.14) {
  c.strokeStyle = `rgba(255,255,255,${alpha})`; c.lineWidth = 1;
  c.beginPath(); c.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, r); c.stroke();
}

function caption(c: CanvasRenderingContext2D, t: number, n: number, title: string, sub: string) {
  const a = ease(t / 0.5);
  c.save();
  c.globalAlpha = a;
  c.translate(0, (1 - a) * 12);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = ACCENT; c.font = `500 13px ${MONO}`;
  try { (c as unknown as { letterSpacing: string }).letterSpacing = '1.5px'; } catch { /* noop */ }
  c.fillText(`USE CASE 0${n}`, 64, H - 108);
  try { (c as unknown as { letterSpacing: string }).letterSpacing = '-1px'; } catch { /* noop */ }
  c.fillStyle = '#fff'; c.font = `600 40px ${SANS}`;
  c.fillText(title, 64, H - 62);
  try { (c as unknown as { letterSpacing: string }).letterSpacing = '0px'; } catch { /* noop */ }
  c.fillStyle = '#a1a1aa'; c.font = `400 18px ${SANS}`;
  c.fillText(sub, 64, H - 32);
  c.restore();
}

/* ---------------- scenes ---------------- */

interface Scene { dur: number; draw: (c: CanvasRenderingContext2D, t: number, dur: number) => Promise<void> }
let editorShot: HTMLImageElement | null = null;

const scenes: Scene[] = [
  { // Title
    dur: 3.4,
    draw: async (c, t, dur) => {
      const img = await layer('full', 'title', P('red-signal', { columns: 128, anim: 'scan', intensity: 0.75, loopSeconds: dur, vignette: 0.65 }), (t / dur) % 1, W, H);
      c.drawImage(img, 0, 0);
      const a = ease((t - 0.6) / 0.6);
      c.globalAlpha = a;
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `500 24px ${SANS}`;
      c.fillText('Turn any image into a living background.', W / 2, H - 120 + (1 - a) * 10);
      c.globalAlpha = 1;
    },
  },
  { // Feature icons
    dur: 5,
    draw: async (c, t) => {
      const items: [string, string, string, Partial<Params>][] = [
        ['shield', 'Threat detection', 'Blocked before it lands.', { anim: 'scan', intensity: 0.6 }],
        ['network', 'Workflows', 'Route every request.', { anim: 'flicker', intensity: 0.5 }],
        ['print', 'Biometrics', 'Sign in with a touch.', { anim: 'wave', intensity: 0.45 }],
        ['lock', 'Compliance', 'Audited, end to end.', { anim: 'pulse', intensity: 0.5 }],
      ];
      const tw = 268, th = 201, gap = 24, x0 = (W - (tw * 4 + gap * 3)) / 2, y = 150;
      for (let i = 0; i < items.length; i++) {
        const [src, title, sub, patch] = items[i];
        const a = ease((t - 0.15 - i * 0.12) / 0.5);
        const img = await layer(`tile${i}`, src, P('red-signal', { columns: 62, loopSeconds: 2.5, ...patch }), (t / 2.5) % 1, tw * 2, th * 2);
        const x = x0 + i * (tw + gap);
        c.save();
        c.globalAlpha = a;
        c.translate(0, (1 - a) * 16);
        cover(c, img, tw * 2, th * 2, x, y, tw, th, 10);
        hairline(c, x, y, tw, th, 10);
        c.textAlign = 'left';
        c.fillStyle = '#fff'; c.font = `600 18px ${SANS}`; c.fillText(title, x + 2, y + th + 34);
        c.fillStyle = '#8b8b93'; c.font = `400 14.5px ${SANS}`; c.fillText(sub, x + 2, y + th + 58);
        c.restore();
      }
      caption(c, t, 1, 'Feature icons that glow', 'Drop in a flat icon. Get an animated LED tile for your landing page.');
    },
  },
  { // Website hero
    dur: 5,
    draw: async (c, t) => {
      const a = ease(t / 0.7);
      const wx = 150, wy = 44 + (1 - a) * 18, ww = 980, wh = 500, bar = 38;
      const img = await layer('hero', 'orb', P('ice-wall', { columns: 150, anim: 'wave', intensity: 0.6, loopSeconds: 4, vignette: 0.7 }), (t / 4) % 1, 1280, 720);
      c.save();
      c.globalAlpha = a;
      c.fillStyle = '#16161a';
      c.beginPath(); c.roundRect(wx, wy, ww, wh, 14); c.fill();
      cover(c, img, 1280, 720, wx, wy + bar, ww, wh - bar, 0);
      c.fillStyle = '#16161a'; c.fillRect(wx, wy + bar - 1, ww, 1);
      // scrim so the copy reads
      const g = c.createLinearGradient(wx, 0, wx + ww * 0.7, 0);
      g.addColorStop(0, 'rgba(2,6,17,0.86)'); g.addColorStop(1, 'rgba(2,6,17,0)');
      c.fillStyle = g; c.fillRect(wx, wy + bar, ww, wh - bar);
      hairline(c, wx, wy, ww, wh, 14);
      ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(wx + 22 + i * 18, wy + bar / 2, 5, 0, Math.PI * 2); c.fill(); });
      c.fillStyle = 'rgba(255,255,255,0.07)'; c.beginPath(); c.roundRect(wx + ww / 2 - 150, wy + 9, 300, 20, 6); c.fill();
      c.fillStyle = '#8b8b93'; c.font = `400 11.5px ${SANS}`; c.textAlign = 'center'; c.fillText('northwind.dev', wx + ww / 2, wy + 23.5);
      c.textAlign = 'left';
      c.fillStyle = '#fff'; c.font = `600 15px ${SANS}`; c.fillText('Northwind', wx + 44, wy + bar + 42);
      c.fillStyle = 'rgba(255,255,255,0.65)'; c.font = `400 13.5px ${SANS}`;
      ['Product', 'Pricing', 'Docs'].forEach((s, i) => c.fillText(s, wx + 170 + i * 82, wy + bar + 42));
      try { (c as unknown as { letterSpacing: string }).letterSpacing = '-1.6px'; } catch { /* noop */ }
      c.fillStyle = '#fff'; c.font = `600 54px ${SANS}`;
      c.fillText('Infrastructure', wx + 44, wy + bar + 190);
      c.fillText('that never blinks.', wx + 44, wy + bar + 250);
      try { (c as unknown as { letterSpacing: string }).letterSpacing = '0px'; } catch { /* noop */ }
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.font = `400 17px ${SANS}`;
      c.fillText('Deploy to 40 regions in one command.', wx + 44, wy + bar + 290);
      c.fillStyle = '#fff'; c.beginPath(); c.roundRect(wx + 44, wy + bar + 320, 138, 42, 21); c.fill();
      c.fillStyle = '#05070f'; c.font = `600 15px ${SANS}`; c.textAlign = 'center'; c.fillText('Get started', wx + 44 + 69, wy + bar + 346.5);
      c.restore();
      caption(c, t, 2, 'Hero backgrounds', 'Export a seamless MP4 loop and set it behind your headline.');
    },
  },
  { // Posters
    dur: 4.6,
    draw: async (c, t) => {
      const cards: [string, Params, string][] = [
        ['sun', P('pop-dots', { columns: 56, anim: 'none', angle: 30 }), 'Halftone'],
        ['words', P('one-bit', { columns: 150, matrix: 4, contrast: 0.9, brightness: -0.12 }), 'Ordered dither'],
        ['orb-tall', P('diffuse-ink', { columns: 170, contrast: 1.3 }), 'Error diffusion'],
      ];
      const cw = 262, ch = 367, gap = 44, x0 = (W - (cw * 3 + gap * 2)) / 2, y = 74;
      for (let i = 0; i < cards.length; i++) {
        const [src, p, label] = cards[i];
        const a = ease((t - 0.1 - i * 0.14) / 0.6);
        const s = sources.get(src)!;
        const iw = 600, ih = Math.round((600 * s.height) / s.width);
        const img = await layer(`poster${i}`, src, p, 0, iw, ih);
        const x = x0 + i * (cw + gap);
        c.save();
        c.globalAlpha = a;
        c.translate(x + cw / 2, y + ch / 2 + (1 - a) * 20);
        c.rotate(((i - 1) * 2.2 * Math.PI) / 180);
        c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 40; c.shadowOffsetY = 18;
        c.fillStyle = '#000'; c.fillRect(-cw / 2, -ch / 2, cw, ch);
        c.shadowColor = 'transparent';
        cover(c, img, iw, ih, -cw / 2, -ch / 2, cw, ch, 3);
        c.restore();
        c.globalAlpha = a;
        c.fillStyle = '#8b8b93'; c.font = `500 12.5px ${MONO}`; c.textAlign = 'center';
        c.fillText(label.toUpperCase(), x + cw / 2, y + ch + 44);
        c.globalAlpha = 1;
      }
      caption(c, t, 3, 'Posters, covers and print', 'Export at 4× or as real SVG vectors you can edit in Figma.');
    },
  },
  { // Phones
    dur: 4.8,
    draw: async (c, t) => {
      const phones: [string, Params, string, string][] = [
        ['print-tall', P('binary-rain', { columns: 40, loopSeconds: 4, intensity: 0.5, contrast: 1.5, brightness: 0.18, glow: 1.2 }), 'Verifying identity…', '#7dffb0'],
        ['shield-tall', P('phosphor', { columns: 300, bg: '#0d0700', mid: '#e09a12', high: '#fff3d1', anim: 'scan', intensity: 0.5, loopSeconds: 4 }), 'Vault locked', '#ffd27a'],
      ];
      const pw = 236, ph = 480, gap = 90, x0 = W - 64 - (pw * 2 + gap), y = 70;
      for (let i = 0; i < phones.length; i++) {
        const [src, p, label, col] = phones[i];
        const a = ease((t - 0.1 - i * 0.18) / 0.6);
        const img = await layer(`phone${i}`, src, p, (t / 4) % 1, 472, 960);
        const x = x0 + i * (pw + gap);
        c.save();
        c.globalAlpha = a;
        c.translate(0, (1 - a) * 22);
        c.fillStyle = '#1b1b1f'; c.beginPath(); c.roundRect(x - 9, y - 9, pw + 18, ph + 18, 40); c.fill();
        hairline(c, x - 9, y - 9, pw + 18, ph + 18, 40, 0.2);
        cover(c, img, 472, 960, x, y, pw, ph, 32);
        c.fillStyle = '#000'; c.beginPath(); c.roundRect(x + pw / 2 - 38, y + 12, 76, 22, 11); c.fill();
        c.fillStyle = col; c.font = `500 15px ${SANS}`; c.textAlign = 'center';
        c.fillText(label, x + pw / 2, y + ph - 54);
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.roundRect(x + pw / 2 - 46, y + ph - 16, 92, 4, 2); c.fill();
        c.restore();
      }
      // Caption sits beside the phones in this layout
      const a = ease(t / 0.5);
      c.save();
      c.globalAlpha = a;
      c.textAlign = 'left';
      c.fillStyle = ACCENT; c.font = `500 13px ${MONO}`;
      try { (c as unknown as { letterSpacing: string }).letterSpacing = '1.5px'; } catch { /* noop */ }
      c.fillText('USE CASE 04', 64, 280);
      try { (c as unknown as { letterSpacing: string }).letterSpacing = '-1px'; } catch { /* noop */ }
      c.fillStyle = '#fff'; c.font = `600 40px ${SANS}`;
      c.fillText('Loading and', 64, 330); c.fillText('lock screens', 64, 376);
      try { (c as unknown as { letterSpacing: string }).letterSpacing = '0px'; } catch { /* noop */ }
      c.fillStyle = '#a1a1aa'; c.font = `400 18px ${SANS}`;
      c.fillText('Binary rain and CRT loops that', 64, 416); c.fillText('make waiting feel designed.', 64, 442);
      c.restore();
    },
  },
  { // Editor
    dur: 4.8,
    draw: async (c, t, dur) => {
      if (editorShot) {
        const a = ease(t / 0.7);
        const s = 0.6 + 0.035 * (t / dur);
        const w = 1440 * s, h = 900 * s, x = (W - w) / 2, y = 26 + (1 - a) * 16;
        c.save();
        c.globalAlpha = a;
        c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 60; c.shadowOffsetY = 24;
        c.fillStyle = '#0b0b0c'; c.beginPath(); c.roundRect(x, y, w, h, 12); c.fill();
        c.shadowColor = 'transparent';
        cover(c, editorShot, 1440, 900, x, y, w, h, 12);
        hairline(c, x, y, w, h, 12, 0.16);
        c.restore();
      }
      const g = c.createLinearGradient(0, H - 230, 0, H);
      g.addColorStop(0, 'rgba(9,9,10,0)'); g.addColorStop(0.55, 'rgba(9,9,10,0.94)');
      c.fillStyle = g; c.fillRect(0, H - 230, W, 230);
      const a = ease(t / 0.5);
      c.globalAlpha = a;
      c.textAlign = 'left';
      c.fillStyle = ACCENT; c.font = `500 13px ${MONO}`;
      try { (c as unknown as { letterSpacing: string }).letterSpacing = '1.5px'; } catch { /* noop */ }
      c.fillText('THE EDITOR', 64, H - 108);
      try { (c as unknown as { letterSpacing: string }).letterSpacing = '-1px'; } catch { /* noop */ }
      c.fillStyle = '#fff'; c.font = `600 40px ${SANS}`; c.fillText('Pick a look. Tune it live.', 64, H - 62);
      try { (c as unknown as { letterSpacing: string }).letterSpacing = '0px'; } catch { /* noop */ }
      c.fillStyle = '#a1a1aa'; c.font = `400 18px ${SANS}`; c.fillText('12 presets, 6 effects, 6 kinds of motion. Works on a phone too.', 64, H - 32);
      c.globalAlpha = 1;
    },
  },
  { // End card
    dur: 3,
    draw: async (c, t) => {
      const a = ease(t / 0.6);
      c.globalAlpha = a;
      const cx = W / 2, cy = H / 2 - 30;
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
        const center = x === 1 && y === 1, dim = (x + y) % 4 === 0 && !center;
        c.globalAlpha = a * (dim ? 0.35 : 1);
        c.fillStyle = center ? '#fff' : ACCENT;
        c.beginPath(); c.arc(cx - 172 + x * 17, cy - 17 + y * 17, 6.2, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = a;
      c.textAlign = 'left'; c.textBaseline = 'middle';
      try { (c as unknown as { letterSpacing: string }).letterSpacing = '-2px'; } catch { /* noop */ }
      c.fillStyle = '#fff'; c.font = `600 64px ${SANS}`; c.fillText('Scanlight', cx - 118, cy + 2);
      c.textBaseline = 'alphabetic'; c.textAlign = 'center';
      try { (c as unknown as { letterSpacing: string }).letterSpacing = '1.5px'; } catch { /* noop */ }
      c.fillStyle = '#8b8b93'; c.font = `500 14px ${MONO}`;
      c.fillText('PNG  ·  SVG  ·  MP4  —  RUNS ENTIRELY IN YOUR BROWSER', cx, cy + 86);
      try { (c as unknown as { letterSpacing: string }).letterSpacing = '0px'; } catch { /* noop */ }
      c.globalAlpha = 1;
    },
  },
];

const TOTAL = scenes.reduce((s, x) => s + x.dur, 0);

async function drawFrame(c: CanvasRenderingContext2D, time: number) {
  let t = time, scene = scenes[scenes.length - 1];
  for (const s of scenes) { if (t < s.dur) { scene = s; break; } t -= s.dur; }
  if (t > scene.dur) t = scene.dur;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.fillStyle = '#09090a';
  c.fillRect(0, 0, W, H);
  await scene.draw(c, t, scene.dur);
  // Dip to black between scenes
  const fade = Math.min(1, t / 0.28, (scene.dur - t) / 0.28);
  if (fade < 1) { c.globalAlpha = 1 - Math.max(0, fade); c.fillStyle = '#09090a'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
}

/* ---------------- encode ---------------- */

async function render(canvas: HTMLCanvasElement, status: (s: string) => void) {
  const c = canvas.getContext('2d')!;
  const frames = Math.round(TOTAL * FPS);
  let config: VideoEncoderConfig | null = null;
  for (const codec of ['avc1.640028', 'avc1.4D0028', 'avc1.42001F']) {
    const cfg: VideoEncoderConfig = { codec, width: W, height: H, bitrate: 9_000_000, framerate: FPS };
    if ((await VideoEncoder.isConfigSupported(cfg)).supported) { config = cfg; break; }
  }
  if (!config) throw new Error('This browser cannot encode H.264.');
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: 'avc', width: W, height: H, frameRate: FPS }, fastStart: 'in-memory' });
  let failure: unknown = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e; } });
  enc.configure(config);
  for (let i = 0; i < frames; i++) {
    if (failure) throw failure;
    await drawFrame(c, i / FPS);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(frame, { keyFrame: i % FPS === 0 });
    frame.close();
    while (enc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 1));
    if (i % 10 === 0) { status(`Rendering ${Math.round((i / frames) * 100)}%`); await new Promise((r) => setTimeout(r, 0)); }
  }
  await enc.flush();
  enc.close();
  muxer.finalize();
  return new Blob([target.buffer], { type: 'video/mp4' });
}

async function main() {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const btn = document.getElementById('go') as HTMLButtonElement;
  const out = document.getElementById('status')!;
  canvas.width = W; canvas.height = H;
  await Promise.all([document.fonts.load(`900 100px ${SANS}`), document.fonts.load(`600 40px ${SANS}`), document.fonts.load(`500 13px ${MONO}`)]);
  await document.fonts.ready;
  buildSources();
  editorShot = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = './editor.png'; });

  // Live preview until the user renders
  const c = canvas.getContext('2d')!;
  let previewing = true;
  const t0 = performance.now();
  const loop = async () => {
    if (!previewing) return;
    await drawFrame(c, ((performance.now() - t0) / 1000) % TOTAL);
    requestAnimationFrame(loop);
  };
  loop();
  // Hook for checking single frames from a test script
  (window as unknown as Record<string, unknown>).__frame = async (t: number) => { previewing = false; await new Promise((r) => setTimeout(r, 80)); await drawFrame(c, t); };
  out.textContent = `Preview playing · ${TOTAL.toFixed(1)}s · ${W}×${H} · ${FPS} fps`;

  const run = async () => {
    previewing = false;
    btn.disabled = true;
    await new Promise((r) => setTimeout(r, 60));
    try {
      const blob = await render(canvas, (s) => { out.textContent = s; });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'scanlight-demo.mp4';
      document.body.appendChild(a); a.click(); a.remove();
      out.textContent = `Done · ${(blob.size / 1e6).toFixed(1)} MB saved as scanlight-demo.mp4`;
    } catch (e) {
      out.textContent = `Failed: ${(e as Error).message}`;
    }
    btn.disabled = false;
    previewing = true;
    loop();
  };
  btn.onclick = run;
  if (new URLSearchParams(location.search).has('auto')) run();
}

main();
