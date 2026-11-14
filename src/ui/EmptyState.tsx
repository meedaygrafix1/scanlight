import { useEffect, useRef, useState } from 'react';
import { SAMPLE_LIST } from './samples';
import { Pipeline } from '../engine/pipeline';
import { DEFAULTS } from '../state/presets';
import type { EffectId, Params } from '../state/types';
import type { Source } from '../engine/load';
import { MOD } from './keys';
import { InstallHint } from './install';

/* The landing page has no illustration: the full screen is a live render.
   A 2D canvas draws the headline lit by the cursor, and the real pipeline dithers it. */

const INK = { bg: '#090909', mid: '#8d8a82', high: '#f4f1ea' };

interface HeroEffect {
  id: EffectId;
  name: string;
  swatch: string;
  /** cssW / cssH are the on-screen size, so density stays constant across screens. */
  params: (cssW: number, cssH: number) => Partial<Params>;
}

const HERO: HeroEffect[] = [
  {
    id: 'led', name: 'LED Matrix', swatch: '#e0182d',
    params: (w) => ({ columns: w / 11, dot: 0.78, ambient: 0.3, bg: '#150103', mid: '#e0182d', high: '#fff4f2', glow: 0.95 }),
  },
  {
    id: 'halftone', name: 'Halftone', swatch: INK.high,
    params: (w) => ({ columns: w / 9, dot: 1, angle: 45, ...INK, glow: 0.2, scanlines: 0, aberration: 0.08 }),
  },
  {
    id: 'bayer', name: 'Ordered', swatch: INK.high,
    params: (w) => ({ columns: w / 4, levels: 2, matrix: 4, ...INK, glow: 0.12, scanlines: 0, noise: 0.03, aberration: 0 }),
  },
  {
    id: 'diffusion', name: 'Diffusion', swatch: INK.high,
    params: (w) => ({ columns: w / 3, levels: 2, ...INK, glow: 0.12, scanlines: 0, noise: 0.03, aberration: 0 }),
  },
  {
    id: 'ascii', name: 'ASCII', swatch: '#1fb35a',
    params: (w) => ({ columns: w / 9, charset: ' .:-=+*#%@', glyphMode: 'luma', ambient: 0, bg: '#020a05', mid: '#1fb35a', high: '#d9ffe4', glow: 0.8 }),
  },
  {
    id: 'crt', name: 'CRT', swatch: '#e09a12',
    params: (_w, h) => ({ columns: h / 4, dot: 0.85, bg: '#0d0700', mid: '#e09a12', high: '#fff3d1', glow: 1, scanlines: 0.18, aberration: 0.35 }),
  },
];

const BASE: Params = {
  ...DEFAULTS, anim: 'none', contrast: 1, brightness: 0, gamma: 1, blackPoint: 0.02,
  vignette: 0.5, noise: 0.09, scanlines: 0.1, aberration: 0.15, glowRadius: 0.5, curvature: 0,
};

interface Props {
  onPick: () => void;
  onSample: (id: string) => void;
  busy: boolean;
  dragOver: boolean;
}

export function EmptyState({ onPick, onSample, busy, dragOver }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [effect, setEffect] = useState(0);
  const effectRef = useRef(0);
  effectRef.current = effect;
  const dragRef = useRef(false);
  dragRef.current = dragOver;

  useEffect(() => {
    const canvas = canvasRef.current!;
    let pl: Pipeline;
    try { pl = new Pipeline(canvas); } catch { return; }

    const src = document.createElement('canvas');
    const text = document.createElement('canvas');
    const sctx = src.getContext('2d', { willReadFrequently: true })!;
    const tctx = text.getContext('2d')!;
    const fake: Source = { canvas: src, width: 1, height: 1, name: '', url: '' };

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = matchMedia('(pointer: coarse)').matches;
    let cssW = 1, cssH = 1, outW = 1, outH = 1;
    const light = { x: 0.3, y: 0.35 };
    const target = { x: 0.3, y: 0.35 };
    let lastMove = -1e9;
    let raf = 0, dead = false;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      cssW = Math.max(1, r.width);
      cssH = Math.max(1, r.height);
      const k = Math.min(Math.min(devicePixelRatio || 1, 2), 1920 / cssW);
      outW = Math.round(cssW * k);
      outH = Math.round(cssH * k);
      const sk = Math.min(1, 1280 / cssW);
      src.width = text.width = Math.round(cssW * sk);
      src.height = text.height = Math.round(cssH * sk);
      fake.width = src.width;
      fake.height = src.height;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      target.x = (e.clientX - r.left) / r.width;
      target.y = (e.clientY - r.top) / r.height;
      lastMove = performance.now();
    };
    window.addEventListener('pointermove', onMove);

    const drawSource = () => {
      const W = src.width, H = src.height;
      const s = W / cssW;
      const narrow = cssW < 720;
      const verb = coarse ? 'PICK' : 'DROP';
      const lines = dragRef.current ? ['LET GO'] : narrow ? [verb, 'AN', 'IMAGE'] : [`${verb} AN`, 'IMAGE'];

      // Fit the headline to the left margin and the space above the controls
      const margin = (narrow ? 16 : 28) * s;
      const top = (narrow ? 84 : 96) * s;
      const availH = H * (narrow ? 0.5 : 0.66) - top;
      const font = (px: number) => `900 ${px}px "Geist Variable", system-ui, sans-serif`;
      tctx.font = font(100);
      try { (tctx as unknown as { letterSpacing: string }).letterSpacing = '-4px'; } catch { /* older browsers */ }
      const widest = Math.max(...lines.map((l) => tctx.measureText(l).width));
      const lh = 0.84;
      const fs = Math.min(((W - margin * 2) / widest) * 100, availH / (lines.length * lh));

      const lx = light.x * W, ly = light.y * H;
      const R = Math.max(W, H) * 0.34;

      tctx.clearRect(0, 0, W, H);
      tctx.globalCompositeOperation = 'source-over';
      tctx.font = font(fs);
      try { (tctx as unknown as { letterSpacing: string }).letterSpacing = `${-0.045 * fs}px`; } catch { /* noop */ }
      tctx.textBaseline = 'alphabetic';
      tctx.fillStyle = '#fff';
      lines.forEach((l, i) => tctx.fillText(l, margin - fs * 0.04, top + fs * 0.78 + i * fs * lh));
      // Letters: a dim base everywhere, white-hot under the light
      tctx.globalCompositeOperation = 'source-in';
      tctx.fillStyle = '#4c4c4c';
      tctx.fillRect(0, 0, W, H);
      tctx.globalCompositeOperation = 'source-atop';
      const hot = tctx.createRadialGradient(lx, ly, 0, lx, ly, R);
      hot.addColorStop(0, 'rgba(255,255,255,1)');
      hot.addColorStop(0.35, 'rgba(255,255,255,0.75)');
      hot.addColorStop(1, 'rgba(255,255,255,0)');
      tctx.fillStyle = hot;
      tctx.fillRect(0, 0, W, H);

      sctx.fillStyle = '#000';
      sctx.fillRect(0, 0, W, H);
      const spill = sctx.createRadialGradient(lx, ly, 0, lx, ly, R * 0.9);
      spill.addColorStop(0, 'rgba(255,255,255,0.2)');
      spill.addColorStop(1, 'rgba(255,255,255,0)');
      sctx.fillStyle = spill;
      sctx.fillRect(0, 0, W, H);
      sctx.drawImage(text, 0, 0);
    };

    const start = performance.now();
    const tick = (now: number) => {
      if (dead) return;
      const t = (now - start) / 1000;
      // With no pointer (touch, idle), the light wanders on its own
      if (!reduce && (coarse || now - lastMove > 2600)) {
        target.x = 0.5 + 0.38 * Math.sin(t * 0.31);
        target.y = 0.36 + 0.2 * Math.sin(t * 0.47 + 1.3);
      }
      light.x += (target.x - light.x) * 0.09;
      light.y += (target.y - light.y) * 0.09;

      drawSource();
      const fx = HERO[effectRef.current];
      const p: Params = { ...BASE, effect: fx.id, ...fx.params(cssW, cssH) };
      pl.setSource(fake);
      if (pl.prepare(p, outW, outH)) pl.render(p, reduce ? 0 : (t / 4) % 1, outW, outH);
      raf = requestAnimationFrame(tick);
    };

    document.fonts.load('900 100px "Geist Variable"').catch(() => {}).then(() => {
      if (!dead) raf = requestAnimationFrame(tick);
    });

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      pl.r.dispose();
    };
  }, []);

  return (
    <div className="landing" data-drag={dragOver || undefined}>
      <canvas
        ref={canvasRef}
        className="landing-canvas"
        onClick={() => !busy && onPick()}
        aria-hidden
      />
      <div className="landing-scrim" aria-hidden />
      <i className="tick tick-tl" aria-hidden /><i className="tick tick-tr" aria-hidden />
      <i className="tick tick-bl" aria-hidden /><i className="tick tick-br" aria-hidden />

      <p className="l-note mono">
        Nothing on this screen is a picture. The headline is being rendered right now, by the same engine you are about to use. Your cursor is the light.
      </p>
      <InstallHint />

      <div className="l-input">
        <div className="l-label mono">Input</div>
        <p className="l-lead">
          Drop an image anywhere on this page, or{' '}
          <button className="l-link" onClick={onPick} disabled={busy}>browse your files</button>.
        </p>
        <p className="l-sub mono">
          <span>Paste works too — <kbd>{MOD}</kbd><kbd>V</kbd></span>
          <span className="l-samples">
            Nothing to hand?
            {SAMPLE_LIST.map((s) => (
              <button key={s.id} className="l-link" onClick={() => onSample(s.id)} disabled={busy}>{s.name}</button>
            ))}
          </span>
        </p>
      </div>

      <nav className="l-index" aria-label="Preview effect">
        <div className="l-label mono">Rendering this page as</div>
        <ol>
          {HERO.map((fx, i) => (
            <li key={fx.id}>
              <button
                className="l-row mono"
                data-active={i === effect || undefined}
                aria-pressed={i === effect}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setEffect(i)}
                onFocus={() => setEffect(i)}
                onClick={() => setEffect(i)}
              >
                <span className="l-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="l-name">{fx.name}</span>
                <span className="l-swatch" style={{ background: fx.swatch }} />
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
