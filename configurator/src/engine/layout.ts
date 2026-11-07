// Generacja schodów I / L / U w układzie lokalnym (u = prawa ręka idącego, v = kierunek wejścia)
// i rozmieszczenie w pokoju (rotacja wg kierunku wejścia + przesunięcie wg wyrównania).
import { LIMITS } from './catalog';
import type { Calc, EntryDir, FlightEl, LandingEl, Layout, LocalPolyPoint, Rect, RoomConfig, SpiralEl, StairConfig, TreadEl, Vec2, WinderEl, Xf } from './types';

interface LTread { flight: number; index: number; u0: number; u1: number; v0: number; v1: number; y: number }
interface LFlight {
  index: number; risers: number; treads: number; baseY: number; topY: number; length: number;
  ou: number; ov: number; du: number; dv: number; width: number; endsAtLanding: boolean; startsAtLanding: boolean; t: LTread[];
}
interface LLanding { u0: number; u1: number; v0: number; v1: number; y: number; depth: number; width: number; au: number; av: number }

interface LWinder { pu: number; pv: number; polys: Array<{ pts: Array<[number, number]>; y: number; index: number }>; corners: Array<[number, number]>; baseY: number; topY: number; walkGoing: number; innerGoing: number }

/**
 * Stopnie zabiegowe: promienie z punktu zbiegu P dzielą kąt `span` (od kierunku d0 obracając w stronę zakrętu) na k równych części;
 * każdy stopień to wielokąt P → przecięcie promienia z obrysem zewnętrznym → (wierzchołki obrysu) → kolejne przecięcie.
 */
export function winderPolygons(P: [number, number], boundary: Array<[number, number]>, angle0: number, span: number, k: number): { polys: Array<Array<[number, number]>>; hits: Array<{ p: [number, number]; seg: number; t: number }> } {
  const hit = (a: number) => {
    const d: [number, number] = [-Math.cos(a), Math.sin(a)];
    let best: { p: [number, number]; seg: number; t: number; r: number } | null = null;
    for (let i = 0; i < boundary.length - 1; i++) {
      const A = boundary[i];
      const B = boundary[i + 1];
      const e: [number, number] = [B[0] - A[0], B[1] - A[1]];
      const den = d[0] * e[1] - d[1] * e[0];
      if (Math.abs(den) < 1e-12) continue;
      const w0 = A[0] - P[0];
      const w1 = A[1] - P[1];
      const r = (w0 * e[1] - w1 * e[0]) / den;
      const t = (w0 * d[1] - w1 * d[0]) / den;
      if (r > 1e-9 && t >= -1e-9 && t <= 1 + 1e-9 && (!best || r < best.r)) best = { p: [P[0] + d[0] * r, P[1] + d[1] * r], seg: i, t: Math.min(1, Math.max(0, t)), r };
    }
    return best!;
  };
  const hits = Array.from({ length: k + 1 }, (_, j) => hit(angle0 + (span * j) / k));
  const polys: Array<Array<[number, number]>> = [];
  for (let j = 0; j < k; j++) {
    const a = hits[j];
    const b = hits[j + 1];
    const pts: Array<[number, number]> = [P, a.p];
    for (let i = a.seg + 1; i <= b.seg; i++) pts.push(boundary[i]);
    pts.push(b.p);
    polys.push(pts.filter((q, i, arr) => i === 0 || Math.hypot(q[0] - arr[i - 1][0], q[1] - arr[i - 1][1]) > 1e-9));
  }
  return { polys, hits };
}

/** Wysokości kolejnych punktów obrysu zewnętrznego w zakręcie (interpolacja po długości między przecięciami). */
function boundaryPath(boundary: Array<[number, number]>, hits: Array<{ p: [number, number]; seg: number; t: number }>, y0: number, h: number): LocalPolyPoint[] {
  const out: LocalPolyPoint[] = [];
  const pos = (seg: number, t: number) => seg + t;
  const items: Array<{ p: [number, number]; key: number; y?: number }> = hits.map((q, j) => ({ p: q.p, key: pos(q.seg, q.t), y: y0 + j * h }));
  for (let i = 1; i < boundary.length - 1; i++) items.push({ p: boundary[i], key: i });
  items.sort((a, b) => a.key - b.key);
  const dist: number[] = [0];
  for (let i = 1; i < items.length; i++) dist.push(dist[i - 1] + Math.hypot(items[i].p[0] - items[i - 1].p[0], items[i].p[1] - items[i - 1].p[1]));
  items.forEach((it, i) => {
    let y = it.y;
    if (y === undefined) {
      let a = i - 1;
      while (items[a].y === undefined) a--;
      let b = i + 1;
      while (items[b].y === undefined) b++;
      y = items[a].y! + ((items[b].y! - items[a].y!) * (dist[i] - dist[a])) / Math.max(1e-9, dist[b] - dist[a]);
    }
    out.push({ u: it.p[0], v: it.p[1], y });
  });
  return out.filter((q, i, arr) => i === 0 || Math.hypot(q.u - arr[i - 1].u, q.v - arr[i - 1].v) > 1e-9);
}

export interface LocalStair {
  flights: LFlight[];
  landing: LLanding | null;
  uMin: number; uMax: number; vMin: number; vMax: number;
  exit: { u: number; v: number; du: number; dv: number; au: number; av: number; bu: number; bv: number; width: number };
  outer: { points: LocalPolyPoint[]; interior: 'left' | 'right'; landingSeg: [number, number] | null };
  inner: { points: LocalPolyPoint[]; interior: 'left' | 'right'; breakAt?: number };
  winder: LWinder | null;
  /** marginesy na balustrady (lokalnie) */
  margin: { uMin: number; uMax: number; vMax: number };
}

export const ENTRY_VECTORS: Record<EntryDir, { f: Vec2; r: Vec2 }> = {
  back: { f: { x: 0, z: -1 }, r: { x: 1, z: 0 } },
  front: { f: { x: 0, z: 1 }, r: { x: -1, z: 0 } },
  left: { f: { x: -1, z: 0 }, r: { x: 0, z: -1 } },
  right: { f: { x: 1, z: 0 }, r: { x: 0, z: 1 } },
};

function flightTreads(fi: number, n: number, baseY: number, h: number, s: number, nz: number, map: (along0: number, along1: number) => [number, number, number, number]): LTread[] {
  const out: LTread[] = [];
  for (let i = 1; i <= n - 1; i++) {
    const [u0, u1, v0, v1] = map((i - 1) * s - nz, i * s);
    out.push({ flight: fi, index: i, u0, u1, v0, v1, y: baseY + i * h });
  }
  return out;
}

function mkWinder(P: [number, number], polys: Array<Array<[number, number]>>, n1: number, h: number, corners: Array<[number, number]>, walkR: number, innerR: number, dA: number): LWinder {
  return {
    pu: P[0], pv: P[1], polys: polys.map((pts, j) => ({ pts, y: (n1 + j) * h, index: j + 1 })), corners,
    baseY: n1 * h, topY: (n1 + polys.length - 1) * h, walkGoing: walkR * dA, innerGoing: (innerR + 0.15) * dA,
  };
}

/** Buduje schody w układzie lokalnym dla skrętu w prawo; dla skrętu w lewo — odbicie lustrzane u. */
export function buildLocal(room: RoomConfig, s: StairConfig, calc: Calc, rails: { outer: boolean; inner: boolean; landing: boolean }): LocalStair {
  const h = calc.rise;
  const w = s.width;
  const sg = s.going;
  const nz = s.nosing;
  const H = room.height;
  const [n1, n2] = [calc.flights[0].risers, calc.flights[1]?.risers ?? 0];
  const L1 = (n1 - 1) * sg;
  const L2 = (n2 - 1) * sg;
  let flights: LFlight[] = [];
  let landing: LLanding | null = null;
  let exit: LocalStair['exit'];
  let outer: LocalPolyPoint[] = [];
  let inner: LocalPolyPoint[] = [];
  let landingSeg: [number, number] | null = null;
  let winder: LWinder | null = null;
  let breakAt: number | undefined;
  const k = calc.winders;
  let uMax = w;
  let vMax = L1;
  const mOuter = rails.outer ? LIMITS.railMargin : 0;
  const mInner = rails.inner ? LIMITS.railMargin : 0;
  let margin = { uMin: mOuter, uMax: mInner, vMax: 0 };

  if (s.shape === 'I') {
    flights = [{
      index: 0, risers: n1, treads: n1 - 1, baseY: 0, topY: H, length: L1, ou: w / 2, ov: 0, du: 0, dv: 1, width: w,
      endsAtLanding: false, startsAtLanding: false,
      t: flightTreads(0, n1, 0, h, sg, nz, (a, b) => [0, w, a, b]),
    }];
    exit = { u: w / 2, v: L1, du: 0, dv: 1, au: 0, av: L1, bu: w, bv: L1, width: w };
    outer = [{ u: 0, v: 0, y: h }, { u: 0, v: L1, y: H }];
    inner = [{ u: w, v: 0, y: h }, { u: w, v: L1, y: H }];
    vMax = L1;
  } else if (s.shape === 'L' && k) {
    // zakręt 90° na stopniach zabiegowych w kwadracie w × w
    const y1 = n1 * h;
    const base2 = (n1 + k - 1) * h;
    flights.push({
      index: 0, risers: n1, treads: n1 - 1, baseY: 0, topY: y1, length: L1, ou: w / 2, ov: 0, du: 0, dv: 1, width: w,
      endsAtLanding: true, startsAtLanding: false, t: flightTreads(0, n1, 0, h, sg, nz, (a, b) => [0, w, a, b]),
    });
    const B: Array<[number, number]> = [[0, L1], [0, L1 + w], [w, L1 + w]];
    const P: [number, number] = [w, L1];
    const wp = winderPolygons(P, B, 0, Math.PI / 2, k);
    winder = mkWinder(P, wp.polys, n1, h, [[0, L1 + w]], w / 2, 0, Math.PI / 2 / k);
    flights.push({
      index: 1, risers: n2, treads: n2 - 1, baseY: base2, topY: H, length: L2, ou: w, ov: L1 + w / 2, du: 1, dv: 0, width: w,
      endsAtLanding: false, startsAtLanding: true, t: flightTreads(1, n2, base2, h, sg, nz, (a, b) => [w + a, w + b, L1, L1 + w]),
    });
    exit = { u: w + L2, v: L1 + w / 2, du: 1, dv: 0, au: w + L2, av: L1, bu: w + L2, bv: L1 + w, width: w };
    outer = [{ u: 0, v: 0, y: h }, ...boundaryPath(B, wp.hits, y1, h), { u: w + L2, v: L1 + w, y: H }];
    inner = [{ u: w, v: 0, y: h }, { u: w, v: L1, y: y1 }, { u: w, v: L1, y: base2 + h }, { u: w + L2, v: L1, y: H }];
    breakAt = 2;
    uMax = w + L2;
    vMax = L1 + w;
    margin = { uMin: mOuter, uMax: 0, vMax: mOuter };
  } else if (s.shape === 'L') {
    const ld = Math.max(s.landingDepth, w);
    const lw = Math.max(s.landingWidth, w);
    const yl = n1 * h;
    flights.push({
      index: 0, risers: n1, treads: n1 - 1, baseY: 0, topY: yl, length: L1, ou: w / 2, ov: 0, du: 0, dv: 1, width: w,
      endsAtLanding: true, startsAtLanding: false, t: flightTreads(0, n1, 0, h, sg, nz, (a, b) => [0, w, a, b]),
    });
    landing = { u0: 0, u1: lw, v0: L1 - nz, v1: L1 + ld, y: yl, depth: ld, width: lw, au: 0, av: 1 };
    const v2a = L1 + ld - w;
    const v2b = L1 + ld;
    flights.push({
      index: 1, risers: n2, treads: n2 - 1, baseY: yl, topY: H, length: L2, ou: lw, ov: v2a + w / 2, du: 1, dv: 0, width: w,
      endsAtLanding: false, startsAtLanding: true, t: flightTreads(1, n2, yl, h, sg, nz, (a, b) => [lw + a, lw + b, v2a, v2b]),
    });
    exit = { u: lw + L2, v: v2a + w / 2, du: 1, dv: 0, au: lw + L2, av: v2a, bu: lw + L2, bv: v2b, width: w };
    outer = [
      { u: 0, v: 0, y: h }, { u: 0, v: L1, y: yl }, { u: 0, v: L1 + ld, y: yl },
      { u: lw - sg, v: L1 + ld, y: yl }, { u: lw + L2, v: L1 + ld, y: H },
    ];
    landingSeg = [1, 3];
    inner = [{ u: w, v: 0, y: h }, { u: w, v: L1, y: yl }];
    if (lw > w + 1e-6) inner.push({ u: lw, v: L1, y: yl });
    if (ld > w + 1e-6) inner.push({ u: lw, v: v2a, y: yl });
    inner.push({ u: lw, v: v2a, y: yl + h }, { u: lw + L2, v: v2a, y: H });
    uMax = lw + L2;
    vMax = L1 + ld;
    margin = { uMin: mOuter, uMax: 0, vMax: mOuter };
  } else if (k) {
    // zawrót 180° na stopniach zabiegowych wokół środka szczeliny między biegami
    const ld = Math.max(s.landingDepth, w * 0.8);
    const g = s.gap;
    const y1 = n1 * h;
    const base2 = (n1 + k - 1) * h;
    const Lm = Math.max(L1, L2);
    const T = 2 * w + g;
    flights.push({
      index: 0, risers: n1, treads: n1 - 1, baseY: 0, topY: y1, length: L1, ou: w / 2, ov: Lm - L1, du: 0, dv: 1, width: w,
      endsAtLanding: true, startsAtLanding: false, t: flightTreads(0, n1, 0, h, sg, nz, (a, b) => [0, w, Lm - L1 + a, Lm - L1 + b]),
    });
    const B: Array<[number, number]> = [[0, Lm], [0, Lm + ld], [T, Lm + ld], [T, Lm]];
    const P: [number, number] = [w + g / 2, Lm];
    const wp = winderPolygons(P, B, 0, Math.PI, k);
    winder = mkWinder(P, wp.polys, n1, h, [[0, Lm + ld], [T, Lm + ld]], g / 2 + w / 2, g / 2, Math.PI / k);
    flights.push({
      index: 1, risers: n2, treads: n2 - 1, baseY: base2, topY: H, length: L2, ou: w + g + w / 2, ov: Lm, du: 0, dv: -1, width: w,
      endsAtLanding: false, startsAtLanding: true, t: flightTreads(1, n2, base2, h, sg, nz, (a, b) => [w + g, T, Lm - b, Lm - a]),
    });
    exit = { u: w + g + w / 2, v: Lm - L2, du: 0, dv: -1, au: w + g, av: Lm - L2, bu: T, bv: Lm - L2, width: w };
    outer = [{ u: 0, v: Lm - L1, y: h }, ...boundaryPath(B, wp.hits, y1, h), { u: T, v: Lm - L2, y: H }];
    inner = [{ u: w, v: Lm - L1, y: h }, { u: w, v: Lm, y: y1 }, { u: w + g, v: Lm, y: base2 + h }, { u: w + g, v: Lm - L2, y: H }];
    breakAt = 2;
    uMax = T;
    vMax = Lm + ld;
    margin = { uMin: mOuter, uMax: mOuter, vMax: mOuter };
  } else {
    const ld = s.landingDepth;
    const g = s.gap;
    const yl = n1 * h;
    const Lm = Math.max(L1, L2);
    const T = 2 * w + g;
    flights.push({
      index: 0, risers: n1, treads: n1 - 1, baseY: 0, topY: yl, length: L1, ou: w / 2, ov: Lm - L1, du: 0, dv: 1, width: w,
      endsAtLanding: true, startsAtLanding: false, t: flightTreads(0, n1, 0, h, sg, nz, (a, b) => [0, w, Lm - L1 + a, Lm - L1 + b]),
    });
    landing = { u0: 0, u1: T, v0: Lm - nz, v1: Lm + ld, y: yl, depth: ld, width: T, au: 0, av: 1 };
    flights.push({
      index: 1, risers: n2, treads: n2 - 1, baseY: yl, topY: H, length: L2, ou: w + g + w / 2, ov: Lm, du: 0, dv: -1, width: w,
      endsAtLanding: false, startsAtLanding: true, t: flightTreads(1, n2, yl, h, sg, nz, (a, b) => [w + g, T, Lm - b, Lm - a]),
    });
    exit = { u: w + g + w / 2, v: Lm - L2, du: 0, dv: -1, au: w + g, av: Lm - L2, bu: T, bv: Lm - L2, width: w };
    outer = [
      { u: 0, v: Lm - L1, y: h }, { u: 0, v: Lm, y: yl }, { u: 0, v: Lm + ld, y: yl }, { u: T, v: Lm + ld, y: yl },
      { u: T, v: Lm + Math.min(sg, ld * 0.9), y: yl }, { u: T, v: Lm - L2, y: H },
    ];
    landingSeg = [1, 4];
    inner = [{ u: w, v: Lm - L1, y: h }, { u: w, v: Lm, y: yl }, { u: w + g, v: Lm, y: yl + h }, { u: w + g, v: Lm - L2, y: H }];
    uMax = T;
    vMax = Lm + ld;
    margin = { uMin: mOuter, uMax: mOuter, vMax: mOuter && rails.landing ? mOuter : 0 };
    if (!rails.landing) margin.vMax = 0;
  }
  if (s.shape === 'L' && !rails.landing) margin.vMax = mOuter; // bieg 2 nadal ma balustradę od zewnątrz
  if (k && s.shape === 'U') margin.vMax = mOuter;
  // dla I krawędź zewnętrzna = lewa (wnętrze po prawej), wewnętrzna = prawa (wnętrze po lewej)
  const local: LocalStair = {
    flights, landing, uMin: 0, uMax, vMin: Math.min(...flights.flatMap((f) => f.t.map((t) => t.v0)), 0), vMax, exit: exit!,
    outer: { points: outer, interior: 'right', landingSeg }, inner: { points: inner, interior: 'left', breakAt }, winder, margin,
  };
  if (s.shape !== 'I' && s.turn === 'left') return mirrorLocal(local);
  return local;
}

function mirrorLocal(l: LocalStair): LocalStair {
  const T = l.uMax;
  const mu = (u: number) => T - u;
  return {
    ...l,
    flights: l.flights.map((f) => ({ ...f, ou: mu(f.ou), du: -f.du, t: f.t.map((t) => ({ ...t, u0: mu(t.u1), u1: mu(t.u0) })) })),
    landing: l.landing ? { ...l.landing, u0: mu(l.landing.u1), u1: mu(l.landing.u0) } : null,
    exit: { ...l.exit, u: mu(l.exit.u), du: -l.exit.du, au: mu(l.exit.au), bu: mu(l.exit.bu) },
    outer: { ...l.outer, points: l.outer.points.map((p) => ({ ...p, u: mu(p.u) })), interior: 'left' },
    inner: { points: l.inner.points.map((p) => ({ ...p, u: mu(p.u) })), interior: 'right', breakAt: l.inner.breakAt },
    winder: l.winder ? { ...l.winder, pu: mu(l.winder.pu), polys: l.winder.polys.map((q) => ({ ...q, pts: q.pts.map(([u, v]) => [mu(u), v] as [number, number]) })), corners: l.winder.corners.map(([u, v]) => [mu(u), v] as [number, number]) } : null,
    margin: { uMin: l.margin.uMax, uMax: l.margin.uMin, vMax: l.margin.vMax },
  };
}

export const toWorld = (xf: Xf, u: number, v: number): Vec2 => ({ x: xf.ox + u * xf.rx + v * xf.fx, z: xf.oz + u * xf.rz + v * xf.fz });
export const dirToWorld = (xf: Xf, du: number, dv: number): Vec2 => ({ x: du * xf.rx + dv * xf.fx, z: du * xf.rz + dv * xf.fz });

export function rectToWorld(xf: Xf, u0: number, u1: number, v0: number, v1: number): Rect {
  const a = toWorld(xf, u0, v0);
  const b = toWorld(xf, u1, v1);
  return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
}

/** Rozmieszczenie: wyrównanie rzutu całkowitego wg ustawień i odstępu od ścian. */
export function placeLocal(room: RoomConfig, s: StairConfig, local: LocalStair): Xf {
  const { f, r } = ENTRY_VECTORS[s.entry];
  const base: Xf = { ox: 0, oz: 0, rx: r.x, rz: r.z, fx: f.x, fz: f.z };
  const fp = rectToWorld(base, local.uMin - local.margin.uMin, local.uMax + local.margin.uMax, local.vMin, local.vMax + local.margin.vMax);
  const wFp = fp.maxX - fp.minX;
  const dFp = fp.maxZ - fp.minZ;
  const gap = s.wallGap;
  let minX: number;
  switch (s.alignX) {
    case 'left': minX = gap; break;
    case 'right': minX = room.width - gap - wFp; break;
    case 'manual': minX = s.manualX; break;
    default: minX = (room.width - wFp) / 2;
  }
  let minZ: number;
  switch (s.alignZ) {
    case 'back': minZ = gap; break;
    case 'front': minZ = room.depth - gap - dFp; break;
    case 'manual': minZ = s.manualZ; break;
    default: minZ = (room.depth - dFp) / 2;
  }
  return { ...base, ox: minX - fp.minX, oz: minZ - fp.minZ };
}

export function buildLayout(room: RoomConfig, s: StairConfig, calc: Calc, rails: { outer: boolean; inner: boolean; landing: boolean }): Layout {
  if (s.shape === 'S') return buildSpiralLayout(room, s, calc, rails.outer);
  const local = buildLocal(room, s, calc, rails);
  const xf = placeLocal(room, s, local);
  const flights: FlightEl[] = local.flights.map((f) => {
    const dir = dirToWorld(xf, f.du, f.dv);
    const treadEls: TreadEl[] = f.t.map((t) => ({ flight: t.flight, index: t.index, y: t.y, rect: rectToWorld(xf, t.u0, t.u1, t.v0, t.v1) }));
    return {
      index: f.index, risers: f.risers, treads: f.treads, rise: calc.rise, going: s.going, nosing: s.nosing, width: f.width,
      length: f.length, baseY: f.baseY, topY: f.topY, origin: toWorld(xf, f.ou, f.ov), dir, left: { x: dir.z, z: -dir.x },
      treadEls, endsAtLanding: f.endsAtLanding, startsAtLanding: f.startsAtLanding,
    };
  });
  // lewa ręka = up × forward: dla f=(fx,fz) w (x,z): left = (fz, -fx)
  let landing: LandingEl | null = null;
  if (local.landing) {
    const L = local.landing;
    landing = { rect: rectToWorld(xf, L.u0, L.u1, L.v0, L.v1), y: L.y, depth: L.depth, width: L.width, axis: dirToWorld(xf, L.au, L.av) };
  }
  let winder: WinderEl | null = null;
  if (local.winder) {
    const W = local.winder;
    const treads: TreadEl[] = W.polys.map((q) => {
      const poly = q.pts.map(([u, v]) => toWorld(xf, u, v));
      return { flight: 99, index: q.index, y: q.y, poly, rect: polyRect(poly) };
    });
    winder = {
      pivot: toWorld(xf, W.pu, W.pv), outerCorners: W.corners.map(([u, v]) => toWorld(xf, u, v)), treads,
      baseY: W.baseY, topY: W.topY, walkGoing: W.walkGoing, minInnerGoing: W.innerGoing,
    };
  }
  const structureRect = rectToWorld(xf, local.uMin, local.uMax, local.vMin, local.vMax);
  const footprint = rectToWorld(xf, local.uMin - local.margin.uMin, local.uMax + local.margin.uMax, local.vMin, local.vMax + local.margin.vMax);
  const e = local.exit;
  return {
    shape: s.shape,
    xf,
    flights,
    landing,
    winder,
    spiral: null,
    structureRect,
    footprint,
    localSize: { across: local.uMax - local.uMin, along: local.vMax - local.vMin },
    entry: { point: flights[0].origin, dir: flights[0].dir },
    exit: { point: toWorld(xf, e.u, e.v), dir: dirToWorld(xf, e.du, e.dv), a: toWorld(xf, e.au, e.av), b: toWorld(xf, e.bu, e.bv), width: e.width },
    edges: { outer: local.outer, inner: local.inner },
    mirrored: s.shape !== 'I' && s.turn === 'left',
  };
}

export function polyRect(p: Vec2[]): Rect {
  return { minX: Math.min(...p.map((q) => q.x)), maxX: Math.max(...p.map((q) => q.x)), minZ: Math.min(...p.map((q) => q.z)), maxZ: Math.max(...p.map((q) => q.z)) };
}

/** Wycinek pierścienia (stopień klinowy) jako wielokąt w rzucie. */
export function annulusSector(c: Vec2, r0: number, r1: number, a0: number, a1: number, seg = 8): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    out.push({ x: c.x + r1 * Math.cos(a), z: c.z + r1 * Math.sin(a) });
  }
  for (let i = seg; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / seg;
    out.push({ x: c.x + r0 * Math.cos(a), z: c.z + r0 * Math.sin(a) });
  }
  return out;
}

/**
 * Schody kręcone: kolumna w środku kwadratu 2R × 2R, stopnie klinowe co kąt θ, kierunek obrotu wg `turn`
 * (prawo = zgodnie z ruchem wskazówek zegara patrząc z góry). Na górze podest w ćwiartce kwadratu otworu.
 */
export function buildSpiralLayout(room: RoomConfig, s: StairConfig, calc: Calc, outerRail: boolean): Layout {
  const sp = calc.spiral!;
  const R = sp.radius;
  const m = outerRail ? LIMITS.railMargin : 0;
  const size = 2 * R + 2 * m;
  const gap = s.wallGap;
  const minX = s.alignX === 'left' ? gap : s.alignX === 'right' ? room.width - gap - size : s.alignX === 'manual' ? s.manualX : (room.width - size) / 2;
  const minZ = s.alignZ === 'back' ? gap : s.alignZ === 'front' ? room.depth - gap - size : s.alignZ === 'manual' ? s.manualZ : (room.depth - size) / 2;
  const c: Vec2 = { x: minX + m + R, z: minZ + m + R };
  const { f, r } = ENTRY_VECTORS[s.entry];
  const sense: 1 | -1 = s.turn === 'left' ? -1 : 1;
  // styczna w kierunku obrotu: sense·(−sin φ, cos φ) = f
  const phi0 = Math.atan2(-sense * f.x, sense * f.z);
  const h = calc.rise;
  const nT = calc.risers - 1;
  const th = sp.theta;
  const nzA = s.nosing / sp.walkRadius;
  const treads: TreadEl[] = [];
  for (let i = 1; i <= nT; i++) {
    const a0 = phi0 + sense * ((i - 1) * th - nzA);
    const a1 = phi0 + sense * i * th;
    const poly = annulusSector(c, sp.columnRadius, R, Math.min(a0, a1), Math.max(a0, a1));
    treads.push({ flight: 0, index: i, y: i * h, poly, rect: polyRect(poly) });
  }
  const phiE = phi0 + sense * sp.sweep;
  const e1 = { x: Math.cos(phiE), z: Math.sin(phiE) };
  const e2 = { x: -sense * Math.sin(phiE), z: sense * Math.cos(phiE) }; // = kierunek wyjścia
  const corners = [c, { x: c.x + R * e1.x, z: c.z + R * e1.z }, { x: c.x + R * (e1.x + e2.x), z: c.z + R * (e1.z + e2.z) }, { x: c.x + R * e2.x, z: c.z + R * e2.z }];
  const platformRect = polyRect(corners);
  // prześwit nad samą sobą: stopień nad stopniem po pełnym obrocie
  const selfHeadroom = sp.risersPerTurn * h - s.treadThickness;
  const spiral: SpiralEl = {
    center: c, radius: R, columnRadius: sp.columnRadius, walkRadius: sp.walkRadius, phi0, sense, theta: th, sweep: sp.sweep, treads,
    platform: { rect: platformRect, y: room.height, poly: corners }, selfHeadroom,
  };
  const structureRect: Rect = { minX: c.x - R, maxX: c.x + R, minZ: c.z - R, maxZ: c.z + R };
  const footprint: Rect = { minX: c.x - R - m, maxX: c.x + R + m, minZ: c.z - R - m, maxZ: c.z + R + m };
  const w = R - sp.columnRadius;
  const entryP = { x: c.x + sp.walkRadius * Math.cos(phi0), z: c.z + sp.walkRadius * Math.sin(phi0) };
  const ex = (rr: number) => ({ x: c.x + rr * e1.x, z: c.z + rr * e1.z });
  return {
    shape: 'S', xf: { ox: c.x, oz: c.z, rx: r.x, rz: r.z, fx: f.x, fz: f.z },
    flights: [], landing: null, winder: null, spiral, structureRect, footprint,
    localSize: { across: 2 * R, along: 2 * R },
    entry: { point: entryP, dir: f },
    exit: { point: ex(sp.walkRadius), dir: e2, a: ex(sp.columnRadius), b: ex(R), width: w },
    edges: { outer: { points: [], interior: 'right', landingSeg: null }, inner: { points: [], interior: 'left' } },
    mirrored: sense < 0,
  };
}
