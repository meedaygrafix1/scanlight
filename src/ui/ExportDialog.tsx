import { useEffect, useMemo, useRef, useState } from 'react';
import { Close, Image as ImageIcon, Film, PenTool, Code, CircleCheck, Copy, Download, Loader } from './icons';
import type { Params } from '../state/types';
import type { Source } from '../engine/load';
import type { Pipeline } from '../engine/pipeline';
import { buildSvg, canEncodeMp4, canvasBlob, download, renderVideo, saveToDevice, SVG_EFFECTS } from '../engine/export';
import { gridSize } from '../engine/sample';
import { Segmented } from './controls';
import { k, COARSE } from './keys';

type Tab = 'image' | 'video' | 'svg' | 'embed';

interface Props {
  open: boolean;
  onClose: () => void;
  params: Params;
  source: Source;
  getOffscreen: () => Pipeline | null;
  phaseRef: React.MutableRefObject<number>;
  toast: (msg: string) => void;
  onEnableMotion: () => void;
  onBusyChange: (busy: boolean) => void;
}

export function ExportDialog({ open, onClose, params, source, getOffscreen, phaseRef, toast, onEnableMotion, onBusyChange }: Props) {
  const [tab, setTab] = useState<Tab>(params.anim !== 'none' ? 'video' : 'image');
  const [imgFormat, setImgFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [scale, setScale] = useState(1);
  const [vidFormat, setVidFormat] = useState<'mp4' | 'webm'>(canEncodeMp4() ? 'mp4' : 'webm');
  const [vidSize, setVidSize] = useState<number>(COARSE ? 1280 : 1920);
  const [fps, setFps] = useState(30);
  const [loops, setLoops] = useState(2);
  const [progress, setProgress] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  // On phones a finished file waits for one more tap, because the share sheet needs a fresh gesture
  const [ready, setReady] = useState<{ blob: Blob; name: string; msg: string } | null>(null);
  const finish = (blob: Blob, name: string, msg: string) => {
    if (COARSE) { setReady({ blob, name, msg }); return; }
    download(blob, name);
    toast(msg);
    onClose();
  };
  const abortRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => onBusyChange(progress !== null), [progress !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = `${source.name || 'scanlight'}-${params.effect}`;

  useEffect(() => {
    if (!open) return;
    setTab(params.anim !== 'none' ? 'video' : 'image');
    setReady(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && progress === null) onClose(); };
    window.addEventListener('keydown', onKey);
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input, select');
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', trap);
    const restore = () => { window.removeEventListener('keydown', trap); opener?.focus?.(); };
    return () => { window.removeEventListener('keydown', onKey); restore(); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const max = Math.min(getOffscreen()?.r.maxSize ?? 8192, COARSE ? 4096 : 8192);
  const imgDims = useMemo(() => {
    const k = Math.min(scale, max / Math.max(source.width, source.height));
    return { w: Math.round(source.width * k), h: Math.round(source.height * k) };
  }, [scale, source, max]);

  const vidDims = useMemo(() => {
    const long = vidSize === 0 ? Math.max(source.width, source.height) : vidSize;
    const k = Math.min(long, 3840) / Math.max(source.width, source.height);
    const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
    return { w: even(source.width * k), h: even(source.height * k) };
  }, [vidSize, source]);

  const svgOk = (SVG_EFFECTS as readonly string[]).includes(params.effect);
  const svgCount = useMemo(() => {
    const g = gridSize(params, source.width, source.height);
    return params.effect === 'ascii' ? Math.round(g.cols * (g.rowsExact / 1.45)) : params.effect === 'halftone' ? Math.round(g.cols * g.rowsExact * 1.4) : g.cols * g.rows;
  }, [params, source]);

  const exportImage = async () => {
    const pl = getOffscreen();
    if (!pl) return;
    setProgress(0.5);
    try {
      await pl.ready(params, imgDims.w, imgDims.h);
      pl.render(params, params.anim !== 'none' ? phaseRef.current : 0, imgDims.w, imgDims.h);
      const blob = await canvasBlob(pl.r.canvas, `image/${imgFormat}`, 0.95);
      finish(blob, `${base}@${scale}x.${imgFormat === 'jpeg' ? 'jpg' : imgFormat}`, `Exported ${imgDims.w} × ${imgDims.h} ${imgFormat.toUpperCase()}`);
    } catch (e) {
      toast(`Export failed: ${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  const exportVideo = async () => {
    const pl = getOffscreen();
    if (!pl) return;
    pl.busy = true;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setProgress(0);
    try {
      await pl.ready(params, vidDims.w, vidDims.h);
      const blob = await renderVideo(pl.r, params, {
        width: vidDims.w, height: vidDims.h, fps, loops, format: vidFormat,
        onProgress: setProgress, signal: ctrl.signal,
      });
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      finish(blob, `${base}-loop.${ext}`, `Exported ${(blob.size / 1e6).toFixed(1)} MB ${ext.toUpperCase()}`);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast(`Video export failed: ${(e as Error).message}`);
    } finally {
      setProgress(null);
      abortRef.current = null;
      pl.busy = false;
    }
  };

  const exportSvg = () => {
    const pl = getOffscreen();
    if (!pl) return;
    const svg = buildSvg(params, source.canvas, source.width, source.height);
    finish(new Blob([svg], { type: 'image/svg+xml' }), `${base}.svg`, `Exported SVG · ${(svg.length / 1e6).toFixed(1)} MB`);
  };

  const animated = params.anim !== 'none';
  const snippet = animated
    ? `<div class="dither-bg">
  <video src="/${base}-loop.mp4" autoplay muted loop playsinline></video>
</div>

<style>
.dither-bg { position: absolute; inset: 0; overflow: hidden; background: ${params.bg}; }
.dither-bg video { width: 100%; height: 100%; object-fit: cover; }
</style>`
    : `.dither-bg {
  background: ${params.bg} url("/${base}@2x.png") center / cover no-repeat;
}`;

  if (!open) return null;
  const busy = progress !== null;

  const tabs: { id: Tab; label: string; icon: typeof ImageIcon }[] = [
    { id: 'image', label: 'Image', icon: ImageIcon },
    { id: 'video', label: 'Video', icon: Film },
    { id: 'svg', label: 'SVG', icon: PenTool },
    { id: 'embed', label: 'Embed', icon: Code },
  ];

  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Export" ref={dialogRef} tabIndex={-1}>
        <header className="modal-head">
          <h2>Export</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close"><Close /></button>
        </header>
        <nav className="tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className="tab" data-active={tab === t.id || undefined} onClick={() => { if (!busy) { setTab(t.id); setReady(null); } }}>
              <t.icon size={19} /> {t.label}
            </button>
          ))}
        </nav>

        <div className="modal-body">
          {tab === 'image' && (
            <>
              <Field label="Format">
                <Segmented label="Format" value={imgFormat} onChange={setImgFormat} options={[{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPG' }, { value: 'webp', label: 'WEBP' }]} />
              </Field>
              <Field label="Scale">
                <Segmented label="Scale" value={scale} onChange={setScale} options={[{ value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 3, label: '3×' }, { value: 4, label: '4×' }]} />
              </Field>
              <Summary items={[['Size', `${imgDims.w} × ${imgDims.h}`], ['Frame', animated ? `The frame on screen, at ${(phaseRef.current * params.loopSeconds).toFixed(1)}s. Pause and scrub to choose.` : 'Still']]} />
            </>
          )}

          {tab === 'video' && (animated ? (
            <>
              <Field label="Format">
                <Segmented label="Format" value={vidFormat} onChange={setVidFormat} options={[{ value: 'mp4', label: canEncodeMp4() ? 'MP4' : 'MP4 (n/a)' }, { value: 'webm', label: 'WEBM' }]} />
              </Field>
              <Field label="Long edge">
                <Segmented label="Resolution" value={vidSize} onChange={setVidSize} options={[{ value: 1280, label: '1280' }, { value: 1920, label: '1920' }, { value: 3840, label: '3840' }, { value: 0, label: 'Source' }]} />
              </Field>
              <Field label="Frame rate">
                <Segmented label="Frame rate" value={fps} onChange={setFps} options={[{ value: 24, label: '24' }, { value: 30, label: '30' }, { value: 60, label: '60' }]} />
              </Field>
              <Field label="Loops">
                <Segmented label="Loops" value={loops} onChange={setLoops} options={[{ value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 4, label: '4×' }]} />
              </Field>
              <Summary items={[
                ['Size', `${vidDims.w} × ${vidDims.h}`],
                ['Duration', `${(params.loopSeconds * loops).toFixed(1)}s · ${Math.round(params.loopSeconds * loops * fps)} frames`],
                ['Encoder', vidFormat === 'mp4' && canEncodeMp4() ? 'H.264, frame-exact' : 'Real-time capture'],
              ]} />
            </>
          ) : (
            <div className="notice">
              <Film />
              <div>
                <strong>This design is still.</strong>
                <p>Add motion to export a seamless video loop.</p>
              </div>
              <button className="btn btn-secondary" onClick={onEnableMotion}>Add motion</button>
            </div>
          ))}

          {tab === 'svg' && (svgOk ? (
            <>
              <p className="modal-copy">True vectors — every dot is an editable shape. Opens in Figma, Illustrator and the browser.</p>
              <Summary items={[
                ['Elements', `~${svgCount.toLocaleString()}`],
                ['Glow', params.glow > 0.01 && params.effect !== 'bayer' && params.effect !== 'diffusion' ? 'SVG blur filter' : 'None'],
                ['Not included', 'Scanlines, grain, curvature, motion'],
              ]} />
              {svgCount > 40000 && <p className="warn">Large file. Lower the density for a lighter SVG.</p>}
            </>
          ) : (
            <div className="notice">
              <PenTool />
              <div>
                <strong>No vector version for CRT.</strong>
                <p>SVG works with LED, Halftone, Ordered, Diffusion and ASCII.</p>
              </div>
            </div>
          ))}

          {tab === 'embed' && (
            <>
              <p className="modal-copy">{animated ? 'Drop the exported loop into your page as a background.' : 'Use the exported image as a CSS background.'}</p>
              <div className="code">
                <pre className="mono">{snippet}</pre>
                <button
                  className="icon-btn code-copy"
                  aria-label="Copy snippet"
                  onClick={async () => {
                    await navigator.clipboard.writeText(snippet);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1400);
                  }}
                >
                  {copied ? <CircleCheck size={19} /> : <Copy size={19} />}
                </button>
              </div>
            </>
          )}
        </div>

        <footer className="modal-foot">
          {busy && tab === 'video' ? (
            <>
              <div className="progress" aria-label="Export progress"><div className="progress-bar" style={{ transform: `scaleX(${progress})` }} /></div>
              <span className="mono progress-label">{Math.round((progress ?? 0) * 100)}%</span>
              <button className="btn btn-secondary" onClick={() => abortRef.current?.abort()}>Cancel</button>
            </>
          ) : (
            <>
              <span className="foot-hint">{k('⌘E')} opens export</span>
              {ready && (
                <button
                  className="btn btn-primary"
                  onClick={async () => { await saveToDevice(ready.blob, ready.name); toast(ready.msg); setReady(null); onClose(); }}
                >
                  <Download size={19} /> Save {(ready.blob.size / 1e6).toFixed(1)} MB file
                </button>
              )}
              {!ready && tab === 'image' && <ExportBtn busy={busy} onClick={exportImage}>Export {imgFormat.toUpperCase()}</ExportBtn>}
              {!ready && tab === 'video' && animated && <ExportBtn busy={busy} onClick={exportVideo}>Export {vidFormat.toUpperCase()}</ExportBtn>}
              {!ready && tab === 'svg' && svgOk && <ExportBtn busy={busy} onClick={exportSvg}>Export SVG</ExportBtn>}
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field"><span className="field-label">{label}</span>{children}</div>;
}

function Summary({ items }: { items: [string, string][] }) {
  return (
    <dl className="summary">
      {items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="mono">{v}</dd></div>)}
    </dl>
  );
}

function ExportBtn({ busy, onClick, children }: { busy: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className="btn btn-primary" onClick={onClick} disabled={busy}>
      {busy ? <Loader size={19} className="spin" /> : <Download size={19} />} {children}
    </button>
  );
}
