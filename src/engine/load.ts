export interface Source {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  name: string;
  url: string;
}

export const MAX_SOURCE = 2048;

/** Decode an image file, cap its size and composite it onto black. */
export async function loadImage(file: Blob, name = 'image'): Promise<Source> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  return fromDrawable(bmp, bmp.width, bmp.height, name);
}

export async function fromDrawable(img: CanvasImageSource, w0: number, h0: number, name: string): Promise<Source> {
  const s = Math.min(1, MAX_SOURCE / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * s));
  const height = Math.max(1, Math.round(h0 * s));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  return { canvas, width, height, name: name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(blob) };
}
