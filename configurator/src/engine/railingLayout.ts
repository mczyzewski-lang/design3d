// Ścieżki balustrad liczone z geometrii schodów.
import { LIMITS } from './catalog';
import { dirToWorld, toWorld } from './layout';
import type { Layout, LocalPolyPoint, OpeningResult, RailPath, RailingConfig, Rect, RoomConfig, Vec2, Vec3, WallKey } from './types';

type P2 = { u: number; v: number };
const sub = (a: P2, b: P2): P2 => ({ u: a.u - b.u, v: a.v - b.v });
const len = (a: P2) => Math.hypot(a.u, a.v);
const norm = (a: P2): P2 => { const l = len(a) || 1; return { u: a.u / l, v: a.v / l }; };
// w układzie lokalnym (u = prawo, v = przód): prawa ręka dla kierunku d = (dv, −du), lewa = (−dv, du)
const rightOf = (d: P2): P2 => ({ u: d.v, v: -d.u });
const leftOf = (d: P2): P2 => ({ u: -d.v, v: d.u });

/** Odsuwa polilinię na zewnątrz (przeciwnie do wnętrza schodów) z mitrowanymi narożnikami; offsets: per segment. */
export function offsetPolyline(pts: LocalPolyPoint[], interior: 'left' | 'right', offsets: number[]): LocalPolyPoint[] {
  const n = pts.length;
  const segDir: Array<P2 | null> = [];
  for (let i = 0; i < n - 1; i++) {
    const d = sub(pts[i + 1], pts[i]);
    segDir.push(len(d) < 1e-9 ? null : norm(d));
  }
  const outward = (d: P2) => (interior === 'right' ? leftOf(d) : rightOf(d));
  const findSeg = (from: number, step: number): number => {
    for (let i = from; i >= 0 && i < n - 1; i += step) if (segDir[i]) return i;
    return -1;
  };
  const out: LocalPolyPoint[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const pi = findSeg(i - 1, -1);
    const ni = findSeg(i, 1);
    if (pi < 0 && ni < 0) { out.push({ ...p }); continue; }
    if (pi < 0 || ni < 0) {
      const si = pi < 0 ? ni : pi;
      const o = outward(segDir[si]!);
      out.push({ u: p.u + o.u * offsets[si], v: p.v + o.v * offsets[si], y: p.y });
      continue;
    }
    const d1 = segDir[pi]!;
    const d2 = segDir[ni]!;
    const o1 = outward(d1);
    const o2 = outward(d2);
    const q1 = { u: p.u + o1.u * offsets[pi], v: p.v + o1.v * offsets[pi] };
    const q2 = { u: p.u + o2.u * offsets[ni], v: p.v + o2.v * offsets[ni] };
    const cross = d1.u * d2.v - d1.v * d2.u;
    if (Math.abs(cross) < 1e-9) {
      out.push({ ...q1, y: p.y });
      if (Math.abs(offsets[pi] - offsets[ni]) > 1e-9) out.push({ ...q2, y: p.y });
      continue;
    }
    // q1 + t d1 = q2 + s d2
    const w = sub(q2, q1);
    const t = (w.u * d2.v - w.v * d2.u) / cross;
    out.push({ u: q1.u + t * d1.u, v: q1.v + t * d1.v, y: p.y });
  }
  return out;
}

const W3 = (layout: Layout, p: LocalPolyPoint): Vec3 => { const w = toWorld(layout.xf, p.u, p.v); return { x: w.x, y: p.y, z: w.z }; };

export interface WallHit { wall: WallKey; present: boolean; dist: number }

/** Najbliższa ściana w kierunku (świat, oś główna) od punktu. */
export function wallInDirection(room: RoomConfig, p: Vec2, n: Vec2): WallHit {
  if (Math.abs(n.x) > Math.abs(n.z)) {
    return n.x > 0 ? { wall: 'right', present: room.walls.right, dist: room.width - p.x } : { wall: 'left', present: room.walls.left, dist: p.x };
  }
  return n.z > 0 ? { wall: 'front', present: room.walls.front, dist: room.depth - p.z } : { wall: 'back', present: room.walls.back, dist: p.z };
}

function segmentOutwardWorld(layout: Layout, a: LocalPolyPoint, b: LocalPolyPoint, interior: 'left' | 'right'): Vec2 | null {
  const d = sub(b, a);
  if (len(d) < 1e-9) return null;
  const o = interior === 'right' ? leftOf(norm(d)) : rightOf(norm(d));
  return dirToWorld(layout.xf, o.u, o.v);
}

function splitByLanding(points: LocalPolyPoint[], seg: [number, number] | null, keepLanding: boolean): LocalPolyPoint[][] {
  if (keepLanding || !seg) return [points];
  return [points.slice(0, seg[0] + 1), points.slice(seg[1])].filter((p) => p.length >= 2);
}

export function buildRailPaths(room: RoomConfig, layout: Layout, opening: OpeningResult, rc: RailingConfig): RailPath[] {
  if (layout.spiral) return spiralRails(room, layout, opening, rc);
  const paths: RailPath[] = [];
  const sides: Array<['outer' | 'inner', typeof rc.outer]> = [['outer', rc.outer], ['inner', rc.inner]];
  for (const [side, mode] of sides) {
    if (mode === 'none') continue;
    const e = side === 'outer' ? layout.edges.outer : layout.edges.inner;
    const brk = layout.edges.inner.breakAt;
    const parts = side === 'outer'
      ? splitByLanding(e.points, layout.edges.outer.landingSeg, rc.landing || mode === 'wallHandrail')
      : brk ? [e.points.slice(0, brk), e.points.slice(brk)].filter((q) => q.length >= 2) : [e.points];
    parts.forEach((pts, pi) => {
      if (mode === 'balustrade') {
        // balustrada tylko wzdłuż otwartych krawędzi: odcinki biegnące przy istniejącej ścianie są pomijane
        const raw: Array<boolean | null> = pts.slice(1).map((b, i) => {
          const a = pts[i];
          if (Math.hypot(b.u - a.u, b.v - a.v) < 0.05) return null; // krótki łącznik — jak sąsiedni odcinek
          const nW = segmentOutwardWorld(layout, a, b, e.interior);
          if (!nW) return null;
          const hit = wallInDirection(room, toWorld(layout.xf, (a.u + b.u) / 2, (a.v + b.v) / 2), nW);
          return hit.present && hit.dist <= LIMITS.wallFlush + 1e-6;
        });
        const atWall = raw.map((v, i) => v ?? raw.slice(0, i).reverse().find((x) => x !== null) ?? raw.slice(i + 1).find((x) => x !== null) ?? false);
        let start = 0;
        let ri = 0;
        for (let i = 0; i <= atWall.length; i++) {
          if (i < atWall.length && !atWall[i]) continue;
          const run = pts.slice(start, i + 1);
          const planLen = run.slice(1).reduce((a, q, j) => a + Math.hypot(q.u - run[j].u, q.v - run[j].v), 0);
          if (i > start && planLen >= 0.3) {
            const off = offsetPolyline(run, e.interior, run.slice(1).map(() => LIMITS.railOffset));
            paths.push({ id: `${side}-${pi}${ri ? `-${ri}` : ''}`, kind: 'balustrade', scope: 'stair', side, points: off.map((p) => W3(layout, p)) });
            ri++;
          }
          start = i + 1;
        }
        return;
      }
      // pochwyt przyścienny: oś rury 6,5 cm od lica najbliższej ściany
      const offsets: number[] = [];
      let noWall = false;
      for (let i = 0; i < pts.length - 1; i++) {
        const nW = segmentOutwardWorld(layout, pts[i], pts[i + 1], e.interior);
        if (!nW) { offsets.push(0.06); continue; }
        const mid = toWorld(layout.xf, (pts[i].u + pts[i + 1].u) / 2, (pts[i].v + pts[i + 1].v) / 2);
        const hit = wallInDirection(room, mid, nW);
        if (hit.present && hit.dist <= 0.4) offsets.push(Math.max(0.03, hit.dist - 0.065));
        else { offsets.push(0.06); noWall = true; }
      }
      const off = offsetPolyline(pts, e.interior, offsets);
      const world = off.map((p) => W3(layout, p));
      const brackets: RailPath['wallBrackets'] = [];
      for (let i = 0; i < world.length - 1; i++) {
        const a = world[i];
        const b = world[i + 1];
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        if (L < 0.05) continue;
        const nW = segmentOutwardWorld(layout, pts[Math.min(i, pts.length - 2)], pts[Math.min(i + 1, pts.length - 1)], e.interior);
        if (!nW) continue;
        const k = Math.max(1, Math.ceil(L / 1.0));
        for (let j = 0; j <= k; j++) {
          if (j === 0 && i > 0) continue;
          const t = (j + 0.5) / (k + 1);
          const at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + 0.9, z: a.z + (b.z - a.z) * t };
          const hit = wallInDirection(room, at, nW);
          if (!hit.present || hit.dist > 0.12) continue;
          brackets.push({ at, to: { x: at.x + nW.x * hit.dist, y: at.y, z: at.z + nW.z * hit.dist } });
        }
      }
      paths.push({ id: `${side}-wall-${pi}`, kind: 'wallHandrail', scope: 'stair', side, points: world, noWall, wallBrackets: brackets });
    });
  }
  if (rc.opening) paths.push(...openingRails(room, layout, opening));
  return paths;
}

/** Balustrada wokół otworu w stropie — bez krawędzi wyjścia (nad ostatnim biegiem) i krawędzi przy ścianach. */
export function openingRails(room: RoomConfig, layout: Layout, opening: OpeningResult): RailPath[] {
  const r = opening.rect;
  const d = LIMITS.railOffset;
  const R: Rect = { minX: r.minX - d, maxX: r.maxX + d, minZ: r.minZ - d, maxZ: r.maxZ + d };
  const y = room.height;
  const adj = LIMITS.wallAdjacent;
  const nearWall: Record<WallKey, boolean> = {
    back: room.walls.back && r.minZ <= adj + 1e-6,
    front: room.walls.front && room.depth - r.maxZ <= adj + 1e-6,
    left: room.walls.left && r.minX <= adj + 1e-6,
    right: room.walls.right && room.width - r.maxX <= adj + 1e-6,
  };
  // obwód w kolejności: tył (minZ, x rośnie), prawo (maxX, z rośnie), przód (maxZ, x maleje), lewo (minX, z maleje)
  const edges: Array<{ side: WallKey; a: Vec2; b: Vec2 }> = [
    { side: 'back', a: { x: R.minX, z: R.minZ }, b: { x: R.maxX, z: R.minZ } },
    { side: 'right', a: { x: R.maxX, z: R.minZ }, b: { x: R.maxX, z: R.maxZ } },
    { side: 'front', a: { x: R.maxX, z: R.maxZ }, b: { x: R.minX, z: R.maxZ } },
    { side: 'left', a: { x: R.minX, z: R.maxZ }, b: { x: R.minX, z: R.minZ } },
  ];
  const ex = layout.exit;
  const segs: Array<[Vec2, Vec2]> = [];
  for (const e of edges) {
    if (nearWall[e.side]) continue;
    if (e.side !== opening.exitSide) { segs.push([e.a, e.b]); continue; }
    // krawędź wyjścia: pomiń odcinek nad ostatnim biegiem
    const alongX = e.side === 'back' || e.side === 'front';
    const c = (p: Vec2) => (alongX ? p.x : p.z);
    const lo = Math.min(c(ex.a), c(ex.b));
    const hi = Math.max(c(ex.a), c(ex.b));
    const ea = c(e.a);
    const eb = c(e.b);
    const mk = (t: number): Vec2 => (alongX ? { x: t, z: e.a.z } : { x: e.a.x, z: t });
    const emin = Math.min(ea, eb);
    const emax = Math.max(ea, eb);
    const parts: Array<[number, number]> = [];
    if (lo - emin > 0.15) parts.push([emin, lo]);
    if (emax - hi > 0.15) parts.push([hi, emax]);
    for (const [p0, p1] of parts) segs.push(ea < eb ? [mk(p0), mk(p1)] : [mk(p1), mk(p0)]);
  }
  return joinSegments(segs).map((l, i) => ({ id: `opening-${i}`, kind: 'balustrade', scope: 'opening', side: 'opening', points: l.map((p) => ({ x: p.x, y, z: p.z })) }));
}

/** Łączy kolejne odcinki (stykające się końcami) w polilinie, także zamykając pętlę. */
export function joinSegments(segs: Array<[Vec2, Vec2]>): Vec2[][] {
  const lines: Vec2[][] = [];
  for (const [a, b] of segs) {
    const last = lines[lines.length - 1];
    if (last && Math.hypot(last[last.length - 1].x - a.x, last[last.length - 1].z - a.z) < 1e-6) last.push(b);
    else lines.push([a, b]);
  }
  if (lines.length > 1) {
    const first = lines[0];
    const last = lines[lines.length - 1];
    const le = last[last.length - 1];
    if (Math.hypot(le.x - first[0].x, le.z - first[0].z) < 1e-6) { lines[0] = [...last, ...first.slice(1)]; lines.pop(); }
  }
  return lines;
}

/** Schody kręcone: balustrada po helisie na zewnętrznym promieniu + balustrada otworu (bez ćwiartki podestu i krawędzi wyjścia). */
export function spiralRails(room: RoomConfig, layout: Layout, opening: OpeningResult, rc: RailingConfig): RailPath[] {
  const sp = layout.spiral!;
  const c = sp.center;
  const out: RailPath[] = [];
  const nT = sp.treads.length;
  const h = room.height / (nT + 1);
  if (rc.outer !== 'none') {
    const r = sp.radius + LIMITS.railOffset;
    const pts: Vec3[] = [];
    const steps = nT * 2;
    for (let i = 0; i <= steps; i++) {
      const p = (i / steps) * nT;
      const a = sp.phi0 + sp.sense * p * sp.theta;
      pts.push({ x: c.x + r * Math.cos(a), y: h + p * h, z: c.z + r * Math.sin(a) });
    }
    out.push({ id: 'spiral-outer', kind: 'balustrade', scope: 'stair', side: 'outer', points: pts, smooth: true });
  }
  if (!rc.opening) return out;
  const d = LIMITS.railOffset;
  const o = opening.rect;
  const R: Rect = { minX: o.minX - d, maxX: o.maxX + d, minZ: o.minZ - d, maxZ: o.maxZ + d };
  const pr = sp.platform.rect;
  const qx = Math.sign((pr.minX + pr.maxX) / 2 - c.x);
  const qz = Math.sign((pr.minZ + pr.maxZ) / 2 - c.z);
  const adj = LIMITS.wallAdjacent;
  const near = (side: WallKey) => (side === 'back' ? room.walls.back && o.minZ <= adj : side === 'front' ? room.walls.front && room.depth - o.maxZ <= adj : side === 'left' ? room.walls.left && o.minX <= adj : room.walls.right && room.width - o.maxX <= adj);
  const sides: Array<{ side: WallKey; a: Vec2; b: Vec2 }> = [
    { side: 'back', a: { x: R.minX, z: R.minZ }, b: { x: R.maxX, z: R.minZ } },
    { side: 'right', a: { x: R.maxX, z: R.minZ }, b: { x: R.maxX, z: R.maxZ } },
    { side: 'front', a: { x: R.maxX, z: R.maxZ }, b: { x: R.minX, z: R.maxZ } },
    { side: 'left', a: { x: R.minX, z: R.maxZ }, b: { x: R.minX, z: R.minZ } },
  ];
  const segs: Array<[Vec2, Vec2]> = [];
  for (const sd of sides) {
    if (near(sd.side)) continue;
    const mid = sd.side === 'back' || sd.side === 'front' ? { x: c.x, z: sd.a.z } : { x: sd.a.x, z: c.z };
    for (const [a, b] of [[sd.a, mid], [mid, sd.b]] as Array<[Vec2, Vec2]>) {
      const mx = Math.sign((a.x + b.x) / 2 - c.x) || Math.sign(a.x - c.x);
      const mz = Math.sign((a.z + b.z) / 2 - c.z) || Math.sign(a.z - c.z);
      if (mx === qx && mz === qz) continue; // krawędź przy podeście — przejście na strop
      segs.push([a, b]);
    }
  }
  const y = room.height;
  joinSegments(segs).forEach((l, i) => out.push({ id: `opening-${i}`, kind: 'balustrade', scope: 'opening', side: 'opening', points: l.map((p) => ({ x: p.x, y, z: p.z })) }));
  // krawędź podestu od strony otworu (promień e2)
  const e2 = layout.exit.dir;
  const rEnd = Math.min(o.maxX - c.x, c.x - o.minX, o.maxZ - c.z, c.z - o.minZ) + d;
  out.push({
    id: 'platform-edge', kind: 'balustrade', scope: 'opening', side: 'opening',
    points: [{ x: c.x + e2.x * (sp.columnRadius + 0.03) - 0, y, z: c.z + e2.z * (sp.columnRadius + 0.03) }, { x: c.x + e2.x * rEnd, y, z: c.z + e2.z * rEnd }],
  });
  return out;
}

export function pathLength(p: Vec3[]): number {
  let L = 0;
  for (let i = 0; i < p.length - 1; i++) L += Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y, p[i + 1].z - p[i].z);
  return L;
}

export function pathPlanLength(p: Vec3[]): number {
  let L = 0;
  for (let i = 0; i < p.length - 1; i++) L += Math.hypot(p[i + 1].x - p[i].x, p[i + 1].z - p[i].z);
  return L;
}
