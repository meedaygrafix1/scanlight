import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { Params } from './types';
import { DEFAULTS } from './presets';

interface State {
  params: Params;
  past: Params[];
  future: Params[];
  presetId: string | null;
}

type Action =
  | { type: 'set'; patch: Partial<Params>; history: boolean }
  | { type: 'begin' }
  | { type: 'replace'; params: Params; presetId: string | null }
  | { type: 'undo' }
  | { type: 'redo' };

const LIMIT = 100;
const STORE_KEY = 'scanlight:design:v1';

const ENUMS: Partial<Record<keyof Params, readonly unknown[]>> = {
  effect: ['led', 'halftone', 'bayer', 'diffusion', 'ascii', 'crt'],
  shape: ['circle', 'square', 'diamond'],
  anim: ['none', 'flicker', 'scan', 'pulse', 'wave', 'rain', 'glitch'],
  colorMode: ['palette', 'source'],
  glyphMode: ['luma', 'random'],
  matrix: [2, 4, 8],
};
const RANGES: Partial<Record<keyof Params, [number, number]>> = {
  columns: [4, 800], dot: [0.05, 1], angle: [0, 90], gap: [0, 0.9], levels: [2, 8],
  brightness: [-1, 1], contrast: [0.1, 4], gamma: [0.1, 4], blackPoint: [0, 0.95], ambient: [0, 1],
  glow: [0, 3], glowRadius: [0, 1], scanlines: [0, 1], noise: [0, 1], vignette: [0, 1], aberration: [0, 1], curvature: [0, 1],
  cycles: [1, 12], loopSeconds: [0.5, 30], intensity: [0, 1],
};

/** Stored data is untrusted: keep only values of the right type, range and shape. */
export function sanitize(raw: unknown): Params {
  const out: Record<string, unknown> = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return DEFAULTS;
  for (const key of Object.keys(DEFAULTS) as (keyof Params)[]) {
    const v = (raw as Record<string, unknown>)[key];
    const d = DEFAULTS[key];
    if (typeof v !== typeof d) continue;
    if (ENUMS[key]) { if (ENUMS[key]!.includes(v)) out[key] = v; continue; }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) continue;
      const r = RANGES[key];
      out[key] = r ? Math.min(r[1], Math.max(r[0], v)) : v;
    } else if (typeof v === 'string') {
      if (key === 'bg' || key === 'mid' || key === 'high') { if (/^#[0-9a-f]{6}$/i.test(v)) out[key] = v; }
      else if (v.length <= 200) out[key] = v;
    } else out[key] = v;
  }
  return out as unknown as Params;
}

function loadSaved(): { params: Params; presetId: string | null } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (raw) return { params: sanitize(raw.params), presetId: typeof raw.presetId === 'string' ? raw.presetId.slice(0, 40) : null };
  } catch { /* storage blocked or corrupt: start fresh */ }
  return { params: DEFAULTS, presetId: 'red-signal' };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'begin':
      return { ...s, past: [...s.past, s.params].slice(-LIMIT), future: [] };
    case 'set': {
      const params = { ...s.params, ...a.patch };
      if (!a.history) return { ...s, params };
      return { params, past: [...s.past, s.params].slice(-LIMIT), future: [], presetId: s.presetId };
    }
    case 'replace':
      return { params: a.params, past: [...s.past, s.params].slice(-LIMIT), future: [], presetId: a.presetId };
    case 'undo': {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return { ...s, params: prev, past: s.past.slice(0, -1), future: [s.params, ...s.future] };
    }
    case 'redo': {
      if (!s.future.length) return s;
      const [next, ...rest] = s.future;
      return { ...s, params: next, past: [...s.past, s.params], future: rest };
    }
  }
}

export function useEditor() {
  const [state, dispatch] = useReducer(reducer, null, () => ({ ...loadSaved(), past: [], future: [] }));

  useEffect(() => {
    const id = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify({ params: state.params, presetId: state.presetId })); } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(id);
  }, [state.params, state.presetId]);

  /** Discrete change (toggle, select): one undo step. */
  const set = useCallback((patch: Partial<Params>) => dispatch({ type: 'set', patch, history: true }), []);
  /** Continuous change (slider drag): call begin() once on pointer down, then live(). */
  const live = useCallback((patch: Partial<Params>) => dispatch({ type: 'set', patch, history: false }), []);
  const begin = useCallback(() => dispatch({ type: 'begin' }), []);
  const replace = useCallback((params: Params, presetId: string | null = null) => dispatch({ type: 'replace', params, presetId }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  const api = useMemo(() => ({ set, live, begin, replace, undo, redo }), [set, live, begin, replace, undo, redo]);
  return { ...state, ...api, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}

export type Editor = ReturnType<typeof useEditor>;
