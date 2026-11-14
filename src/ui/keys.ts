const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Shows shortcuts in the user's own platform convention. */
export const k = (s: string) => (isMac ? s : s.replace(/⇧\s?/g, 'Shift+').replace(/⌘\s?/g, 'Ctrl+'));
export const MOD = isMac ? '⌘' : 'Ctrl';

/** Primary input is a finger. A capability query, never a user-agent guess. */
export const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
