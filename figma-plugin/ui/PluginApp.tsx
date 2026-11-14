import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sanitize, useEditor } from '../../src/state/store';
import { PRESETS, presetParams } from '../../src/state/presets';
import { Inspector } from '../../src/ui/Inspector';
import { Segmented } from '../../src/ui/controls';
import { Pipeline } from '../../src/engine/pipeline';
import { loadImage, type Source } from '../../src/engine/load';
import { buildSvg, canvasBlob, SVG_EFFECTS } from '../../src/engine/export';
import { gridSize } from '../../src/engine/sample';
import type { ApplyMode, SelectedNode, ToMain, ToUI } from '../messages';

const send = (m: ToMain) => parent.postMessage({ pluginMessage: m }, '*');

/** Figma's largest image fill. */
const MAX_OUT = 4096;
/** Past this many shapes, Figma gets sluggish with the vector result. */
const VECTOR_LIMIT = 15000;
const PREVIEW_MAX = 1600;

type Sel = { state: 'none' | 'multiple' | 'unsupported' } | { state: 'one'; node: SelectedNode };

export function PluginApp() {
  const editor = useEditor();
  const p = editor.params;
  const [sel, setSel] = useState<Sel>({ state: 'none' });
  const [source, setSource] = useState<{ id: string; src: Source } | null>(null);
  const [mode, setMode] = useState<ApplyMode>('fill');
  const [scale, setScale] = useState<1 | 2>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const node = sel.state === 'one' ? sel.node : null;
  const ready = !!node && source?.id === node.id;
  const src = ready ? source!.src : null;

  /* ---------- Messages from the main thread ---------- */

  const lastNode = useRef<string | null>(null);
  const editorRef = useRef(editor);
  editorRef.current = editor;

  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      const m = e.data?.pluginMessage as ToUI | undefined;
      if (!m) return;
      if (m.type === 'selection') {
        setSel(m.state === 'one' ? { state: 'one', node: m.node } : { state: m.state });
        if (m.state !== 'one') { lastNode.current = null; return; }
        const n = m.node;
        if (n.id !== lastNode.current) {
          lastNode.current = n.id;
          // A Scanlight node brings back the settings it was made with.
          if (n.saved) editorRef.current.replace(sanitize(n.saved.params), n.saved.presetId);
          setMode(n.saved?.kind ?? (n.canFill ? 'fill' : 'layer'));
        }
      } else if (m.type === 'source') {
        try {
          const s = await loadImage(new Blob([m.bytes as BlobPart], { type: 'image/png' }), 'layer');
          setSource((prev) => {
            if (prev) URL.revokeObjectURL(prev.src.url);
            return { id: m.id, src: s };
          });
        } catch {
          setError("Couldn't decode that layer's pixels.");
        }
      } else if (m.type === 'applied') {
        setBusy(false);
      } else if (m.type === 'error') {
        setBusy(false);
        setError(m.message);
      }
    };
    window.addEventListener('message', onMsg);
    send({ type: 'ready' });
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(id);
  }, [error]);

  /* ---------- Preview ---------- */

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pipeRef = useRef<Pipeline | null>(null);
  const offRef = useRef<Pipeline | null>(null);
  const phaseRef = useRef(0);
  const paramsRef = useRef(p);
  paramsRef.current = p;

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(stageRef.current!);
    return () => ro.disconnect();
  }, []);

  // Fit the source inside the stage with a margin; render at device resolution.
  const fit = useMemo(() => {
    if (!src || box.w < 40 || box.h < 40) return null;
    const a = src.width / src.height;
    const dw = Math.min(box.w - 40, (box.h - 40) * a);
    const dh = dw / a;
    const k = Math.min(window.devicePixelRatio || 1, PREVIEW_MAX / Math.max(dw, dh));
    return { dw, dh, rw: Math.round(dw * k), rh: Math.round(dh * k) };
  }, [src, box]);
  const fitRef = useRef(fit);
  fitRef.current = fit;

  const draw = useCallback(() => {
    const pl = pipeRef.current, f = fitRef.current;
    if (!pl || !pl.source || !f) return;
    pl.prepare(paramsRef.current, f.rw, f.rh);
    pl.render(paramsRef.current, phaseRef.current, f.rw, f.rh);
  }, []);

  useEffect(() => {
    if (!src || !canvasRef.current) return;
    if (!pipeRef.current) {
      try {
        pipeRef.current = new Pipeline(canvasRef.current);
        pipeRef.current.onAsyncReady = draw;
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    }
    pipeRef.current.setSource(src);
    draw();
  }, [src, draw]);

  useEffect(draw, [p, fit, draw]);

  // Motion plays in the preview; the loop is a function of phase, so it never seams.
  useEffect(() => {
    if (p.anim === 'none' || !src) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      phaseRef.current = (phaseRef.current + (now - last) / 1000 / paramsRef.current.loopSeconds) % 1;
      last = now;
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [p.anim, src, draw]);

  useEffect(() => () => { pipeRef.current?.r.dispose(); offRef.current?.r.dispose(); }, []);

  /* ---------- Undo inside the plugin window ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) editorRef.current.redo(); else editorRef.current.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- Output ---------- */

  const out = useMemo(() => {
    if (!node || !src) return null;
    const w0 = node.width * scale;
    const h0 = w0 * (src.height / src.width);
    const k = Math.min(1, MAX_OUT / Math.max(w0, h0));
    return { w: Math.max(1, Math.round(w0 * k)), h: Math.max(1, Math.round(h0 * k)) };
  }, [node, src, scale]);

  const svgOk = (SVG_EFFECTS as readonly string[]).includes(p.effect);
  const shapes = useMemo(() => {
    if (!src) return 0;
    const g = gridSize(p, src.width, src.height);
    return p.effect === 'ascii' ? Math.round(g.cols * (g.rowsExact / 1.45)) : p.effect === 'halftone' ? Math.round(g.cols * g.rowsExact * 1.4) : g.cols * g.rows;
  }, [p, src]);

  const kind = node?.saved?.kind;
  const modes: { value: ApplyMode; label: string; title: string }[] = [];
  if (node?.canFill && kind !== 'layer' && kind !== 'vector') {
    modes.push({ value: 'fill', label: kind === 'fill' ? 'Update fill' : 'Fill', title: 'Replace this layer’s fill. The original stays hidden underneath.' });
  }
  modes.push({ value: 'layer', label: kind === 'layer' ? 'Update layer' : 'New layer', title: 'Add the result as an image layer beside this one.' });
  modes.push({ value: 'vector', label: kind === 'vector' ? 'Update vectors' : 'Vectors', title: 'Add the result as editable shapes.' });
  const activeMode = modes.some((m) => m.value === mode) ? mode : modes[0].value;

  const blocked =
    activeMode === 'vector' && !svgOk ? 'Vectors work with LED, Halftone, Ordered, Diffusion and ASCII.'
    : activeMode === 'vector' && shapes > VECTOR_LIMIT ? `~${shapes.toLocaleString()} shapes is too many for Figma. Lower the density.`
    : null;

  const preset = PRESETS.find((x) => x.id === editor.presetId);

  const apply = async () => {
    if (!node || !src || !out || busy || blocked) return;
    setBusy(true);
    setError(null);
    const base = { type: 'apply' as const, mode: activeMode, id: node.id, params: JSON.stringify(p), presetId: editor.presetId, label: preset?.name ?? 'Scanlight' };
    try {
      if (activeMode === 'vector') {
        send({ ...base, svg: buildSvg(p, src.canvas, src.width, src.height) });
        return;
      }
      if (!offRef.current) offRef.current = new Pipeline(document.createElement('canvas'), true);
      const off = offRef.current;
      if (off.source !== src) off.setSource(src);
      const k = Math.min(1, off.r.maxSize / Math.max(out.w, out.h));
      const w = Math.round(out.w * k), h = Math.round(out.h * k);
      await off.ready(p, w, h);
      off.render(p, p.anim !== 'none' ? phaseRef.current : 0, w, h);
      const blob = await canvasBlob(off.r.canvas, 'image/png');
      send({ ...base, png: new Uint8Array(await blob.arrayBuffer()) });
    } catch (e) {
      setBusy(false);
      setError((e as Error).message);
    }
  };

  /* ---------- View ---------- */

  const hint = !out ? '' : activeMode === 'vector'
    ? `~${shapes.toLocaleString()} shapes`
    : `${out.w} × ${out.h} PNG${p.anim !== 'none' ? ' · frame on screen' : ''}`;

  return (
    <div className="plug">
      <main className="plug-main">
        <header className="plug-head">
          {node ? (
            <>
              <span className="layer-tag" title={node.name}>
                <span className="layer-name">{node.name}</span>
              </span>
              <span className="layer-dims">{Math.round(node.width)} × {Math.round(node.height)}</span>
              <span className="grow" />
              {kind === 'fill' && (
                <button className="text-btn" onClick={() => send({ type: 'restore', id: node.id })} title="Remove the effect and bring back this layer's own fill">
                  Restore original
                </button>
              )}
              {src && kind !== 'fill' && <span className="head-hint">Hold preview to compare</span>}
            </>
          ) : (
            <span className="head-hint">No layer selected</span>
          )}
        </header>

        <div
          ref={stageRef}
          className="stage"
          onPointerDown={(e) => { if (src && e.button === 0) setCompare(true); }}
          onPointerUp={() => setCompare(false)}
          onPointerLeave={() => setCompare(false)}
          onPointerCancel={() => setCompare(false)}
        >
          <div
            className="shot"
            data-hidden={!fit || undefined}
            style={fit ? { width: fit.dw, height: fit.dh } : undefined}
          >
            <canvas ref={canvasRef} />
            {src && compare && (
              <>
                <img src={src.url} alt="" draggable={false} />
                <span className="compare-pill">Original</span>
              </>
            )}
          </div>

          {!src && (
            <div className="empty">
              <div className="empty-frame" data-scanning={(node && !ready) || undefined} />
              <p className="empty-title">
                {sel.state === 'multiple' ? 'Select one layer at a time'
                  : sel.state === 'unsupported' ? 'This layer has nothing to scan'
                  : node ? 'Reading layer…'
                  : 'Select a layer'}
              </p>
              <p className="empty-sub">
                {sel.state === 'multiple' ? 'Scanlight works on one image, shape or frame.'
                  : sel.state === 'unsupported' ? 'Pick something with a visible area.'
                  : node ? `Scanning “${node.name}” as it looks on the canvas.`
                  : 'Pick an image, shape or frame. Scanlight reads it exactly as it looks on the canvas.'}
              </p>
            </div>
          )}

          {error && <div className="plug-error" role="alert">{error}</div>}
        </div>

        <div className="preset-strip" role="list" aria-label="Presets">
          {PRESETS.map((pr) => (
            <button
              key={pr.id}
              role="listitem"
              className="chip"
              data-active={editor.presetId === pr.id || undefined}
              onClick={() => editor.replace(presetParams(pr), pr.id)}
              title={`${pr.group} · ${pr.name}`}
            >
              {pr.name}
            </button>
          ))}
        </div>

        <footer className="plug-foot">
          <Segmented label="Output" value={activeMode} onChange={setMode} options={modes} />
          <div className="foot-row">
            <span className="out-hint" data-warn={!!blocked || undefined} title={blocked ?? hint}>{blocked ?? hint}</span>
            {activeMode !== 'vector' && (
              <div className="scale-seg">
                <Segmented label="Scale" value={scale} onChange={setScale} options={[{ value: 1, label: '1×' }, { value: 2, label: '2×' }]} />
              </div>
            )}
            <button className="btn btn-primary apply-btn" disabled={!ready || busy || !!blocked} onClick={apply}>
              {busy ? 'Applying…' : 'Apply'}
            </button>
          </div>
        </footer>
      </main>
      <Inspector editor={editor} />
    </div>
  );
}
