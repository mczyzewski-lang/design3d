// Polskie kody pocztowe → współrzędne (dane © GeoNames, CC BY 4.0 — patrz scripts/build_pl_postal.py).
// Brakujący kod: najbliższy numerycznie kod z tej samej trójki cyfr, potem środek obszaru dwóch pierwszych cyfr.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export interface GeoPoint { lat: number; lon: number; place: string; precision: 'exact' | 'near' | 'area'; code: string }

interface Entry { code: number; lat: number; lon: number; place: string }

const here = path.dirname(fileURLToPath(import.meta.url));
let table: Map<number, Entry> | null = null;
let byPrefix3: Map<number, Entry[]> | null = null;
let byPrefix2: Map<number, { lat: number; lon: number; place: string }> | null = null;

function load(): void {
  if (table) return;
  table = new Map();
  byPrefix3 = new Map();
  const tsv = zlib.gunzipSync(fs.readFileSync(path.join(here, 'pl-postal.tsv.gz'))).toString('utf8');
  for (const line of tsv.split('\n')) {
    if (!line) continue;
    const [c, la, lo, place] = line.split('\t');
    const e: Entry = { code: Number(c), lat: Number(la), lon: Number(lo), place };
    table.set(e.code, e);
    const p3 = Math.floor(e.code / 100);
    (byPrefix3.get(p3) ?? byPrefix3.set(p3, []).get(p3)!).push(e);
  }
  // środki obszarów (dwie pierwsze cyfry) i najczęstsza miejscowość
  const acc = new Map<number, { lat: number; lon: number; n: number; places: Map<string, number> }>();
  for (const e of table.values()) {
    const p2 = Math.floor(e.code / 1000);
    const a = acc.get(p2) ?? { lat: 0, lon: 0, n: 0, places: new Map() };
    a.lat += e.lat; a.lon += e.lon; a.n++;
    a.places.set(e.place, (a.places.get(e.place) ?? 0) + 1);
    acc.set(p2, a);
  }
  byPrefix2 = new Map([...acc].map(([k, a]) => [k, { lat: a.lat / a.n, lon: a.lon / a.n, place: [...a.places].sort((x, y) => y[1] - x[1])[0][0] }]));
}

/** „31-100”, „31100”, „31 100” → 31100; niepoprawny → null. */
export function parsePostal(v: unknown): number | null {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length === 5 ? Number(d) : null;
}
export const formatPostal = (n: number) => { const s = String(n).padStart(5, '0'); return `${s.slice(0, 2)}-${s.slice(2)}`; };

export function geocodePostal(v: unknown): GeoPoint | null {
  const code = parsePostal(v);
  if (code === null) return null;
  load();
  const exact = table!.get(code);
  if (exact) return { lat: exact.lat, lon: exact.lon, place: exact.place, precision: 'exact', code: formatPostal(code) };
  const near = byPrefix3!.get(Math.floor(code / 100));
  if (near?.length) {
    const e = near.reduce((b, x) => (Math.abs(x.code - code) < Math.abs(b.code - code) ? x : b));
    return { lat: e.lat, lon: e.lon, place: e.place, precision: 'near', code: formatPostal(code) };
  }
  const area = byPrefix2!.get(Math.floor(code / 1000));
  return area ? { ...area, precision: 'area', code: formatPostal(code) } : null;
}

/** Odległość po kuli ziemskiej (km). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
