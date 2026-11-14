import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ZoomOut, ZoomIn, Maximize, Pause, Play } from './icons';
import type { Params } from '../state/types';
import type { Source } from '../engine/load';
import { k, COARSE } from './keys';
import { Close } from './icons';
import { Pipeline, previewSize } from '../engine/pipeline';

interface Props {
  source: Source;
  params: Params;
  playing: boolean;
  onTogglePlay: () => void;
  compare: boolean;
  onError: (msg: string) => void;
  pipelineRef: React.MutableRefObject<Pipeline | null>;
  phaseRef: React.MutableRefObject<number>;
}

const MIN_Z = 0.05, MAX_Z = 32;

export function Viewport({ source, params, playing, onTogglePlay, compare, onError, pipelineRef, phaseRef }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [split, setSplit] = useState(0.5);
  const [spaceDown, setSpaceDown] = useState(false);
  const [tip, setTip] = useState(() => { try { return !localStorage.getItem('scanlight:tip'); } catch { return false; } });
  const dismissTip = () => { setTip(false); try { localStorage.setItem('scanlight:tip', '1'); } catch { /* ignore */ } };
  const [panning, setPanning] = useState(false);

  const timeLabel = useRef<HTMLSpanElement>(null);
  const scrubRef = useRef<HTMLInputElement>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const frame = useRef(0);
  const { w, h } = previewSize(source);
  const animated = params.anim !== 'none';

  /* ---------- Pipeline lifecycle ---------- */
  useEffect(() => {
    try {
      const pl = new Pipeline(canvasRef.current!);
      pipelineRef.current = pl;
      return () => { pipelineRef.current = null; pl.r.dispose(); };
    } catch (e) {
      onError((e as Error).message);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const draw = useCallback(() => {
    const pl = pipelineRef.current;
    if (!pl) return;
    const p = paramsRef.current;
    pl.prepare(p, w, h);
    pl.render(p, phaseRef.current, w, h);
  }, [w, h, pipelineRef]);

  useEffect(() => {
    const pl = pipelineRef.current;
    if (!pl) return;
    pl.setSource(source);
    pl.onAsyncReady = draw;
  }, [source, draw, pipelineRef]);

  const updateTimeUi = useCallback(() => {
    const t = phaseRef.current * paramsRef.current.loopSeconds;
    if (timeLabel.current) timeLabel.current.textContent = `${t.toFixed(1)}s`;
    if (scrubRef.current) scrubRef.current.value = String(phaseRef.current);
  }, []);

  // Animation loop / single redraw on change
  useEffect(() => {
    cancelAnimationFrame(frame.current);
    if (animated && playing) {
      let last = performance.now();
      const tick = (now: number) => {
        const dt = (now - last) / 1000;
        last = now;
        phaseRef.current = (phaseRef.current + dt / paramsRef.current.loopSeconds) % 1;
        draw();
        updateTimeUi();
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    } else {
      frame.current = requestAnimationFrame(() => draw());
    }
    return () => cancelAnimationFrame(frame.current);
  }, [params, animated, playing, draw, updateTimeUi]);

  /* ---------- Zoom & pan ---------- */
  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = r.width < 600 ? 24 : 64;
    const z = Math.min((r.width - pad * 2) / w, (r.height - pad * 2 - 40) / h, 1.5);
    setView({ x: (r.width - w * z) / 2, y: (r.height - h * z) / 2 - 12, z });
  }, [w, h]);

  useLayoutEffect(() => { fit(); }, [fit, source]);

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const el = wrapRef.current!;
    const r = el.getBoundingClientRect();
    const px = cx ?? r.width / 2, py = cy ?? r.height / 2;
    setView((v) => {
      const z = Math.min(MAX_Z, Math.max(MIN_Z, v.z * factor));
      const k = z / v.z;
      return { z, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);

  useEffect(() => {
    const el = wrapRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * (e.ctrlKey && Math.abs(e.deltaY) < 50 ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top);
      } else {
        setView((v) => ({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]');
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.code === 'Space' && !e.repeat) { setSpaceDown(true); e.preventDefault(); }
      const mod = e.metaKey || e.ctrlKey;
      if ((mod && e.key === '0') || (e.shiftKey && e.key === '!')) { e.preventDefault(); fit(); }
      if (mod && e.key === '1') { e.preventDefault(); const el = wrapRef.current!.getBoundingClientRect(); setView({ z: 1, x: (el.width - w) / 2, y: (el.height - h) / 2 }); }
      if ((mod && (e.key === '=' || e.key === '+')) || (!mod && e.key === '=')) { e.preventDefault(); zoomAt(1.25); }
      if ((mod && e.key === '-') || (!mod && e.key === '-')) { e.preventDefault(); zoomAt(0.8); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceDown(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [fit, zoomAt, w, h]);

  /* Touch: one finger pans, two fingers pinch-zoom around their midpoint */
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const onTouchMove = (e: React.PointerEvent) => {
    const pts = touches.current;
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (pts.size === 1) {
      pts.set(e.pointerId, cur);
      setView((v) => ({ ...v, x: v.x + cur.x - prev.x, y: v.y + cur.y - prev.y }));
      return;
    }
    if (pts.size !== 2) return;
    const other = [...pts.entries()].find(([id]) => id !== e.pointerId)![1];
    const d0 = Math.hypot(prev.x - other.x, prev.y - other.y) || 1;
    const d1 = Math.hypot(cur.x - other.x, cur.y - other.y) || 1;
    const r = wrapRef.current!.getBoundingClientRect();
    const m0 = { x: (prev.x + other.x) / 2 - r.left, y: (prev.y + other.y) / 2 - r.top };
    const m1 = { x: (cur.x + other.x) / 2 - r.left, y: (cur.y + other.y) / 2 - r.top };
    pts.set(e.pointerId, cur);
    setView((v) => {
      const z = Math.min(MAX_Z, Math.max(MIN_Z, v.z * (d1 / d0)));
      const k = z / v.z;
      return { z, x: m1.x - (m0.x - v.x) * k, y: m1.y - (m0.y - v.y) * k };
    });
  };
  const onTouchEnd = (e: React.PointerEvent) => { touches.current.delete(e.pointerId); };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    if (!(spaceDown || e.button === 1)) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    setPanning(true);
    const sx = e.clientX, sy = e.clientY, v0 = viewRef.current;
    const move = (ev: PointerEvent) => setView({ ...v0, x: v0.x + ev.clientX - sx, y: v0.y + ev.clientY - sy });
    const up = () => {
      setPanning(false);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  /* ---------- Compare handle ---------- */
  const onSplitDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const art = handle.parentElement!;
    const move = (ev: PointerEvent) => {
      const r = art.getBoundingClientRect();
      setSplit(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)));
    };
    const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={wrapRef}
      className="viewport"
      data-pan={spaceDown || undefined}
      data-panning={panning || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onTouchMove}
      onPointerUp={onTouchEnd}
      onPointerCancel={onTouchEnd}
      onDoubleClick={(e) => { if (e.target === wrapRef.current || e.target === canvasRef.current) fit(); }}
    >
      <div
        className="artboard"
        style={{ width: w, height: h, transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
      >
        <div className="artboard-label" style={{ transform: `scale(${1 / view.z})` }}>
          {source.name} <span>{source.width} × {source.height}</span>
        </div>
        <canvas ref={canvasRef} className="art-canvas" data-pixelated={view.z > 2 || undefined} />
        {compare && (
          <>
            <img
              src={source.url}
              className="compare-img"
              alt="Original"
              draggable={false}
              style={{ clipPath: `inset(0 ${(1 - split) * 100}% 0 0)` }}
            />
            <div className="compare-handle" style={{ left: `${split * 100}%` }} onPointerDown={onSplitDown}>
              <div className="compare-line" style={{ width: 2 / view.z }} />
              <div className="compare-knob" style={{ transform: `translate(-50%, -50%) scale(${1 / view.z})` }}>
                <span>Original</span><span>Result</span>
              </div>
            </div>
          </>
        )}
      </div>

      {tip && (
        <div className="hud hud-tip" role="note" onPointerDown={(e) => e.stopPropagation()}>
          <span>
            {COARSE
              ? 'Pick a look below, fine-tune it in the tabs, then Export. Pinch the image to zoom.'
              : 'Pick a look on the left, fine-tune it on the right, then Export. Hover any control for an explanation.'}
          </span>
          <button className="icon-btn" onClick={dismissTip} aria-label="Dismiss tip"><Close /></button>
        </div>
      )}
      <div className="hud hud-zoom" onPointerDown={(e) => e.stopPropagation()}>
        <button className="icon-btn" onClick={() => zoomAt(0.8)} aria-label="Zoom out" title="Zoom out (−)"><ZoomOut size={19} /></button>
        <button className="zoom-value" onClick={fit} title={k('Fit to screen (⇧1)')}>{Math.round(view.z * 100)}%</button>
        <button className="icon-btn" onClick={() => zoomAt(1.25)} aria-label="Zoom in" title="Zoom in (=)"><ZoomIn size={19} /></button>
        <div className="hud-sep" />
        <button className="icon-btn" onClick={fit} aria-label="Fit" title={k('Fit (⇧1)')}><Maximize /></button>
      </div>

      {animated && (
        <div className="hud hud-timeline" onPointerDown={(e) => e.stopPropagation()}>
          <button className="icon-btn play" onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (K)' : 'Play (K)'}>
            {playing ? <Pause size={19} /> : <Play size={19} />}
          </button>
          <input
            ref={scrubRef}
            className="scrub"
            type="range"
            min={0}
            max={0.999}
            step={0.001}
            defaultValue={0}
            aria-label="Loop position"
            onChange={(e) => { phaseRef.current = parseFloat(e.target.value); updateTimeUi(); if (!playing) draw(); }}
          />
          <span className="time mono"><span ref={timeLabel}>0.0s</span> / {params.loopSeconds.toFixed(1)}s</span>
        </div>
      )}
    </div>
  );
}
