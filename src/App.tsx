import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor } from './state/store';
import { loadImage, type Source } from './engine/load';
import { Pipeline } from './engine/pipeline';
import { TopBar, ShortcutsSheet } from './ui/TopBar';
import { PresetsPanel } from './ui/PresetsPanel';
import { Inspector } from './ui/Inspector';
import { Viewport } from './ui/Viewport';
import { EmptyState } from './ui/EmptyState';
import { ExportDialog } from './ui/ExportDialog';
import { loadSample } from './ui/samples';
import { LayoutDashboard, Grid, Sliders, Palette, Monitor, Activity } from './ui/icons';

const M_TABS = [
  { id: 'presets', label: 'Presets', icon: LayoutDashboard },
  { id: 'effect', label: 'Effect', icon: Grid },
  { id: 'adjust', label: 'Adjust', icon: Sliders },
  { id: 'color', label: 'Color', icon: Palette },
  { id: 'screen', label: 'Screen', icon: Monitor },
  { id: 'motion', label: 'Motion', icon: Activity },
] as const;

export default function App() {
  const editor = useEditor();
  const [source, setSource] = useState<Source | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [compare, setCompare] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [mtab, setMtab] = useState<(typeof M_TABS)[number]['id']>('presets');
  const [shortcuts, setShortcuts] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pipelineRef = useRef<Pipeline | null>(null);
  /** Current position in the loop (0..1), shared so exports can capture the frame on screen. */
  const phaseRef = useRef(0);
  const offscreenRef = useRef<Pipeline | null>(null);

  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  /** Shared hidden renderer for thumbnails and exports. */
  const getOffscreen = useCallback(() => {
    if (!offscreenRef.current) {
      try {
        offscreenRef.current = new Pipeline(document.createElement('canvas'), true);
      } catch (e) {
        setFatal((e as Error).message);
        return null;
      }
    }
    if (source && offscreenRef.current.source !== source) offscreenRef.current.setSource(source);
    return offscreenRef.current;
  }, [source]);

  const openFile = useCallback(async (file: Blob, name?: string) => {
    if (!file.type.startsWith('image/')) { toast('That file isn’t an image.'); return; }
    setBusy(true);
    try {
      const s = await loadImage(file, name ?? (file as File).name ?? 'pasted-image');
      setSource((old) => { if (old) URL.revokeObjectURL(old.url); return s; });
      setCompare(false);
    } catch {
      toast('Couldn’t read that image. Try PNG, JPG or WEBP.');
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const openSample = useCallback(async (id: string) => {
    setBusy(true);
    try {
      const s = await loadSample(id);
      setSource((old) => { if (old) URL.revokeObjectURL(old.url); return s; });
      setCompare(false);
    } catch {
      toast('Couldn’t load that sample.');
    } finally { setBusy(false); }
  }, [toast]);

  /* Paste, drag & drop */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      const f = item?.getAsFile();
      if (f) { e.preventDefault(); openFile(f, 'pasted-image'); }
    };
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; setDragOver(true); };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragOver(false); };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) openFile(f);
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [openFile]);

  /* Global shortcuts (instant, never animated) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]')) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'o') { e.preventDefault(); fileInput.current?.click(); return; }
      if (!source) return;
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? editor.redo() : editor.undo(); }
      else if (mod && k === 'y') { e.preventDefault(); editor.redo(); }
      else if (mod && k === 'e') { e.preventDefault(); setExportOpen(true); }
      else if (!mod && e.key === '\\') setCompare((c) => !c);
      else if (!mod && k === 'k') setPlaying((v) => !v);
      else if (!mod && e.key === '?') setShortcuts((v) => !v);
      else if (e.key === 'Escape') setShortcuts(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [source, editor]);

  const animated = editor.params.anim !== 'none';

  if (fatal) {
    return (
      <div className="fatal">
        <h1>Your browser can’t run Scanlight</h1>
        <p>{fatal} Try a recent version of Chrome, Edge, Firefox or Safari.</p>
      </div>
    );
  }

  return (
    <div className="app" data-has-image={!!source || undefined}>
      <TopBar
        hasImage={!!source}
        onHome={() => {
          setExportOpen(false);
          setCompare(false);
          setSource((old) => { if (old) URL.revokeObjectURL(old.url); return null; });
        }}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        onUndo={editor.undo}
        onRedo={editor.redo}
        compare={compare}
        onCompare={() => setCompare((c) => !c)}
        animated={animated}
        playing={playing}
        onTogglePlay={() => setPlaying((v) => !v)}
        onExport={() => setExportOpen(true)}
        onShortcuts={() => setShortcuts(true)}
        onReplace={() => fileInput.current?.click()}
      />

      {source ? (
        <main className="workspace" data-mtab={mtab}>
          <PresetsPanel editor={editor} source={source} getOffscreen={getOffscreen} onReplace={() => fileInput.current?.click()} />
          <Viewport
            source={source}
            params={editor.params}
            playing={playing && !exporting}
            onTogglePlay={() => setPlaying((v) => !v)}
            compare={compare}
            onError={setFatal}
            pipelineRef={pipelineRef}
            phaseRef={phaseRef}
          />
          <Inspector editor={editor} />
          <nav className="m-tabs" aria-label="Panels">
            {M_TABS.map((t) => (
              <button key={t.id} className="m-tab" data-active={mtab === t.id || undefined} aria-pressed={mtab === t.id} onClick={() => setMtab(t.id)}>
                <t.icon />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        </main>
      ) : (
        <EmptyState onPick={() => fileInput.current?.click()} onSample={openSample} busy={busy} dragOver={dragOver} />
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = ''; }}
      />

      <div className="drop-overlay" data-show={(dragOver && !!source) || undefined} aria-hidden>
        <div className="drop-overlay-inner">Drop to replace image</div>
      </div>

      {source && (
        <ExportDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          params={editor.params}
          source={source}
          getOffscreen={getOffscreen}
          phaseRef={phaseRef}
          toast={toast}
          onEnableMotion={() => { editor.set({ anim: 'scan' }); setPlaying(true); }}
          onBusyChange={setExporting}
        />
      )}
      {shortcuts && <ShortcutsSheet onClose={() => setShortcuts(false)} />}

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className="toast">{t.msg}</div>)}
      </div>
    </div>
  );
}
