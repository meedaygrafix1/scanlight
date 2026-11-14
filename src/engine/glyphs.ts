/** Renders a charset into a horizontal atlas: one square-ish tile per glyph, white on black. */
export async function buildGlyphAtlas(charset: string) {
  const chars = Array.from(charset.length ? charset : ' ');
  const tileW = 48;
  const tileH = Math.round(tileW * 1.45);
  try {
    await document.fonts.load(`600 ${tileW}px "Geist Mono Variable"`);
  } catch {
    /* fall back to system monospace */
  }
  const c = document.createElement('canvas');
  c.width = tileW * chars.length;
  c.height = tileH;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(tileW * 1.05)}px "Geist Mono Variable", ui-monospace, monospace`;
  chars.forEach((ch, i) => ctx.fillText(ch, i * tileW + tileW / 2, tileH / 2 + tileW * 0.04));
  return { canvas: c, count: chars.length };
}
