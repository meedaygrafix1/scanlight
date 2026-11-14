import { useEffect, useState } from 'react';
import { ImagePlus } from './icons';
import { k } from './keys';
import type { Editor } from '../state/store';
import { PRESETS, presetParams } from '../state/presets';
import type { Source } from '../engine/load';
import type { Pipeline } from '../engine/pipeline';

interface Props {
  editor: Editor;
  source: Source;
  getOffscreen: () => Pipeline | null;
  onReplace: () => void;
}

const THUMB_W = 240;

export function PresetsPanel({ editor, source, getOffscreen, onReplace }: Props) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setThumbs({});
    (async () => {
      const pl = getOffscreen();
      if (!pl) return;
      pl.setSource(source);
      const tw = THUMB_W;
      const th = Math.round((source.height / source.width) * THUMB_W);
      for (const preset of PRESETS) {
        while (pl.busy && !cancelled) await new Promise((r) => setTimeout(r, 150));
        if (cancelled) return;
        const p0 = presetParams(preset);
        // Soften motion so animated presets read clearly as still thumbnails
        const p = { ...p0, intensity: p0.intensity * 0.35 };
        await pl.ready(p, tw, th);
        pl.render(p, 0.3, tw, th);
        const url = pl.r.canvas.toDataURL('image/jpeg', 0.85);
        if (cancelled) return;
        setThumbs((t) => ({ ...t, [preset.id]: url }));
        await new Promise((r) => setTimeout(r, 0)); // keep the UI responsive
      }
    })();
    return () => { cancelled = true; };
  }, [source, getOffscreen]);

  const groups = Array.from(new Set(PRESETS.map((p) => p.group)));

  return (
    <aside className="presets" aria-label="Presets">
      <div className="source-card">
        <img src={source.url} alt="" />
        <div className="source-meta">
          <span className="source-name" title={source.name}>{source.name}</span>
          <span className="source-dim mono">{source.width} × {source.height}</span>
        </div>
        <button className="icon-btn" onClick={onReplace} title={k('Replace image (⌘O)')} aria-label="Replace image">
          <ImagePlus size={19} />
        </button>
      </div>
      <div className="presets-scroll">
        {groups.map((g) => (
          <div key={g} className="preset-group">
            <div className="panel-title">{g}</div>
            <div className="preset-grid">
              {PRESETS.filter((p) => p.group === g).map((preset, i) => (
                <button
                  key={preset.id}
                  className="preset"
                  data-active={editor.presetId === preset.id || undefined}
                  onClick={() => editor.replace(presetParams(preset), preset.id)}
                  style={{ ['--i' as string]: i }}
                >
                  <div className="preset-thumb">
                    {thumbs[preset.id] ? <img src={thumbs[preset.id]} alt="" /> : <div className="shimmer" />}
                  </div>
                  <span className="preset-name">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
