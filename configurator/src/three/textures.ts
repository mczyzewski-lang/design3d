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

/** Deski dębowe na posadzkę: 2,4 × 2,4 m, deski 20 cm. */
export function floorTexture(dark = false): THREE.CanvasTexture {
  const ck = `floor:${dark}`;
  if (cache.has(ck)) return cache.get(ck);
  const S = 1024;
  const [c, g] = canvas(S, S);
  const plank = S / 12;
  const base = hex(dark ? '#a98a68' : '#cdb08a');
  for (let r = 0; r < 12; r++) {
    let x = -Math.floor(hash(r * 3.1) * 300);
    let j = 0;
    while (x < S) {
      const len = 260 + Math.floor(hash(r * 7.3 + j * 1.7) * 420);
      const tone = (hash(r * 11.1 + j * 5.7) - 0.5) * 30;
      for (let yy = 0; yy < plank; yy++) {
        const v = yy / plank;
        for (let k = 0; k < 6; k++) {
          const yLine = Math.round(r * plank + yy);
          const shade = Math.sin((v * 7 + fbm((x + k * 40) / 120, r + j) * 3) * Math.PI) * 10;
          g.fillStyle = `rgb(${base[0] + tone + shade},${base[1] + tone + shade * 0.85},${base[2] + tone + shade * 0.7})`;
          g.fillRect(x + (k * len) / 6, yLine, len / 6 + 1, 1);
        }
      }
      g.fillStyle = 'rgba(70,50,30,0.55)';
      g.fillRect(x, r * plank, 2, plank);
      x += len;
      j++;
    }
    g.fillStyle = 'rgba(70,50,30,0.5)';
    g.fillRect(0, r * plank, S, 2);
  }
  const t = tex(c, [1 / 2.4, 1 / 2.4]);
  cache.set(ck, t);
  return t;
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
