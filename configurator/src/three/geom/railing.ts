// 7 typów balustrad + pochwyt przyścienny, budowane wzdłuż ścieżek z engine/railingLayout.
import * as THREE from 'three';
import { railingSpec } from '../../engine/catalog';
import type { Config, RailPath, Solved, Vec3 } from '../../engine/types';
import { Parts, beam, boxMinMax, cyl, panelPrism, quadPlane, sphere, type MatKey } from './primitives';

export interface RailingMeta { paths: number; infill: number; posts: number; panels: number; tags: Record<string, number> }
export interface RailingGeometry { geoms: Partial<Record<MatKey, THREE.BufferGeometry>>; meta: RailingMeta }

export function railingGeometryKey(c: Config, s: Solved): string {
  const r = c.railing;
  return JSON.stringify([s.key, r.handrail, r.handrailMaterial]);
}

const V = (p: Vec3, dy = 0) => new THREE.Vector3(p.x, p.y + dy, p.z);
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
const planLen = (a: Vec3, b: Vec3) => Math.hypot(b.x - a.x, b.z - a.z);

function handrail(P: Parts, mat: MatKey, shape: Config['railing']['handrail'], a: THREE.Vector3, b: THREE.Vector3) {
  if (a.distanceTo(b) < 1e-4) return;
  if (shape === 'round') P.add(mat, cyl(a, b, 0.021, 14), undefined, 'handrail');
  else if (shape === 'rect') P.add(mat, beam(a, b, 0.05, 0.04), undefined, 'handrail');
  else P.add(mat, beam(a, b, 0.06, 0.012), undefined, 'handrail');
}

export function buildRailingGeometry(c: Config, s: Solved): RailingGeometry {
  const P = new Parts();
  const rc = c.railing;
  const spec = railingSpec(rc.type);
  const H = rc.height;
  const hrMat: MatKey = rc.handrailMaterial === 'wood' ? 'railWood' : 'railSteel';
  const meta: RailingMeta = { paths: 0, infill: 0, posts: 0, panels: 0, tags: P.counts };

  for (const path of s.rails) {
    meta.paths++;
    if (path.kind === 'wallHandrail') { wallHandrail(P, path, hrMat); continue; }
    const pts = path.points;
    const glass = rc.type === 'glass';
    const hasPosts = spec.hasPosts;
    // pochwyt ciągły z przegubami w narożnikach
    for (let i = 0; i < pts.length - 1; i++) handrail(P, hrMat, rc.handrail, V(pts[i], H), V(pts[i + 1], H));
    if (rc.handrail === 'round') for (let i = 1; i < pts.length - 1; i++) P.add(hrMat, sphere(V(pts[i], H), 0.021), undefined, 'joint');
    // słupki: w narożnikach i na końcach (oprócz szkła), dodatkowo co ≤ 1 m dla wypełnień panelowych / poziomych
    const postAt = (p: Vec3) => {
      const bottom = path.scope === 'opening' ? p.y : p.y - 0.12;
      P.add('railSteel', boxMinMax(p.x - 0.02, p.x + 0.02, bottom, p.y + H - 0.02, p.z - 0.02, p.z + 0.02), undefined, 'post');
      meta.posts++;
    };
    if (!glass) pts.forEach((p, i) => { if (i === 0 || i === pts.length - 1 || planLen(pts[i - 1], p) > 1e-6) postAt(p); });

    for (let i = 0; i < pts.length - 1; i++) {
      const A = pts[i];
      const B = pts[i + 1];
      const Lp = planLen(A, B);
      if (Lp < 0.04) continue;
      // podział segmentu na pola między słupkami (co ≤ 1 m)
      const fields = hasPosts ? Math.max(1, Math.ceil(Lp / 1.0)) : 1;
      for (let k = 1; k < fields; k++) postAt(lerp(A, B, k / fields));
      const ins = (glass ? 0.008 : 0.025) / Lp;
      switch (rc.type) {
        case 'verticalBars':
        case 'flatBars': {
          P.add('railSteel', beam(V(A, 0.08), V(B, 0.08), 0.03, 0.012), undefined, 'bottomRail');
          const n = Math.max(1, Math.floor(Lp / rc.spacing));
          for (let j = 0; j < n; j++) {
            const t = (j + 0.5) / n;
            const p = lerp(A, B, t);
            if (rc.type === 'verticalBars') P.add('railSteel', cyl(V(p, 0.08), V(p, H - 0.02), rc.profile / 2, 8), undefined, 'bar');
            else {
              const d = new THREE.Vector3(B.x - A.x, 0, B.z - A.z).normalize();
              const a = V(p, 0.08);
              const b = V(p, H - 0.02);
              P.add('railSteel', beam(a, b, rc.profile, 0.008, d), undefined, 'bar');
            }
            meta.infill++;
          }
          break;
        }
        case 'horizontalBars': {
          for (let y = 0.1; y <= H - 0.08 + 1e-6; y += rc.spacing) {
            P.add('railSteel', cyl(V(A, y), V(B, y), rc.profile / 2, 8), undefined, 'bar');
            meta.infill++;
          }
          break;
        }
        case 'perforated':
        case 'mesh':
        case 'solid': {
          for (let k = 0; k < fields; k++) {
            const t0 = k / fields + ins;
            const t1 = (k + 1) / fields - ins;
            const a = lerp(A, B, t0);
            const b = lerp(A, B, t1);
            const y0 = 0.06;
            const y1 = H - 0.06;
            const quad = [V(a, y0), V(b, y0), V(b, y1), V(a, y1)];
            if (rc.type === 'solid') P.add('railSteel', panelPrism(quad, 0.004), undefined, 'panel');
            else P.add(rc.type, quadPlane(quad), undefined, 'panel');
            // rama panelu
            P.add('railSteel', beam(V(a, y0), V(b, y0), 0.02, 0.02), undefined, 'panelFrame');
            P.add('railSteel', beam(V(a, y1), V(b, y1), 0.02, 0.02), undefined, 'panelFrame');
            P.add('railSteel', boxMinMax(a.x - 0.01, a.x + 0.01, a.y + y0, a.y + y1, a.z - 0.01, a.z + 0.01), undefined, 'panelFrame');
            P.add('railSteel', boxMinMax(b.x - 0.01, b.x + 0.01, b.y + y0, b.y + y1, b.z - 0.01, b.z + 0.01), undefined, 'panelFrame');
            meta.panels++;
            meta.infill++;
          }
          break;
        }
        case 'glass': {
          const a = lerp(A, B, ins);
          const b = lerp(A, B, 1 - ins);
          const y0 = path.scope === 'opening' ? 0.02 : -0.1;
          const y1 = H - 0.035;
          const quad = [V(a, y0), V(b, y0), V(b, y1), V(a, y1)];
          P.add('glass', panelPrism(quad, rc.glassThickness), undefined, 'glassPanel');
          // widoczne zielonkawe krawędzie
          const e = 0.003;
          const th = rc.glassThickness * 0.9;
          P.add('glassEdge', beam(V(a, y0), V(b, y0), th, e), undefined, 'glassEdge');
          P.add('glassEdge', beam(V(a, y1), V(b, y1), th, e), undefined, 'glassEdge');
          P.add('glassEdge', beam(V(a, y0), V(a, y1), th, e, new THREE.Vector3(B.x - A.x, 0, B.z - A.z).normalize()), undefined, 'glassEdge');
          P.add('glassEdge', beam(V(b, y0), V(b, y1), th, e, new THREE.Vector3(B.x - A.x, 0, B.z - A.z).normalize()), undefined, 'glassEdge');
          // uchwyty punktowe (prostopadle do tafli)
          const nrm = new THREE.Vector3(-(B.z - A.z), 0, B.x - A.x).normalize().multiplyScalar(0.035);
          const holders = Math.max(2, Math.ceil(Lp / 0.6) + 1);
          for (let j = 0; j < holders; j++) {
            const p = lerp(a, b, (j + 0.5) / holders);
            const c0 = V(p, path.scope === 'opening' ? 0.08 : -0.05);
            P.add('railSteel', cyl(c0.clone().sub(nrm), c0.clone().add(nrm), 0.022, 12), undefined, 'glassFixing');
          }
          meta.panels++;
          meta.infill++;
          break;
        }
      }
    }
  }
  return { geoms: P.merge(), meta };
}

function wallHandrail(P: Parts, path: RailPath, mat: MatKey) {
  const pts = path.points;
  const h = 0.9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = V(pts[i], h);
    const b = V(pts[i + 1], h);
    if (a.distanceTo(b) > 1e-4) P.add(mat, cyl(a, b, 0.021, 14), undefined, 'wallRail');
  }
  for (let i = 1; i < pts.length - 1; i++) P.add(mat, sphere(V(pts[i], h), 0.021), undefined, 'joint');
  for (const br of path.wallBrackets ?? []) {
    const a = new THREE.Vector3(br.at.x, br.at.y, br.at.z);
    const b = new THREE.Vector3(br.to.x, br.to.y, br.to.z);
    P.add('railSteel', cyl(a, b, 0.007, 8), undefined, 'bracket');
    const d = new THREE.Vector3().subVectors(b, a).normalize();
    P.add('railSteel', cyl(b.clone().sub(d.clone().multiplyScalar(0.008)), b, 0.03, 16), undefined, 'rosette');
  }
}
