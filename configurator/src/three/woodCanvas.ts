// Generator płótna drewna (bez three.js) — używany przez tekstury i miniatury w panelu.
import { woodSpec } from '../engine/catalog';
import type { WoodKey } from '../engine/types';

const cache = new Map<string, any>();
export function hash(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(i + seed * 101.3);
  const b = hash(i + 1 + seed * 101.3);
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}
export function fbm(x: number, seed: number): number {
  return noise1(x, seed) * 0.55 + noise1(x * 2.1, seed + 7) * 0.3 + noise1(x * 4.3, seed + 13) * 0.15;
}
export const hex = (h: string): number[] => {
  const m = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
};
export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Klejonka: lamele wzdłuż stopnicy, usłojenie, pory, w dębie promienie rdzeniowe. Płótno = 1,2 m × 0,3 m. */
export function woodCanvases(key: WoodKey): { color: HTMLCanvasElement; bump: HTMLCanvasElement } {
  const ck = `wood:${key}`;
  if (cache.has(ck)) return cache.get(ck);
  const spec = woodSpec(key);
  const W = 1024;
  const H = 256;
  const [c, g] = canvas(W, H);
  const [cb, gb] = canvas(W, H);
  const img = g.createImageData(W, H);
  const bimg = gb.createImageData(W, H);
  const base = hex(spec.base);
  const dark = hex(spec.dark);
  const light = hex(spec.light);
  // lamele 4–8 cm (0,3 m = 256 px)
  const lam: Array<{ y0: number; y1: number; tone: number; seed: number; freq: number }> = [];
  let y = 0;
  let k = 0;
  while (y < H) {
    const hgt = Math.round(36 + hash(k * 3.7 + spec.contrast) * 34);
    lam.push({ y0: y, y1: Math.min(H, y + hgt), tone: (hash(k * 9.1) - 0.5) * 0.35, seed: k * 13 + 1, freq: 0.6 + hash(k * 5.3) * 0.9 });
    y += hgt;
    k++;
  }
  for (const L of lam) {
    for (let py = L.y0; py < L.y1; py++) {
      const v = (py - L.y0) / (L.y1 - L.y0);
      for (let px = 0; px < W; px++) {
        const u = px / W;
        const warp = fbm(u * 6 + L.seed, L.seed) * 4;
        const ring = Math.sin((v * 18 * L.freq + warp) * Math.PI + fbm(u * 40, L.seed + 3) * 1.2);
        const grain = Math.pow(Math.abs(ring), 0.6);
        const fine = (hash(px * 0.37 + py * 91.1 + L.seed) - 0.5) * 0.12;
        let t = 0.5 + (grain - 0.5) * spec.contrast + L.tone + fine;
        // pory (ciemne, wydłużone wzdłuż włókien)
        if (hash(Math.floor(px / 6) * 7.7 + py * 13.3 + L.seed) > 0.985) t -= 0.25;
        // promienie rdzeniowe dębu (jasne plamki)
        if (spec.rays && hash(Math.floor(px / 14) * 3.3 + Math.floor(py / 3) * 17.1 + L.seed) > 0.992) t += 0.22;
        t = Math.min(1, Math.max(0, t));
        const col = t < 0.5 ? [0, 1, 2].map((i) => dark[i] + (base[i] - dark[i]) * (t / 0.5)) : [0, 1, 2].map((i) => base[i] + (light[i] - base[i]) * ((t - 0.5) / 0.5));
        const o = (py * W + px) * 4;
        // fuga między lamelami
        const edge = py === L.y0 ? 0.82 : 1;
        img.data[o] = col[0] * edge;
        img.data[o + 1] = col[1] * edge;
        img.data[o + 2] = col[2] * edge;
        img.data[o + 3] = 255;
        const bv = Math.round((0.35 + grain * 0.4 + fine) * 255 * edge);
        bimg.data[o] = bimg.data[o + 1] = bimg.data[o + 2] = bv;
        bimg.data[o + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
  gb.putImageData(bimg, 0, 0);
  const out = { color: c, bump: cb };
  cache.set(ck, out);
  return out;
}

export function woodSwatch(key: WoodKey): string {
  const ck = `swatch:${key}`;
  if (cache.has(ck)) return cache.get(ck);
  const src = woodCanvases(key).color;
  const [c, g] = canvas(96, 64);
  g.drawImage(src, 0, 0, 384, 256, 0, 0, 96, 64);
  const url = c.toDataURL('image/png');
  cache.set(ck, url);
  return url;
}
