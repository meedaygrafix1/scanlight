import { fromDrawable, type Source } from '../engine/load';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const stroke = (ctx: CanvasRenderingContext2D, width: number) => {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
};

const SAMPLES: { id: string; name: string; draw: Draw }[] = [
  {
    id: 'shield', name: 'Shield',
    draw: (ctx, w, h) => {
      ctx.save();
      ctx.translate(w / 2, h / 2);
      const s = h / 520;
      ctx.scale(s, s);
      const shield = new Path2D('M0 -200 L165 -140 L165 -10 C165 100 90 170 0 205 C-90 170 -165 100 -165 -10 L-165 -140 Z');
      stroke(ctx, 46);
      ctx.stroke(shield);
      ctx.globalAlpha = 0.55;
      stroke(ctx, 40);
      ctx.beginPath();
      ctx.moveTo(-70, 0); ctx.lineTo(-15, 55); ctx.lineTo(80, -50);
      ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: 'print', name: 'Fingerprint',
    draw: (ctx, w, h) => {
      ctx.save();
      ctx.translate(w / 2, h * 0.58);
      const s = h / 520;
      ctx.scale(s, s);
      for (let i = 0; i < 6; i++) {
        const r = 40 + i * 34;
        ctx.globalAlpha = i > 3 ? 0.5 : 1;
        stroke(ctx, 18);
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI * (1.02 + i * 0.02), Math.PI * (1.98 - i * 0.015));
        ctx.lineTo(r * 0.98, 120 - i * 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.lineTo(-r * 0.96, 60 + i * 18);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    id: 'orb', name: 'Orb',
    draw: (ctx, w, h) => {
      const g = ctx.createRadialGradient(w * 0.42, h * 0.38, 4, w / 2, h / 2, h * 0.42);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, '#bbbbbb');
      g.addColorStop(0.8, '#2a2a2a');
      g.addColorStop(1, '#000');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, h * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.6;
      stroke(ctx, h * 0.012);
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, h * 0.62, h * 0.12, -0.35, 0, Math.PI * 2);
      ctx.stroke();
    },
  },
  {
    id: 'type', name: 'Type',
    draw: (ctx, w, h) => {
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(h * 0.34)}px "Geist Variable", system-ui, sans-serif`;
      ctx.fillText('SIGNAL', w / 2, h * 0.46);
      ctx.globalAlpha = 0.5;
      ctx.font = `600 ${Math.round(h * 0.07)}px "Geist Mono Variable", monospace`;
      ctx.fillText('NO CARRIER · 0xFF', w / 2, h * 0.72);
    },
  },
];

export const SAMPLE_LIST = SAMPLES.map(({ id, name }) => ({ id, name }));

export function sampleCanvas(id: string, w = 1200, h = 900) {
  const s = SAMPLES.find((x) => x.id === id) ?? SAMPLES[0];
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  s.draw(ctx, w, h);
  return c;
}

export async function loadSample(id: string): Promise<Source> {
  await document.fonts.ready;
  const c = sampleCanvas(id);
  const name = SAMPLES.find((x) => x.id === id)?.name ?? 'Sample';
  return fromDrawable(c, c.width, c.height, `${name} sample`);
}
