// Proceduralne tekstury generowane na <canvas> — bez zewnętrznych plików.
import * as THREE from 'three';
import type { WoodKey } from '../engine/types';
import { canvas, fbm, hash, hex, woodCanvases } from './woodCanvas';

const cache = new Map<string, any>();

function tex(c: HTMLCanvasElement, repeat: [number, number], srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 16; // przycinane do możliwości GPU — ostrzejsze słoje pod kątem
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Tekstury drewna (mapa koloru + bump) z proceduralnego płótna. */
export function woodTextures(key: WoodKey): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const ck = `woodtex:${key}`;
  if (cache.has(ck)) return cache.get(ck);
  const cv = woodCanvases(key);
  const out = { map: tex(cv.color, [1 / 1.2, 1 / 0.3]), bump: tex(cv.bump, [1 / 1.2, 1 / 0.3], false) };
  cache.set(ck, out);
  return out;
}

/**
 * Deski dębowe na posadzkę: kafel 2,4 × 2,4 m, deski 20 cm o losowych długościach (bezszwowo w obu osiach).
 * Usłojenie liczone per piksel jak w stopnicach; osobna mapa wypukłości (słoje + fugi między deskami).
 */
export function floorTextures(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const ck = 'floor3';
  if (cache.has(ck)) return cache.get(ck);
  const S = 1024;
  const ROWS = 12;
  const plank = S / ROWS;
  const [c, g] = canvas(S, S);
  const [cb, gb] = canvas(S, S);
  const img = g.createImageData(S, S);
  const bimg = gb.createImageData(S, S);
  const dark = hex('#a98660');
  const base = hex('#cbb08b');
  const light = hex('#dcc6a3');
  for (let r = 0; r < ROWS; r++) {
    // podział rzędu na deski; przesunięcie rzędu, żeby styki nie wypadały w jednej linii
    const off = Math.floor(hash(r * 3.1 + 0.7) * S);
    const ends: number[] = [];
    let x = 0;
    let j = 0;
    while (x < S) {
      x += 300 + Math.floor(hash(r * 7.3 + j * 1.7) * 420);
      if (S - x < 200) x = S;
      ends.push(Math.min(S, x));
      j++;
    }
    for (let px = 0; px < S; px++) {
      const xr = (px + off) % S;
      let seg = 0;
      while (ends[seg] <= xr) seg++;
      const x0 = seg ? ends[seg - 1] : 0;
      const seed = r * 17 + seg * 5 + 1;
      const tone = (hash(seed * 9.1) - 0.5) * 0.3;
      const freq = 0.5 + hash(seed * 5.3) * 0.8;
      const u = xr / S;
      const warp = fbm(u * 2.2 + seed, seed) * 1.2; // długie, spokojne słoje (deska, nie sklejka)
      const wob = fbm(u * 30, seed + 3) * 0.5;
      const endGap = xr - x0 < 2;
      for (let py = 0; py < plank; py++) {
        const y = Math.round(r * plank) + py;
        if (y >= S) break;
        const v = py / plank;
        const ring = Math.sin((v * 13 * freq + warp) * Math.PI + wob);
        const grain = Math.pow(Math.abs(ring), 0.6);
        const fine = (hash(px * 0.37 + y * 91.1 + seed) - 0.5) * 0.1;
        let t = 0.5 + (grain - 0.5) * 0.2 + tone + fine;
        if (hash(Math.floor(px / 7) * 7.7 + y * 13.3 + seed) > 0.988) t -= 0.2; // pory
        t = Math.min(1, Math.max(0, t));
        const gap = endGap || py < 2;
        const k = gap ? 0.55 : py === 2 || py >= plank - 1 ? 0.9 : 1; // fuga + delikatna faza krawędzi
        const o = (y * S + px) * 4;
        for (let i = 0; i < 3; i++) {
          const col = t < 0.5 ? dark[i] + (base[i] - dark[i]) * (t / 0.5) : base[i] + (light[i] - base[i]) * ((t - 0.5) / 0.5);
          img.data[o + i] = col * k;
        }
        img.data[o + 3] = 255;
        const bv = gap ? 30 : Math.round((0.55 + grain * 0.25 + fine) * 255);
        bimg.data[o] = bimg.data[o + 1] = bimg.data[o + 2] = bv;
        bimg.data[o + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
  gb.putImageData(bimg, 0, 0);
  const out = { map: tex(c, [1 / 2.4, 1 / 2.4]), bump: tex(cb, [1 / 2.4, 1 / 2.4], false) };
  cache.set(ck, out);
  return out;
}

/** Subtelna faktura ciepłej białej ściany: 2 × 2 m. */
export function wallTexture(): THREE.CanvasTexture {
  if (cache.has('wall')) return cache.get('wall');
  const S = 512;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const n = (hash(i * 0.731) - 0.5) * 7 + (fbm((i % S) / 40, Math.floor(i / S / 40)) - 0.5) * 6;
    img.data[i * 4] = 244 + n;
    img.data[i * 4 + 1] = 240 + n;
    img.data[i * 4 + 2] = 232 + n;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, [0.5, 0.5]);
  cache.set('wall', t);
  return t;
}

/** Mapa chropowatości stali szczotkowanej (smugi poziome). */
export function brushedRoughness(): THREE.CanvasTexture {
  if (cache.has('brushed')) return cache.get('brushed');
  const S = 512;
  const [c, g] = canvas(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x += 4) {
      const v = 95 + fbm(x / 60 + y * 3.1, y) * 70 + (hash(x + y * 999) - 0.5) * 30;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 4, 1);
    }
  }
  const t = tex(c, [4, 4], false);
  cache.set('brushed', t);
  return t;
}

/** Alpha map blachy perforowanej: kafel 10 cm, otwory Ø ~1,6 cm co 2,5 cm. */
export function perforatedAlpha(): THREE.CanvasTexture {
  if (cache.has('perf')) return cache.get('perf');
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#000';
  const n = 4;
  const step = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const off = j % 2 ? step / 2 : 0;
    const cx = i * step + step / 2 + off;
    for (const x of [cx, cx - S]) {
      g.beginPath();
      g.arc(x, j * step + step / 2, step * 0.33, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = tex(c, [10, 10], false);
  cache.set('perf', t);
  return t;
}

/** Alpha map siatki cięto-ciągnionej: oczka rombowe, kafel 8 × 4 cm. */
export function meshAlpha(): THREE.CanvasTexture {
  if (cache.has('mesh')) return cache.get('mesh');
  const W = 256;
  const H = 128;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#fff';
  g.lineWidth = 22;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(0, H / 2); g.lineTo(W / 4, 0); g.lineTo(W / 2, H / 2); g.lineTo(3 * W / 4, 0); g.lineTo(W, H / 2);
  g.moveTo(0, H / 2); g.lineTo(W / 4, H); g.lineTo(W / 2, H / 2); g.lineTo(3 * W / 4, H); g.lineTo(W, H / 2);
  g.stroke();
  const t = tex(c, [1 / 0.08, 1 / 0.04], false);
  cache.set('mesh', t);
  return t;
}
