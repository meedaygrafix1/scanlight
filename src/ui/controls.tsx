import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from './icons';
import { normalizeHex } from '../engine/color';

/* ---------- Scrub slider (Figma-style: drag anywhere, shift = fine, dbl-click = reset) ---------- */

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  format?: (v: number) => string;
  /** Plain-language explanation, shown as a tooltip. */
  hint?: string;
  onBegin: () => void;
  onChange: (v: number) => void;
}

export function Slider({ label, value, min, max, step = 0.01, defaultValue, format, hint, onBegin, onChange }: SliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const snap = (v: number) => {
    const s = Math.round(v / step) * step;
    return +Math.min(max, Math.max(min, s)).toFixed(4);
  };
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const text = format ? format(value) : value.toFixed(decimals);

  const fromPointer = (clientX: number, fine: boolean, startX: number, startV: number) => {
    const el = ref.current!;
    const rect = el.getBoundingClientRect();
    if (fine) return snap(startV + ((clientX - startX) / rect.width) * (max - min) * 0.1);
    return snap(min + ((clientX - rect.left) / rect.width) * (max - min));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (editing || e.button !== 0) return;
    const el = ref.current!;
    // Touch: the panel must still scroll vertically, so a drag only begins once the
    // finger has clearly moved sideways, and it moves the value relatively (no jump).
    const touch = e.pointerType === 'touch';
    const startY = e.clientY;
    let active = false;
    let startX = e.clientX, startV = value, fine = e.shiftKey;
    const activate = (id: number) => {
      active = true;
      try { el.setPointerCapture(id); } catch { /* pointer already gone */ }
      setDragging(true);
      onBegin();
    };
    if (!touch) {
      activate(e.pointerId);
      if (!fine) onChange(fromPointer(e.clientX, false, startX, startV));
    }
    const move = (ev: PointerEvent) => {
      if (!active) {
        const dx = Math.abs(ev.clientX - startX), dy = Math.abs(ev.clientY - startY);
        if (dx > 6 && dx > dy) { activate(ev.pointerId); startX = ev.clientX; }
        else return;
      }
      if (touch) {
        const width = el.getBoundingClientRect().width;
        onChange(snap(startV + ((ev.clientX - startX) / width) * (max - min)));
        return;
      }
      if (ev.shiftKey !== fine) {
        fine = ev.shiftKey;
        startX = ev.clientX;
        startV = Number(el.dataset.v);
      }
      onChange(fromPointer(ev.clientX, fine, startX, startV));
    };
    const up = () => {
      setDragging(false);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    const mult = e.shiftKey ? 10 : 1;
    if (k === 'ArrowRight' || k === 'ArrowUp') { e.preventDefault(); onBegin(); onChange(snap(value + step * mult)); }
    if (k === 'ArrowLeft' || k === 'ArrowDown') { e.preventDefault(); onBegin(); onChange(snap(value - step * mult)); }
    if (k === 'Enter') setEditing(true);
  };

  return (
    <div
      ref={ref}
      className="slider"
      data-dragging={dragging || undefined}
      data-v={value}
      title={hint}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => {
        if (defaultValue !== undefined) { onBegin(); onChange(defaultValue); }
      }}
    >
      <div className="slider-fill" style={{ transform: `scaleX(${t})` }} />
      <span className="slider-label">{label}</span>
      {editing ? (
        <input
          className="slider-input"
          autoFocus
          inputMode="decimal"
          onFocus={(e) => e.target.select()}
          defaultValue={value}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) { onBegin(); onChange(snap(v)); } setEditing(false); }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span
          className="slider-value"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          onDoubleClick={(e) => e.stopPropagation()}
          title="Click to type a value"
        >
          {text}
        </span>
      )}
    </div>
  );
}

/* ---------- Arrow-key navigation for radio groups ---------- */

/** Standard radio-group behaviour: arrows move and select, Home/End jump to the ends. */
export function radioKeys(e: React.KeyboardEvent<HTMLElement>) {
  const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
  if (!delta && e.key !== 'Home' && e.key !== 'End') return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'));
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  if (at < 0) return;
  e.preventDefault();
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (at + delta + items.length) % items.length;
  items[next].focus();
  items[next].click();
}

/* ---------- Segmented control ---------- */

export function Segmented<T extends string | number>({
  options, value, onChange, label,
}: { options: { value: T; label: ReactNode; title?: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="segmented" role="radiogroup" aria-label={label} onKeyDown={radioKeys} style={{ ['--n' as string]: options.length }}>
      <div className="segmented-thumb" style={{ transform: `translateX(${idx * 100}%)` }} />
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          title={o.title}
          className="segmented-item"
          data-active={o.value === value || undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Toggle ---------- */

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <button role="switch" aria-checked={checked} className="toggle" data-on={checked || undefined} onClick={() => onChange(!checked)}>
        <span className="toggle-knob" />
      </button>
    </label>
  );
}

/* ---------- Color field ---------- */

export function ColorField({ label, value, onBegin, onChange }: { label: string; value: string; onBegin: () => void; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="color-field">
      <label className="swatch" style={{ background: value }} title={`Pick ${label}`}>
        <input
          type="color"
          value={value}
          onFocus={onBegin}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
        />
      </label>
      <span className="color-label">{label}</span>
      <input
        className="hex-input"
        value={draft.replace('#', '').toUpperCase()}
        spellCheck={false}
        maxLength={7}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = normalizeHex(draft);
          if (n && n !== value) { onBegin(); onChange(n); } else setDraft(value);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label={`${label} hex`}
      />
    </div>
  );
}

/* ---------- Collapsible section ---------- */

export function Section({ title, id, children, defaultOpen = true, action }: { title: string; id?: string; children: ReactNode; defaultOpen?: boolean; action?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="section" data-section={id} data-open={open || undefined}>
      <div className="section-head">
        <button className="section-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <ChevronDown className="section-chevron" />
          {title}
        </button>
        {action}
      </div>
      <div className="section-body">
        <div className="section-inner">{children}</div>
      </div>
    </section>
  );
}

/* ---------- Select ---------- */

export function Select<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <label className="select">
      <span className="select-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="select-chevron" />
    </label>
  );
}
