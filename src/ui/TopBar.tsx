import { k } from './keys';
import { Undo, Redo, SplitView, Play, Pause, Download, Keyboard, ImagePlus } from './icons';

interface Props {
  hasImage: boolean;
  onHome: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  compare: boolean;
  onCompare: () => void;
  animated: boolean;
  playing: boolean;
  onTogglePlay: () => void;
  onExport: () => void;
  onShortcuts: () => void;
  onReplace: () => void;
}

export function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      {[0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => {
        const center = x === 1 && y === 1;
        const dim = (x + y) % 4 === 0 && !center;
        return <circle key={`${x}${y}`} cx={4 + x * 6} cy={4 + y * 6} r={2.2} fill={center ? '#fff' : 'var(--accent)'} opacity={dim ? 0.35 : 1} />;
      }))}
    </svg>
  );
}

export function TopBar(p: Props) {
  return (
    <header className="topbar">
      {p.hasImage ? (
        <button className="brand brand-btn" onClick={p.onHome} title="Back to the start page. Your settings are kept." aria-label="Scanlight, back to start">
          <Logo />
          <span className="brand-name">Scanlight</span>
          <span className="brand-tag">beta</span>
        </button>
      ) : (
        <div className="brand">
          <Logo />
          <span className="brand-name">Scanlight</span>
          <span className="brand-tag">beta</span>
        </div>
      )}

      {p.hasImage && (
        <div className="topbar-actions">
          {/* Phones only: a labelled button, because an icon alone is easy to miss */}
          <button className="btn btn-secondary new-btn show-sm" onClick={p.onReplace}>
            <ImagePlus size={19} /> <span>New<span className="new-long"> image</span></span>
          </button>
          <div className="btn-group">
            <button className="icon-btn" onClick={p.onUndo} disabled={!p.canUndo} title={k('Undo (⌘Z)')} aria-label="Undo"><Undo /></button>
            <button className="icon-btn" onClick={p.onRedo} disabled={!p.canRedo} title={k('Redo (⇧⌘Z)')} aria-label="Redo"><Redo /></button>
          </div>
          <div className="topbar-sep" />
          <button className="icon-btn" data-active={p.compare || undefined} onClick={p.onCompare} title="Compare with original (\)" aria-label="Compare" aria-pressed={p.compare}>
            <SplitView />
          </button>
          {p.animated && (
            <button className="icon-btn hide-sm" onClick={p.onTogglePlay} title={p.playing ? 'Pause (K)' : 'Play (K)'} aria-label={p.playing ? 'Pause' : 'Play'}>
              {p.playing ? <Pause /> : <Play />}
            </button>
          )}
          <button className="icon-btn hide-sm" onClick={p.onShortcuts} title="Shortcuts (?)" aria-label="Keyboard shortcuts"><Keyboard /></button>
          <button className="btn btn-primary" onClick={p.onExport}>
            <Download size={19} /> Export
          </button>
        </div>
      )}
    </header>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Open image', '⌘ O'],
  ['Paste image', '⌘ V'],
  ['Export', '⌘ E'],
  ['Undo / Redo', '⌘ Z  ·  ⇧ ⌘ Z'],
  ['Compare original', '\\'],
  ['Play / Pause', 'K'],
  ['Pan', 'Space + drag · scroll'],
  ['Zoom', '⌘ scroll · = / −'],
  ['Fit / 100%', '⇧ 1  ·  ⌘ 1'],
  ['Fine-tune slider', 'Shift + drag'],
  ['Reset slider', 'Double-click'],
];

export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <header className="modal-head"><h2>Shortcuts</h2></header>
        <dl className="shortcuts">
          {SHORTCUTS.map(([name, keys]) => <div key={name}><dt>{name}</dt><dd className="mono">{k(keys)}</dd></div>)}
        </dl>
      </div>
    </div>
  );
}
