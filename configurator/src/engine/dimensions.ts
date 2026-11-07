// Specyfikacje linii wymiarowych per widok.
import { cm } from './validate';
import type { Config, Solved, Vec3 } from './types';

export type DimView = 'top' | 'side' | 'persp';
export interface DimSpec {
  id: string;
  a: Vec3;
  b: Vec3;
  /** kierunek odsunięcia linii od mierzonego obiektu (jednostkowy) i odległość */
  dir: Vec3;
  offset: number;
  label: string;
  kind: 'room' | 'stair' | 'gap' | 'opening' | 'vertical';
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export function dimensionSpecs(c: Config, s: Solved, view: DimView, sideFlip = false): DimSpec[] {
  const { room } = c;
  const W = room.width;
  const D = room.depth;
  const H = room.height;
  const L = s.layout;
  const fp = L.footprint;
  const out: DimSpec[] = [];
  if (view === 'persp') {
    out.push({ id: 'p-w', a: v(0, 0, D), b: v(W, 0, D), dir: v(0, 0, 1), offset: 0.3, label: `${cm(W)} cm`, kind: 'room' });
    out.push({ id: 'p-d', a: v(W, 0, 0), b: v(W, 0, D), dir: v(1, 0, 0), offset: 0.3, label: `${cm(D)} cm`, kind: 'room' });
    out.push({ id: 'p-h', a: v(W, 0, D), b: v(W, H, D), dir: v(1, 0, 0), offset: 0.3, label: `${cm(H)} cm`, kind: 'vertical' });
    return out;
  }
  if (view === 'top') {
    const y = H + 0.06;
    out.push({ id: 't-w', a: v(0, y, D), b: v(W, y, D), dir: v(0, 0, 1), offset: 0.55, label: `${cm(W)}`, kind: 'room' });
    out.push({ id: 't-d', a: v(W, y, 0), b: v(W, y, D), dir: v(1, 0, 0), offset: 0.55, label: `${cm(D)}`, kind: 'room' });
    out.push({ id: 't-fw', a: v(fp.minX, y, fp.minZ), b: v(fp.maxX, y, fp.minZ), dir: v(0, 0, -1), offset: 0.3, label: `rzut ${cm(fp.maxX - fp.minX)}`, kind: 'stair' });
    out.push({ id: 't-fd', a: v(fp.minX, y, fp.minZ), b: v(fp.minX, y, fp.maxZ), dir: v(-1, 0, 0), offset: 0.3, label: `rzut ${cm(fp.maxZ - fp.minZ)}`, kind: 'stair' });
    // odstępy do ścian w 1/4 rzutu — nie nachodzą na wymiary rzutu
    const cz = fp.minZ + (fp.maxZ - fp.minZ) * 0.25;
    const cx = fp.minX + (fp.maxX - fp.minX) * 0.75;
    const g = s.fit.gaps;
    if (g.left > 0.005) out.push({ id: 't-gl', a: v(0, y, cz), b: v(fp.minX, y, cz), dir: v(0, 0, 1), offset: 0, label: `${cm(g.left)}`, kind: 'gap' });
    if (g.right > 0.005) out.push({ id: 't-gr', a: v(fp.maxX, y, cz), b: v(W, y, cz), dir: v(0, 0, 1), offset: 0, label: `${cm(g.right)}`, kind: 'gap' });
    if (g.back > 0.005) out.push({ id: 't-gb', a: v(cx, y, 0), b: v(cx, y, fp.minZ), dir: v(1, 0, 0), offset: 0, label: `${cm(g.back)}`, kind: 'gap' });
    if (g.front > 0.005) out.push({ id: 't-gf', a: v(cx, y, fp.maxZ), b: v(cx, y, D), dir: v(1, 0, 0), offset: 0, label: `${cm(g.front)}`, kind: 'gap' });
    L.flights.forEach((f, i) => {
      // szerokość biegu na linii pierwszego podnoszenia, długość wzdłuż lewej krawędzi
      const hw = f.width / 2;
      const a = { x: f.origin.x + f.left.x * hw, z: f.origin.z + f.left.z * hw };
      const b = { x: f.origin.x - f.left.x * hw, z: f.origin.z - f.left.z * hw };
      out.push({ id: `t-bw${i}`, a: v(a.x, y, a.z), b: v(b.x, y, b.z), dir: v(-f.dir.x, 0, -f.dir.z), offset: 0.12, label: `bieg ${cm(f.width)}`, kind: 'stair' });
      const e = { x: a.x + f.dir.x * f.length, z: a.z + f.dir.z * f.length };
      if (f.length > 0.05) out.push({ id: `t-bl${i}`, a: v(a.x, y, a.z), b: v(e.x, y, e.z), dir: v(f.left.x, 0, f.left.z), offset: 0.12, label: `${cm(f.length)}`, kind: 'stair' });
    });
    if (L.landing) {
      const r = L.landing.rect;
      out.push({ id: 't-lw', a: v(r.minX, y, r.minZ), b: v(r.maxX, y, r.minZ), dir: v(0, 0, -1), offset: 0.12, label: `spocznik ${cm(r.maxX - r.minX)}`, kind: 'stair' });
      out.push({ id: 't-ld', a: v(r.maxX, y, r.minZ), b: v(r.maxX, y, r.maxZ), dir: v(1, 0, 0), offset: 0.12, label: `${cm(r.maxZ - r.minZ)}`, kind: 'stair' });
    }
    if (c.stairs.shape === 'U' && L.flights.length === 2) {
      const f0 = L.flights[0];
      const f1 = L.flights[1];
      const p0 = { x: f0.origin.x - f0.left.x * f0.width / 2, z: f0.origin.z - f0.left.z * f0.width / 2 };
      const p1 = { x: f1.origin.x - f1.left.x * f1.width / 2, z: f1.origin.z - f1.left.z * f1.width / 2 };
      // przesuń na środek długości biegu 1
      const k = f0.length / 2;
      const q0 = v(p0.x + f0.dir.x * k, y, p0.z + f0.dir.z * k);
      const q1 = v(q0.x + (p1.x - p0.x) * (Math.abs(f0.dir.x) < 0.5 ? 1 : 0), y, q0.z + (p1.z - p0.z) * (Math.abs(f0.dir.z) < 0.5 ? 1 : 0));
      out.push({ id: 't-gap', a: q0, b: q1, dir: v(f0.dir.x, 0, f0.dir.z), offset: 0, label: `odstęp ${cm(c.stairs.gap)}`, kind: 'stair' });
    }
    const o = s.opening.rect;
    out.push({ id: 't-ow', a: v(o.minX, y, o.maxZ), b: v(o.maxX, y, o.maxZ), dir: v(0, 0, 1), offset: 0.22, label: `otwór ${cm(o.maxX - o.minX)}`, kind: 'opening' });
    out.push({ id: 't-od', a: v(o.maxX, y, o.minZ), b: v(o.maxX, y, o.maxZ), dir: v(1, 0, 0), offset: 0.22, label: `otwór ${cm(o.maxZ - o.minZ)}`, kind: 'opening' });
    return out;
  }
  // widok z boku: elewacja prostopadła do biegu 1
  const f0 = L.flights[0];
  const side = sideFlip ? -1 : 1;
  const n = { x: f0.left.x * side, z: f0.left.z * side }; // kierunek do kamery
  const nearEdge = { x: f0.origin.x + n.x * (f0.width / 2 + 0.05), z: f0.origin.z + n.z * (f0.width / 2 + 0.05) };
  const back = { x: nearEdge.x - f0.dir.x * 0.5, z: nearEdge.z - f0.dir.z * 0.5 };
  const toCam = v(n.x, 0, n.z);
  const h = s.calc.rise;
  out.push({ id: 's-H', a: v(back.x, 0, back.z), b: v(back.x, H, back.z), dir: v(-f0.dir.x, 0, -f0.dir.z), offset: 0.25, label: `H ${cm(H)}`, kind: 'vertical' });
  if (L.landing) {
    const p = { x: nearEdge.x + f0.dir.x * (f0.length + L.landing.depth), z: nearEdge.z + f0.dir.z * (f0.length + L.landing.depth) };
    out.push({ id: 's-L', a: v(p.x, 0, p.z), b: v(p.x, L.landing.y, p.z), dir: v(f0.dir.x, 0, f0.dir.z), offset: 0.2, label: `spocznik ${cm(L.landing.y)}`, kind: 'vertical' });
  }
  const ex = L.exit.point;
  const sp = { x: ex.x + L.exit.dir.x * 0.4 + n.x * 0.1, z: ex.z + L.exit.dir.z * 0.4 + n.z * 0.1 };
  out.push({ id: 's-slab', a: v(sp.x, H - c.room.slabThickness, sp.z), b: v(sp.x, H, sp.z), dir: v(L.exit.dir.x, 0, L.exit.dir.z), offset: 0.15, label: `strop ${cm(c.room.slabThickness)}`, kind: 'vertical' });
  out.push({ id: 's-h', a: v(nearEdge.x, 0, nearEdge.z), b: v(nearEdge.x, h, nearEdge.z), dir: v(-f0.dir.x, 0, -f0.dir.z), offset: 0.12, label: `h ${cm(h)}`, kind: 'vertical' });
  const s1 = { x: nearEdge.x + f0.dir.x * f0.going, z: nearEdge.z + f0.dir.z * f0.going };
  out.push({ id: 's-s', a: v(nearEdge.x, h, nearEdge.z), b: v(s1.x, h, s1.z), dir: v(0, 1, 0), offset: 0.12, label: `s ${cm(f0.going)}`, kind: 'stair' });
  const e1 = { x: nearEdge.x + f0.dir.x * f0.length, z: nearEdge.z + f0.dir.z * f0.length };
  out.push({ id: 's-len', a: v(nearEdge.x, 0, nearEdge.z), b: v(e1.x, 0, e1.z), dir: v(0, -1, 0), offset: 0.18, label: `bieg ${cm(f0.length)}`, kind: 'stair' });
  void toCam;
  return out;
}
