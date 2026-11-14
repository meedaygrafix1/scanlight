const cache = new Map<string, [number, number, number]>();

export function hexToRgb(hex: string): [number, number, number] {
  const hit = cache.get(hex);
  if (hit) return hit;
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.padEnd(6, '0').slice(0, 6), 16) || 0;
  const rgb: [number, number, number] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  cache.set(hex, rgb);
  return rgb;
}

export function normalizeHex(v: string): string | null {
  let h = v.replace('#', '').trim();
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toLowerCase()}` : null;
}
