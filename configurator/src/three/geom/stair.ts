// Stal + stopnice + spocznik dla 5 konstrukcji. Każdy bieg budowany w układzie biegu
// (x = lewa ręka, y = góra, z = kierunek marszu; początek na linii pierwszego podnoszenia, środek szerokości).
import * as THREE from 'three';
import { LIMITS } from '../../engine/catalog';
import type { Config, FlightEl, Solved, StructureType, WallKey } from '../../engine/types';
import { Parts, boxMinMax, clipHalf, extrudeZY, seeded, type MatKey, type P2 } from './primitives';

export interface PostInfo { x: number; z: number; yBottom: number; yTop: number; kind: 'landing' | 'intermediate' }

export interface StairMeta {
  structure: StructureType;
  elements: number;
  steelElements: number;
  woodElements: number;
  posts: PostInfo[];
  continuousBeams: number;
  landingFrame: boolean;
  wallAnchors: number;
  tags: Record<string, number>;
}

export interface StairGeometry {
  geoms: Partial<Record<MatKey, THREE.BufferGeometry>>;
  meta: StairMeta;
}

/** Klucz geometrii schodów — bez materiałów (zmiana drewna/koloru nie przebudowuje). */
export function stairGeometryKey(c: Config, s: Solved): string {
  return JSON.stringify([s.key, c.structure, c.treads.edge]);
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function flightMatrix(f: FlightEl): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeBasis(V(f.left.x, 0, f.left.z), V(0, 1, 0), V(f.dir.x, 0, f.dir.z));
  m.setPosition(f.origin.x, f.baseY, f.origin.z);
  return m;
}

/** Pozycje x belek nośnych w układzie biegu i ich przekrój (szer. × wys.). */
export function stringerSpec(type: StructureType, w: number): { xs: number[]; sw: number; sh: number } {
  switch (type) {
    case 'centralBeam': return { xs: [0], sw: 0.12, sh: 0.2 };
    case 'sideStringers': return { xs: [w / 2 - 0.006, -(w / 2 - 0.006)], sw: 0.012, sh: 0.26 };
    case 'zigzag': return { xs: [w / 2 - 0.1, -(w / 2 - 0.1)], sw: 0.012, sh: 0.2 };
    case 'bentPlate': return { xs: [w / 4, -w / 4], sw: 0.01, sh: 0.12 };
    case 'weldedFrame': return { xs: [w / 2 - 0.05, -(w / 2 - 0.05)], sw: 0.05, sh: 0.1 };
  }
}

interface Ctx { c: Config; s: Solved; P: Parts; t: number; nz: number; rounded: number; uvSeed: number; postsOut: PostInfo[] }

function addTread(ctx: Ctx, m: THREE.Matrix4, x0: number, x1: number, i: number, h: number, sg: number, flight: number) {
  const g = boxMinMax(x0, x1, i * h - ctx.t, i * h, (i - 1) * sg - ctx.nz, i * sg, {
    rounded: ctx.rounded, uvOff: [seeded(flight * 31 + i) * 3, seeded(flight * 17 + i * 7) * 2],
  });
  ctx.P.add('wood', g, m, 'tread');
  // taśma LED pod noskiem
  ctx.P.add('led', boxMinMax(x0 + 0.02, x1 - 0.02, i * h - ctx.t - 0.006, i * h - ctx.t - 0.001, (i - 1) * sg - ctx.nz + 0.012, (i - 1) * sg - ctx.nz + 0.024), m, 'led');
}

function addRisers(ctx: Ctx, m: THREE.Matrix4, f: FlightEl, x0: number, x1: number) {
  const h = f.rise;
  const sg = f.going;
  for (let i = 1; i <= f.risers; i++) {
    const z = (i - 1) * sg;
    const top = i * h - ctx.t;
    const bottom = (i - 1) * h;
    if (top - bottom < 0.02) continue;
    ctx.P.add('wood', boxMinMax(x0, x1, bottom, top, z - 0.018, z), m, 'riser');
  }
}

/** Belka/płyta w spadku: górna krawędź na linii yTop(z) = k·z + c, przycięta do biegu. */
function slopedPlate(f: FlightEl, cTop: number, depthV: number, zMin: number, zMax: number, yMin: number, yMax: number): P2[] {
  const k = f.rise / f.going;
  const far = 50;
  let poly: P2[] = [
    [-far, -k * far + cTop], [far, k * far + cTop], [far, k * far + cTop - depthV], [-far, -k * far + cTop - depthV],
  ];
  poly = clipHalf(poly, [1, 0], zMin);
  poly = clipHalf(poly, [-1, 0], -zMax);
  poly = clipHalf(poly, [0, 1], yMin);
  poly = clipHalf(poly, [0, -1], -yMax);
  return poly;
}

function zigzagProfile(f: FlightEl, t: number, depthPerp: number, startsAtLanding: boolean): P2[] {
  const h = f.rise;
  const sg = f.going;
  const n = f.risers;
  const k = h / sg;
  const cos = Math.cos(Math.atan(k));
  const Dv = depthPerp / cos;
  const L = f.length;
  const top = n * h - t;
  const yBot = startsAtLanding ? -0.12 : 0;
  const pts: P2[] = [[0, yBot], [0, h - t]];
  for (let i = 1; i <= n - 1; i++) {
    pts.push([i * sg, i * h - t]);
    if (i < n - 1) pts.push([i * sg, (i + 1) * h - t]);
  }
  pts.push([L, top]);
  const yLowEnd = k * L - t - Dv;
  pts.push([L, Math.min(yLowEnd, top - 0.05)]);
  const zf = (yBot + t + Dv) / k;
  pts.push([Math.max(0.001, zf), yBot]);
  return pts;
}

function buildFlight(ctx: Ctx, f: FlightEl) {
  const { c, P } = ctx;
  const type = c.structure.type;
  const m = flightMatrix(f);
  const w = f.width;
  const h = f.rise;
  const sg = f.going;
  const n = f.risers;
  const L = f.length;
  const t = ctx.t;
  const k = h / sg;
  const theta = Math.atan(k);
  const cos = Math.cos(theta);
  const topRel = f.topY - f.baseY;
  const spec = stringerSpec(type, w);
  const closed = c.structure.closedRisers && type !== 'centralBeam' && type !== 'weldedFrame';
  const yMinPlate = f.startsAtLanding ? -0.3 : 0;
  const plateStartZ = f.startsAtLanding ? 0 : -ctx.nz - 0.01;

  // płyty kotwiące
  const anchorFoot = (x: number) => {
    if (!f.startsAtLanding) P.add('steel', boxMinMax(x - 0.09, x + 0.09, 0, 0.012, 0.0, 0.25), m, 'anchorPlate');
  };
  const anchorTop = (x: number) => {
    if (!f.endsAtLanding) P.add('steel', boxMinMax(x - 0.1, x + 0.1, topRel - c.room.slabThickness + 0.02, topRel - 0.02, L - 0.012, L), m, 'anchorPlate');
  };

  if (type === 'centralBeam') {
    // górna krawędź belki pod TYLNYMI dolnymi narożami stopnic (linia k·z − t), szczelina na żebra
    const cTop = -t - 0.035;
    const Dv = spec.sh / cos;
    const poly = slopedPlate(f, cTop, Dv, f.startsAtLanding ? 0 : -ctx.nz, L, yMinPlate, topRel);
    P.add('steel', extrudeZY(poly, -spec.sw / 2, spec.sw), m, 'stringer');
    for (let i = 1; i <= n - 1; i++) {
      const zm = (i - 0.5) * sg;
      const under = i * h - t;
      const beamTop = Math.max(f.startsAtLanding ? -1 : 0, k * zm + cTop);
      P.add('steel', boxMinMax(-0.006, 0.006, beamTop - 0.03, under - 0.008, zm - sg * 0.32, zm + sg * 0.32), m, 'rib');
      P.add('steel', boxMinMax(-w * 0.3, w * 0.3, under - 0.008, under, (i - 1) * sg + 0.02, i * sg - 0.03), m, 'flatBar');
    }
    anchorFoot(0);
    anchorTop(0);
    for (let i = 1; i <= n - 1; i++) addTread(ctx, m, -w / 2, w / 2, i, h, sg, f.index);
  } else if (type === 'sideStringers') {
    const cTop = h + 0.05;
    const Dv = spec.sh / cos;
    const poly = slopedPlate(f, cTop, Dv, plateStartZ, L, yMinPlate, topRel + 0.05);
    for (const x of spec.xs) {
      const x0 = x > 0 ? x - spec.sw / 2 : x - spec.sw / 2;
      P.add('steel', extrudeZY(poly, x0, spec.sw), m, 'stringer');
      anchorFoot(x);
      anchorTop(x);
    }
    const inner = w / 2 - 0.012;
    for (let i = 1; i <= n - 1; i++) {
      addTread(ctx, m, -inner, inner, i, h, sg, f.index);
      for (const sgn of [1, -1]) {
        const xo = sgn * inner;
        const xi = sgn * (inner - 0.04);
        const [xa, xb] = sgn > 0 ? [xi, xo] : [xo, xi];
        P.add('steel', boxMinMax(xa, xb, i * h - t - 0.004, i * h - t, (i - 1) * sg + 0.01, i * sg - 0.03), m, 'angle');
        const [xc, xd] = sgn > 0 ? [xo - 0.004, xo] : [xo, xo + 0.004];
        P.add('steel', boxMinMax(xc, xd, i * h - t - 0.04, i * h - t, (i - 1) * sg + 0.01, i * sg - 0.03), m, 'angle');
      }
    }
    if (closed) addRisers(ctx, m, f, -inner, inner);
  } else if (type === 'zigzag') {
    const prof = zigzagProfile(f, t, spec.sh, f.startsAtLanding);
    for (const x of spec.xs) {
      P.add('steel', extrudeZY(prof, x - spec.sw / 2, spec.sw), m, 'stringer');
      anchorFoot(x);
      anchorTop(x);
    }
    for (let i = 1; i <= n - 1; i++) addTread(ctx, m, -w / 2, w / 2, i, h, sg, f.index);
    if (closed) addRisers(ctx, m, f, -w / 2 + 0.01, w / 2 - 0.01);
  } else if (type === 'bentPlate') {
    const pt = 0.01;
    for (let i = 1; i <= n - 1; i++) {
      P.add('steel', boxMinMax(-w / 2, w / 2, i * h - t - pt, i * h - t, (i - 1) * sg - ctx.nz, i * sg), m, 'bentStep');
      addTread(ctx, m, -w / 2, w / 2, i, h, sg, f.index);
    }
    for (let i = 1; i <= n; i++) {
      const z = (i - 1) * sg - ctx.nz;
      const y0 = i === 1 ? (f.startsAtLanding ? -t : 0) : (i - 1) * h - t - pt;
      const y1 = i * h - t;
      P.add('steel', boxMinMax(-w / 2, w / 2, y0, y1, z, z + pt), m, 'bentRiser');
    }
    // ukryte żebra usztywniające
    const prof = zigzagProfile(f, t + pt, spec.sh, f.startsAtLanding);
    for (const x of spec.xs) P.add('steel', extrudeZY(prof, x - 0.004, 0.008), m, 'stringer');
    anchorFoot(0);
    anchorTop(0);
    if (closed) addRisers(ctx, m, f, -w / 2 + 0.005, w / 2 - 0.005);
  } else if (type === 'weldedFrame') {
    const fr = 0.03;
    // podłużnice pod tylnymi narożami ramek stopnic
    const cTop = -t - fr - 0.02;
    const Dv = spec.sh / cos;
    const yc = (z: number) => k * z + cTop - Dv / 2;
    const poly = slopedPlate(f, cTop, Dv, f.startsAtLanding ? 0 : -ctx.nz, L, yMinPlate, topRel);
    for (const x of spec.xs) {
      P.add('steel', extrudeZY(poly, x - spec.sw / 2, spec.sw), m, 'stringer');
      anchorFoot(x);
      anchorTop(x);
    }
    const inset = 0.03;
    for (let i = 1; i <= n - 1; i++) {
      const y1 = i * h - t;
      const y0 = y1 - fr;
      const z0 = (i - 1) * sg - ctx.nz + inset;
      const z1 = i * sg - inset;
      const xw = w / 2 - inset;
      P.add('steel', boxMinMax(-xw, xw, y0, y1, z0, z0 + fr), m, 'frame');
      P.add('steel', boxMinMax(-xw, xw, y0, y1, z1 - fr, z1), m, 'frame');
      P.add('steel', boxMinMax(-xw, -xw + fr, y0, y1, z0, z1), m, 'frame');
      P.add('steel', boxMinMax(xw - fr, xw, y0, y1, z0, z1), m, 'frame');
      const zm = (i - 0.5) * sg;
      for (const x of spec.xs) {
        const sTop = k * zm + cTop;
        if (y0 > sTop) P.add('steel', boxMinMax(x - fr / 2, x + fr / 2, sTop - 0.02, y0, zm - fr / 2, zm + fr / 2), m, 'framePost');
      }
      addTread(ctx, m, -w / 2, w / 2, i, h, sg, f.index);
    }
    // słupy pośrednie pod długimi biegami
    if (L > 1.6) {
      const cnt = Math.floor(L / 1.6);
      for (let j = 1; j <= cnt; j++) {
        const z = (L * j) / (cnt + 1);
        for (const x of spec.xs) {
          const yTop = yc(z) - Dv / 2;
          P.add('steel', boxMinMax(x - 0.03, x + 0.03, -f.baseY, yTop, z - 0.03, z + 0.03), m, 'column');
          P.add('steel', boxMinMax(x - 0.08, x + 0.08, -f.baseY, -f.baseY + 0.01, z - 0.08, z + 0.08), m, 'anchorPlate');
          const wp = new THREE.Vector3(x, 0, z).applyMatrix4(m);
          ctx.postsOut.push({ x: wp.x, z: wp.z, yBottom: 0, yTop: f.baseY + yTop, kind: 'intermediate' });
        }
      }
    }
  }
}

function landingStructure(ctx: Ctx, meta: StairMeta) {
  const { c, s, P } = ctx;
  const Ld = s.layout.landing;
  if (!Ld) return;
  const r = Ld.rect;
  const y = Ld.y;
  const t = ctx.t;
  const support = c.structure.landingSupport;
  const depth = support === 'none' ? 0.2 : 0.14;
  const bw = 0.06;
  const yTop = y - t;
  const yBot = yTop - depth;
  // okładzina drewniana spocznika
  P.add('wood', boxMinMax(r.minX, r.maxX, y - t, y, r.minZ, r.maxZ, { rounded: ctx.rounded, uvOff: [0.37, 0.11] }), undefined, 'landingTop');
  P.add('led', boxMinMax(r.minX + 0.02, r.maxX - 0.02, y - t - 0.006, y - t - 0.001, r.minZ + 0.012, r.minZ + 0.024), undefined, 'led');
  // rama skrzynkowa (obwód) + poprzeczki
  P.add('steel', boxMinMax(r.minX, r.maxX, yBot, yTop, r.minZ, r.minZ + bw), undefined, 'landingFrame');
  P.add('steel', boxMinMax(r.minX, r.maxX, yBot, yTop, r.maxZ - bw, r.maxZ), undefined, 'landingFrame');
  P.add('steel', boxMinMax(r.minX, r.minX + bw, yBot, yTop, r.minZ, r.maxZ), undefined, 'landingFrame');
  P.add('steel', boxMinMax(r.maxX - bw, r.maxX, yBot, yTop, r.minZ, r.maxZ), undefined, 'landingFrame');
  const spanX = r.maxX - r.minX > r.maxZ - r.minZ;
  const mid = spanX ? (r.minX + r.maxX) / 2 : (r.minZ + r.maxZ) / 2;
  if (spanX) P.add('steel', boxMinMax(mid - bw / 2, mid + bw / 2, yBot + 0.03, yTop, r.minZ, r.maxZ), undefined, 'landingFrame');
  else P.add('steel', boxMinMax(r.minX, r.maxX, yBot + 0.03, yTop, mid - bw / 2, mid + bw / 2), undefined, 'landingFrame');
  meta.landingFrame = true;

  // belki biegów przechodzące pod spocznikiem (ciągłość konstrukcji) — dla każdej konstrukcji
  for (const f of s.layout.flights) {
    const spec = stringerSpec(c.structure.type, f.width);
    const m = flightMatrix(f);
    const ext = f.endsAtLanding
      ? (c.stairs.shape === 'L' ? Math.max(c.stairs.landingDepth, f.width) : c.stairs.landingDepth)
      : c.stairs.shape === 'L' ? Math.max(c.stairs.landingWidth, f.width) : c.stairs.landingDepth;
    const yRel = yTop - f.baseY;
    const sh = Math.min(spec.sh, depth);
    for (const x of spec.xs) {
      if (f.endsAtLanding) P.add('steel', boxMinMax(x - spec.sw / 2, x + spec.sw / 2, yRel - sh, yRel, f.length, f.length + ext), m, 'continuousBeam');
      else if (f.startsAtLanding) P.add('steel', boxMinMax(x - spec.sw / 2, x + spec.sw / 2, yRel - sh, yRel, -ext, 0), m, 'continuousBeam');
    }
    meta.continuousBeams++;
  }

  // podparcie
  const corners: Array<{ x: number; z: number; edges: [WallKey, WallKey] }> = [
    { x: r.minX, z: r.minZ, edges: ['left', 'back'] }, { x: r.maxX, z: r.minZ, edges: ['right', 'back'] },
    { x: r.minX, z: r.maxZ, edges: ['left', 'front'] }, { x: r.maxX, z: r.maxZ, edges: ['right', 'front'] },
  ];
  const room = c.room;
  const adj: Record<WallKey, boolean> = {
    left: room.walls.left && r.minX <= LIMITS.wallAdjacent, right: room.walls.right && room.width - r.maxX <= LIMITS.wallAdjacent,
    back: room.walls.back && r.minZ <= LIMITS.wallAdjacent, front: room.walls.front && room.depth - r.maxZ <= LIMITS.wallAdjacent,
  };
  const post = (x: number, z: number) => {
    const px = Math.min(Math.max(x, r.minX + 0.05), r.maxX - 0.05);
    const pz = Math.min(Math.max(z, r.minZ + 0.05), r.maxZ - 0.05);
    P.add('steel', boxMinMax(px - 0.04, px + 0.04, 0, yBot, pz - 0.04, pz + 0.04), undefined, 'landingPost');
    P.add('steel', boxMinMax(px - 0.09, px + 0.09, 0, 0.012, pz - 0.09, pz + 0.09), undefined, 'anchorPlate');
    ctx.postsOut.push({ x: px, z: pz, yBottom: 0, yTop: yBot, kind: 'landing' });
  };
  if (support === 'fourPosts') corners.forEach((k) => post(k.x, k.z));
  else if (support === 'framePosts') {
    // dalsza krawędź = w kierunku biegu 1
    const a = Ld.axis;
    const far = corners.filter((k) => (Math.abs(a.x) > 0.5 ? (a.x > 0 ? k.x === r.maxX : k.x === r.minX) : a.z > 0 ? k.z === r.maxZ : k.z === r.minZ));
    far.forEach((k) => post(k.x, k.z));
  } else if (support === 'wall') {
    // blachy kotwiące przy przylegających ścianach; słupy tylko przy wolnych narożach
    (Object.keys(adj) as WallKey[]).forEach((wk) => {
      if (!adj[wk]) return;
      meta.wallAnchors++;
      const pl = 0.012;
      if (wk === 'left') P.add('steel', boxMinMax(r.minX - pl - Math.max(0, r.minX), r.minX, yBot, yTop, r.minZ + 0.05, r.maxZ - 0.05), undefined, 'wallAnchor');
      if (wk === 'right') P.add('steel', boxMinMax(r.maxX, room.width, yBot, yTop, r.minZ + 0.05, r.maxZ - 0.05), undefined, 'wallAnchor');
      if (wk === 'back') P.add('steel', boxMinMax(r.minX + 0.05, r.maxX - 0.05, yBot, yTop, Math.min(0, r.minZ) - pl, r.minZ), undefined, 'wallAnchor');
      if (wk === 'front') P.add('steel', boxMinMax(r.minX + 0.05, r.maxX - 0.05, yBot, yTop, r.maxZ, room.depth), undefined, 'wallAnchor');
    });
    corners.forEach((k) => { if (!adj[k.edges[0]] && !adj[k.edges[1]]) post(k.x, k.z); });
  }
}

export function buildStairGeometry(c: Config, s: Solved): StairGeometry {
  const P = new Parts();
  const postsOut: PostInfo[] = [];
  const ctx: Ctx = { c, s, P, t: c.stairs.treadThickness, nz: c.stairs.nosing, rounded: c.treads.edge === 'rounded' ? 0.008 : 0, uvSeed: 0, postsOut };
  const meta: StairMeta = { structure: c.structure.type, elements: 0, steelElements: 0, woodElements: 0, posts: postsOut, continuousBeams: 0, landingFrame: false, wallAnchors: 0, tags: P.counts };
  for (const f of s.layout.flights) buildFlight(ctx, f);
  landingStructure(ctx, meta);
  meta.steelElements = P.elementCount('steel');
  meta.woodElements = P.elementCount('wood');
  meta.elements = P.elementCount();
  return { geoms: P.merge(), meta };
}
