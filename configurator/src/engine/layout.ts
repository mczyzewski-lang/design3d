// Generacja schodów I / L / U w układzie lokalnym (u = prawa ręka idącego, v = kierunek wejścia)
// i rozmieszczenie w pokoju (rotacja wg kierunku wejścia + przesunięcie wg wyrównania).
import { LIMITS } from './catalog';
import type { Calc, EntryDir, FlightEl, LandingEl, Layout, LocalPolyPoint, Rect, RoomConfig, StairConfig, TreadEl, Vec2, Xf } from './types';

interface LTread { flight: number; index: number; u0: number; u1: number; v0: number; v1: number; y: number }
interface LFlight {
  index: number; risers: number; treads: number; baseY: number; topY: number; length: number;
  ou: number; ov: number; du: number; dv: number; width: number; endsAtLanding: boolean; startsAtLanding: boolean; t: LTread[];
}
interface LLanding { u0: number; u1: number; v0: number; v1: number; y: number; depth: number; width: number; au: number; av: number }

export interface LocalStair {
  flights: LFlight[];
  landing: LLanding | null;
  uMin: number; uMax: number; vMin: number; vMax: number;
  exit: { u: number; v: number; du: number; dv: number; au: number; av: number; bu: number; bv: number; width: number };
  outer: { points: LocalPolyPoint[]; interior: 'left' | 'right'; landingSeg: [number, number] | null };
  inner: { points: LocalPolyPoint[]; interior: 'left' | 'right' };
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
  // dla I krawędź zewnętrzna = lewa (wnętrze po prawej), wewnętrzna = prawa (wnętrze po lewej)
  const local: LocalStair = {
    flights, landing, uMin: 0, uMax, vMin: Math.min(...flights.flatMap((f) => f.t.map((t) => t.v0)), 0), vMax, exit: exit!,
    outer: { points: outer, interior: 'right', landingSeg }, inner: { points: inner, interior: 'left' }, margin,
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
    inner: { points: l.inner.points.map((p) => ({ ...p, u: mu(p.u) })), interior: 'right' },
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
  const structureRect = rectToWorld(xf, local.uMin, local.uMax, local.vMin, local.vMax);
  const footprint = rectToWorld(xf, local.uMin - local.margin.uMin, local.uMax + local.margin.uMax, local.vMin, local.vMax + local.margin.vMax);
  const e = local.exit;
  return {
    shape: s.shape,
    xf,
    flights,
    landing,
    structureRect,
    footprint,
    localSize: { across: local.uMax - local.uMin, along: local.vMax - local.vMin },
    entry: { point: flights[0].origin, dir: flights[0].dir },
    exit: { point: toWorld(xf, e.u, e.v), dir: dirToWorld(xf, e.du, e.dv), a: toWorld(xf, e.au, e.av), b: toWorld(xf, e.bu, e.bv), width: e.width },
    edges: { outer: local.outer, inner: local.inner },
    mirrored: s.shape !== 'I' && s.turn === 'left',
  };
}
