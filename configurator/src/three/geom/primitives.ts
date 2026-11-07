// Prymitywy geometrii + scalanie per materiał. Działa w Node (testy) — bez WebGL.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type MatKey = 'steel' | 'wood' | 'riser' | 'led' | 'railSteel' | 'railWood' | 'glass' | 'glassEdge' | 'perforated' | 'mesh';

/** Zbiera geometrie per materiał; na końcu scala w jedną siatkę na materiał. */
export class Parts {
  readonly map = new Map<MatKey, THREE.BufferGeometry[]>();
  readonly counts: Record<string, number> = {};
  add(mat: MatKey, g: THREE.BufferGeometry, m?: THREE.Matrix4, tag?: string): void {
    if (m) g.applyMatrix4(m);
    const list = this.map.get(mat) ?? [];
    list.push(normalize(g));
    this.map.set(mat, list);
    if (tag) this.counts[tag] = (this.counts[tag] ?? 0) + 1;
  }
  merge(): Partial<Record<MatKey, THREE.BufferGeometry>> {
    const out: Partial<Record<MatKey, THREE.BufferGeometry>> = {};
    for (const [k, list] of this.map) {
      if (!list.length) continue;
      const g = mergeGeometries(list, false);
      if (!g) throw new Error(`mergeGeometries failed for ${k}`);
      g.computeBoundingBox();
      g.computeBoundingSphere();
      out[k] = g;
      list.forEach((x) => x.dispose());
    }
    return out;
  }
  elementCount(mat?: MatKey): number {
    if (mat) return this.map.get(mat)?.length ?? 0;
    let n = 0;
    for (const l of this.map.values()) n += l.length;
    return n;
  }
}

/** toNonIndexed + wspólny zestaw atrybutów (position, normal, uv) — warunek scalania. */
export function normalize(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  for (const name of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(name)) n.deleteAttribute(name);
  if (!n.attributes.normal) n.computeVertexNormals();
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((n.attributes.position.count) * 2), 2));
  n.clearGroups();
  return n;
}

/** Mapowanie planarne UV w metrach (wg dominującej osi normalnej), z przesunięciem. */
export function meterUV(g: THREE.BufferGeometry, offU = 0, offV = 0): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng !== g) g.dispose();
  if (!ng.attributes.normal) ng.computeVertexNormals();
  const p = ng.attributes.position;
  const nrm = ng.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const nz = Math.abs(nrm.getZ(i));
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) { u = p.getX(i); v = p.getZ(i); }
    else if (nx >= nz) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u + offU;
    uv[i * 2 + 1] = v + offV;
  }
  ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return ng;
}

const _m = new THREE.Matrix4();

/** Prostopadłościan od min do max (w układzie lokalnym), opcjonalnie zaokrąglony; UV w metrach. */
export function boxMinMax(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, opts: { rounded?: number; uvOff?: [number, number] } = {}): THREE.BufferGeometry {
  const w = Math.max(1e-4, x1 - x0);
  const h = Math.max(1e-4, y1 - y0);
  const d = Math.max(1e-4, z1 - z0);
  let g: THREE.BufferGeometry;
  if (opts.rounded && opts.rounded > 0) {
    const r = Math.min(opts.rounded, h / 2.05, w / 2.05, d / 2.05);
    g = new RoundedBoxGeometry(w, h, d, 2, r);
  } else g = new THREE.BoxGeometry(w, h, d);
  g.applyMatrix4(_m.makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  return meterUV(g, opts.uvOff?.[0] ?? 0, opts.uvOff?.[1] ?? 0);
}

/** Belka o przekroju (wx × hy) między punktami a i b. Baza prawoskrętna (det = +1). */
export function beam(a: THREE.Vector3, b: THREE.Vector3, wx: number, hy: number, upHint = new THREE.Vector3(0, 1, 0)): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const L = dir.length();
  const z = dir.clone().normalize();
  let x = new THREE.Vector3().crossVectors(upHint, z);
  if (x.lengthSq() < 1e-8) x = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), z);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const g = new THREE.BoxGeometry(wx, hy, Math.max(L, 1e-4));
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  m.setPosition(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5));
  g.applyMatrix4(m);
  return meterUV(g);
}

/** Walec (pręt, rura) między punktami. */
export function cyl(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 10): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a);
  const L = dir.length();
  const g = new THREE.CylinderGeometry(r, r, Math.max(L, 1e-4), seg, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

export function sphere(c: THREE.Vector3, r: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 10, 8);
  g.translate(c.x, c.y, c.z);
  return g;
}

export type P2 = [number, number];

/** Sutherland–Hodgman: przycięcie wielokąta półpłaszczyzną a·p ≥ c (p = [z, y]). */
export function clipHalf(poly: P2[], a: P2, c: number): P2[] {
  const out: P2[] = [];
  const val = (p: P2) => a[0] * p[0] + a[1] * p[1] - c;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const vp = val(p);
    const vq = val(q);
    if (vp >= 0) out.push(p);
    if ((vp >= 0) !== (vq >= 0)) {
      const t = vp / (vp - vq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/**
 * Wyciąga profil zdefiniowany w płaszczyźnie (z, y) układu biegu na grubość `thick` wzdłuż x, od x0 do x0 + thick.
 * Mapowanie: kształt X → z, kształt Y → y, ekstruzja Z → −x (macierz o wyznaczniku +1, normalne nie odwracają się).
 */
export function extrudeZY(poly: P2[], x0: number, thick: number): THREE.BufferGeometry {
  // orientacja przeciwna do ruchu wskazówek zegara dla Shape
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    area += x1 * y2 - x2 * y1;
  }
  const pts = area < 0 ? [...poly].reverse() : poly;
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, steps: 1 });
  const m = new THREE.Matrix4().set(
    0, 0, -1, x0 + thick,
    0, 1, 0, 0,
    1, 0, 0, 0,
    0, 0, 0, 1,
  );
  g.applyMatrix4(m);
  return meterUV(g);
}

/** Pryzmat (panel) o podstawie czworokąta p0..p3 (w kolejności), pogrubiony o `thick` wzdłuż normalnej. */
export function panelPrism(p: THREE.Vector3[], thick: number): THREE.BufferGeometry {
  const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[3], p[0])).normalize().multiplyScalar(thick / 2);
  const f = p.map((q) => q.clone().add(n));
  const b = p.map((q) => q.clone().sub(n));
  const tris: THREE.Vector3[] = [];
  const quad = (a: THREE.Vector3, bb: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => tris.push(a, bb, c, a, c, d);
  quad(f[0], f[1], f[2], f[3]);
  quad(b[3], b[2], b[1], b[0]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(b[i], b[j], f[j], f[i]);
  }
  const g = new THREE.BufferGeometry().setFromPoints(tris);
  g.computeVertexNormals();
  // UV: odległość wzdłuż krawędzi dolnej i wysokość
  const along = new THREE.Vector3().subVectors(p[1], p[0]).setY(0).normalize();
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(p[0]);
    uv[i * 2] = v.dot(along);
    uv[i * 2 + 1] = pos.getY(i);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Pojedynczy czworokąt (dwustronny w materiale) z UV w metrach. */
export function quadPlane(p: THREE.Vector3[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry().setFromPoints([p[0], p[1], p[2], p[0], p[2], p[3]]);
  g.computeVertexNormals();
  const along = new THREE.Vector3().subVectors(p[1], p[0]).setY(0).normalize();
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(p[0]);
    uv[i * 2] = v.dot(along);
    uv[i * 2 + 1] = pos.getY(i);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function seeded(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Wyciąga wielokąt zdefiniowany w rzucie (x, z) w pionie od y0 do y1.
 * Kształt (X, Y) → świat (x, z); ekstruzja Z → −y; obrót wokół X o +90° (wyznacznik +1).
 */
export function extrudePlan(poly: Array<{ x: number; z: number }>, y0: number, y1: number, uvOff: [number, number] = [0, 0]): THREE.BufferGeometry {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.z - b.x * a.z;
  }
  const pts = area < 0 ? [...poly].reverse() : poly;
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, y1 - y0), bevelEnabled: false, steps: 1, curveSegments: 1 });
  // (X, Y, Z) → (X, −Z, Y): obrót o +90° wokół X
  g.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  g.translate(0, y1, 0);
  return meterUV(g, uvOff[0], uvOff[1]);
}
