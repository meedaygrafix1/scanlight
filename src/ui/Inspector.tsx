import { Circle, Square, Diamond, Grid, Newspaper, Binary, Waves, Type, CrtMonitor } from './icons';
import type { Editor } from '../state/store';
import type { AnimId, EffectId, Params } from '../state/types';
import { CHARSETS, DEFAULTS, EFFECTS, PALETTES, PRESETS, presetParams } from '../state/presets';
import { Reset } from './icons';

/** A good starting density for each effect, applied when you switch effect. */
const EFFECT_COLUMNS: Record<EffectId, number> = { led: 90, halftone: 80, bayer: 200, diffusion: 240, ascii: 100, crt: 200 };

const HINTS: Partial<Record<keyof Params, string>> = {
  columns: 'How many dots, pixels or characters fit across the image. Higher is finer.',
  dot: 'Size of each mark inside its cell.',
  angle: 'Rotation of the dot grid.',
  levels: 'Number of tones. 2 gives a pure two-colour dither.',
  gap: 'Space between pixels.',
  ambient: 'How visible the unlit parts of the grid are.',
  brightness: 'Lightens or darkens the image before the effect.',
  contrast: 'Pushes lights and darks apart. Raise it if the result looks muddy.',
  gamma: 'Shifts the midtones without clipping black or white.',
  blackPoint: 'Everything darker than this becomes fully off. Raise it to clean up a noisy background.',
  glow: 'Bloom around bright areas.',
  glowRadius: 'How far the glow spreads.',
  scanlines: 'Fine horizontal lines, like an old screen.',
  noise: 'Film-style grain. It moves when motion is on.',
  vignette: 'Darkens the corners.',
  aberration: 'Splits colours slightly at the edges.',
  curvature: 'Bends the image like a curved tube screen.',
  intensity: 'How strong the motion is.',
  cycles: 'How many times the motion repeats in one loop.',
  loopSeconds: 'Length of one loop. Exports repeat seamlessly.',
};
import { ColorField, radioKeys, Section, Segmented, Select, Slider, Toggle } from './controls';

const EFFECT_ICONS: Record<EffectId, typeof Circle> = {
  led: Grid, halftone: Newspaper, bayer: Binary, diffusion: Waves, ascii: Type, crt: CrtMonitor,
};

const ANIMS: { value: AnimId; label: string }[] = [
  { value: 'none', label: 'Still' },
  { value: 'flicker', label: 'Flicker' },
  { value: 'scan', label: 'Scan' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'wave', label: 'Wave' },
  { value: 'rain', label: 'Rain' },
  { value: 'glitch', label: 'Glitch' },
];

export function Inspector({ editor }: { editor: Editor }) {
  const { params: p, set, live, begin } = editor;
  const preset = PRESETS.find((x) => x.id === editor.presetId);
  const base = preset ? presetParams(preset) : DEFAULTS;
  const dirty = (Object.keys(base) as (keyof Params)[]).some((key) => base[key] !== p[key]);
  const s = <K extends keyof Params>(key: K, label: string, min: number, max: number, step = 0.01, format?: (v: number) => string) => (
    <Slider
      label={label}
      value={p[key] as number}
      min={min}
      max={max}
      step={step}
      format={format}
      hint={HINTS[key]}
      defaultValue={base[key] as number}
      onBegin={begin}
      onChange={(v) => live({ [key]: v } as Partial<Params>)}
    />
  );
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const hasShape = p.effect === 'led' || p.effect === 'halftone';
  const isBlock = p.effect === 'bayer' || p.effect === 'diffusion';

  return (
    <aside className="inspector" aria-label="Properties">
      <div className="inspector-head">
        <span className="inspector-title">
          {preset ? preset.name : 'Custom'}
          {dirty && <span className="edited">edited</span>}
        </span>
        <button className="text-btn" disabled={!dirty} onClick={() => editor.replace(base, editor.presetId)} title="Put every setting back to this preset">
          <Reset /> Reset
        </button>
      </div>
      <Section title="Effect" id="effect">
        <div className="effect-grid" role="radiogroup" aria-label="Effect" onKeyDown={radioKeys}>
          {EFFECTS.map((e) => {
            const Icon = EFFECT_ICONS[e.id];
            return (
              <button
                key={e.id}
                className="effect-tile"
                role="radio"
                aria-checked={p.effect === e.id}
                tabIndex={p.effect === e.id ? 0 : -1}
                data-active={p.effect === e.id || undefined}
                onClick={() => { if (p.effect !== e.id) set({ effect: e.id, columns: EFFECT_COLUMNS[e.id] }); }}
                title={e.hint}
              >
                <Icon size={16} />
                <span>{e.name}</span>
              </button>
            );
          })}
        </div>
        {s('columns', p.effect === 'crt' ? 'Lines' : 'Density', 12, p.effect === 'crt' ? 600 : 400, 1)}
        {(hasShape || p.effect === 'crt') && s('dot', p.effect === 'crt' ? 'Beam' : 'Dot size', 0.1, 1, 0.01, pct)}
        {hasShape && (
          <Segmented
            label="Shape"
            value={p.shape}
            onChange={(v) => set({ shape: v })}
            options={[
              { value: 'circle', label: <Circle />, title: 'Circle' },
              { value: 'square', label: <Square />, title: 'Square' },
              { value: 'diamond', label: <Diamond />, title: 'Diamond' },
            ]}
          />
        )}
        {p.effect === 'halftone' && s('angle', 'Angle', 0, 90, 1, (v) => `${v}°`)}
        {isBlock && s('levels', 'Levels', 2, 8, 1)}
        {isBlock && s('gap', 'Pixel gap', 0, 0.6, 0.01, pct)}
        {p.effect === 'bayer' && (
          <Segmented
            label="Matrix"
            value={p.matrix}
            onChange={(v) => set({ matrix: v })}
            options={[{ value: 2, label: '2×2' }, { value: 4, label: '4×4' }, { value: 8, label: '8×8' }]}
          />
        )}
        {p.effect === 'ascii' && (
          <>
            <Select
              label="Charset"
              value={CHARSETS.find((c) => c.value === p.charset)?.value ?? 'custom'}
              onChange={(v) => v !== 'custom' && set({ charset: v })}
              options={[...CHARSETS.map((c) => ({ value: c.value, label: c.label })), { value: 'custom', label: 'Custom' }]}
            />
            <input
              className="text-input mono"
              value={p.charset}
              onFocus={begin}
              onChange={(e) => live({ charset: e.target.value })}
              aria-label="Characters, darkest to brightest"
              placeholder="Characters, dark → bright"
              spellCheck={false}
            />
            <Segmented
              label="Glyph mapping"
              value={p.glyphMode}
              onChange={(v) => set({ glyphMode: v })}
              options={[{ value: 'luma', label: 'By brightness' }, { value: 'random', label: 'Random' }]}
            />
          </>
        )}
        {p.effect === 'led' && s('ambient', 'Unlit dots', 0, 1, 0.01, pct)}
        {p.effect === 'ascii' && s('ambient', 'Ghost glyphs', 0, 1, 0.01, pct)}
      </Section>

      <Section title="Adjust" id="adjust">
        {s('brightness', 'Brightness', -0.5, 0.5, 0.01)}
        {s('contrast', 'Contrast', 0.2, 3, 0.01)}
        {s('gamma', 'Gamma', 0.3, 2.5, 0.01)}
        {s('blackPoint', 'Black point', 0, 0.8, 0.01, pct)}
        <Toggle label="Invert" checked={p.invert} onChange={(v) => set({ invert: v })} />
      </Section>

      <Section title="Color" id="color">
        <Segmented
          label="Color mode"
          value={p.colorMode}
          onChange={(v) => set({ colorMode: v })}
          options={[{ value: 'palette', label: 'Palette' }, { value: 'source', label: 'Original' }]}
        />
        <div className="palette-row" role="list" aria-label="Palettes">
          {PALETTES.map((pl) => {
            const active = pl.bg === p.bg && pl.mid === p.mid && pl.high === p.high;
            return (
              <button
                key={pl.name}
                role="listitem"
                className="palette-chip"
                data-active={active || undefined}
                title={pl.name}
                aria-label={`${pl.name} palette`}
                onClick={() => set({ bg: pl.bg, mid: pl.mid, high: pl.high })}
                style={{ background: `linear-gradient(135deg, ${pl.bg} 0 34%, ${pl.mid} 34% 67%, ${pl.high} 67%)` }}
              />
            );
          })}
        </div>
        <ColorField label="Background" value={p.bg} onBegin={begin} onChange={(v) => live({ bg: v })} />
        {p.colorMode === 'palette' ? (
          <>
            <ColorField label="Midtone" value={p.mid} onBegin={begin} onChange={(v) => live({ mid: v })} />
            <ColorField label="Highlight" value={p.high} onBegin={begin} onChange={(v) => live({ high: v })} />
          </>
        ) : (
          <p className="hint">Using the image's own colours. Only the background is yours to set.</p>
        )}
      </Section>

      <Section title="Glow & Screen" id="screen">
        {s('glow', 'Glow', 0, 2, 0.01)}
        {s('glowRadius', 'Glow radius', 0, 1, 0.01, pct)}
        {s('scanlines', 'Scanlines', 0, 1, 0.01, pct)}
        {s('noise', 'Grain', 0, 1, 0.01, pct)}
        {s('vignette', 'Vignette', 0, 1, 0.01, pct)}
        {s('aberration', 'Aberration', 0, 1, 0.01, pct)}
        {s('curvature', 'Curvature', 0, 1, 0.01, pct)}
      </Section>

      <Section title="Motion" id="motion">
        <div className="chip-row" role="radiogroup" aria-label="Animation" onKeyDown={radioKeys}>
          {ANIMS.map((a) => (
            <button
              key={a.value}
              role="radio"
              aria-checked={p.anim === a.value}
              tabIndex={p.anim === a.value ? 0 : -1}
              className="chip"
              data-active={p.anim === a.value || undefined}
              onClick={() => set({ anim: a.value })}
            >
              {a.label}
            </button>
          ))}
        </div>
        {p.anim !== 'none' && (
          <>
            {s('intensity', 'Intensity', 0, 1, 0.01, pct)}
            {s('cycles', 'Speed', 1, 6, 1, (v) => `${v}× / loop`)}
            {s('loopSeconds', 'Loop length', 1, 12, 0.5, (v) => `${v}s`)}
            <p className="hint">Loops are seamless — speed is whole cycles per loop.</p>
          </>
        )}
      </Section>
    </aside>
  );
}
