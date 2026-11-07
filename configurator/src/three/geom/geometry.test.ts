import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_CONFIG, cloneConfig } from '../../engine/defaults';
import { solve } from '../../engine/solve';
import type { Config, LandingSupport, RailingType, StructureType } from '../../engine/types';
import { buildStairGeometry, stairGeometryKey } from './stair';
import { buildRailingGeometry, railingGeometryKey } from './railing';
import { extrudeZY } from './primitives';

const cfg = (p: (c: Config) => void = () => {}): Config => {
  const c = cloneConfig(DEFAULT_CONFIG);
  p(c);
  return c;
};
const STRUCTS: StructureType[] = ['centralBeam', 'sideStringers', 'zigzag', 'bentPlate', 'weldedFrame'];
const vcount = (g?: THREE.BufferGeometry) => g?.attributes.position.count ?? 0;

describe('D: konstrukcje stalowe', () => {
  test('belka centralna vs dwa policzki: różna liczba elementów i geometria stali', () => {
    const a = buildStairGeometry(DEFAULT_CONFIG, solve(DEFAULT_CONFIG));
    const c2 = cfg((c) => { c.structure.type = 'sideStringers'; });
    const b = buildStairGeometry(c2, solve(c2));
    expect(a.meta.steelElements).not.toBe(b.meta.steelElements);
    expect(vcount(a.geoms.steel)).not.toBe(vcount(b.geoms.steel));
    expect(a.meta.tags.rib).toBe(18);
    expect(b.meta.tags.angle).toBe(18 * 4);
    const bbA = a.geoms.steel!.boundingBox!;
    const bbB = b.geoms.steel!.boundingBox!;
    expect(bbA.equals(bbB)).toBe(false);
  });
  test('każda z 5 konstrukcji daje inną geometrię stali', () => {
    const sig = STRUCTS.map((t) => {
      const c = cfg((x) => { x.structure.type = t; });
      const g = buildStairGeometry(c, solve(c));
      return `${g.meta.steelElements}:${vcount(g.geoms.steel)}`;
    });
    expect(new Set(sig).size).toBe(5);
  });
  test('jedna siatka na materiał (scalanie) i komplet atrybutów', () => {
    const g = buildStairGeometry(DEFAULT_CONFIG, solve(DEFAULT_CONFIG));
    for (const geo of Object.values(g.geoms)) {
      expect(geo!.index).toBeNull();
      expect(Object.keys(geo!.attributes).sort()).toEqual(['normal', 'position', 'uv']);
    }
    expect(g.meta.tags.tread).toBe(18);
  });
  test('rama spawana: słupy pośrednie pod biegami > 1,6 m sięgają posadzki', () => {
    const c = cfg((x) => { x.structure.type = 'weldedFrame'; });
    const g = buildStairGeometry(c, solve(c));
    const inter = g.meta.posts.filter((p) => p.kind === 'intermediate');
    expect(inter.length).toBeGreaterThan(0);
    for (const p of inter) expect(p.yBottom).toBe(0);
  });
});

describe('H: podparcie spocznika U dla każdej konstrukcji', () => {
  const supports: LandingSupport[] = ['none', 'fourPosts', 'framePosts', 'wall'];
  for (const t of STRUCTS) {
    for (const sup of supports) {
      test(`${t} / ${sup}`, () => {
        const c = cfg((x) => { x.structure.type = t; x.structure.landingSupport = sup; });
        const g = buildStairGeometry(c, solve(c));
        expect(g.meta.landingFrame).toBe(true);
        const lp = g.meta.posts.filter((p) => p.kind === 'landing');
        if (sup === 'none') {
          expect(lp.length).toBe(0);
          expect(g.meta.continuousBeams).toBe(2);
          expect(g.meta.tags.continuousBeam).toBeGreaterThanOrEqual(2);
        }
        if (sup === 'fourPosts') {
          expect(lp.length).toBe(4);
          for (const p of lp) expect(p.yBottom).toBe(0);
          for (const p of lp) expect(p.yTop).toBeGreaterThan(1);
        }
        if (sup === 'framePosts') expect(lp.length).toBe(2);
        if (sup === 'wall') {
          // domyślnie spocznik przy tylnej ścianie (8 cm) — blacha kotwiąca, słupy tylko przy wolnych narożach
          expect(g.meta.wallAnchors).toBeGreaterThanOrEqual(1);
          expect(lp.length).toBeLessThan(4);
        }
      });
    }
  }
});

describe('E: balustrady', () => {
  test('pręty pionowe vs blacha perforowana — inna geometria', () => {
    const a = buildRailingGeometry(DEFAULT_CONFIG, solve(DEFAULT_CONFIG));
    const c2 = cfg((c) => { c.railing.type = 'perforated'; });
    const b = buildRailingGeometry(c2, solve(c2));
    expect(a.geoms.perforated).toBeUndefined();
    expect(b.geoms.perforated).toBeDefined();
    expect(a.meta.tags.bar).toBeGreaterThan(30);
    expect(b.meta.tags.panel).toBeGreaterThan(0);
    expect(vcount(a.geoms.railSteel)).not.toBe(vcount(b.geoms.railSteel));
  });
  test('7 typów daje 7 różnych geometrii', () => {
    const types: RailingType[] = ['verticalBars', 'flatBars', 'horizontalBars', 'perforated', 'mesh', 'solid', 'glass'];
    const sig = types.map((t) => {
      const c = cfg((x) => { x.railing.type = t; });
      const g = buildRailingGeometry(c, solve(c));
      return Object.entries(g.geoms).map(([k, v]) => `${k}${vcount(v)}`).sort().join('|');
    });
    expect(new Set(sig).size).toBe(7);
  });
  test('szkło: bez słupków, z uchwytami i krawędziami', () => {
    const c = cfg((x) => { x.railing.type = 'glass'; });
    const g = buildRailingGeometry(c, solve(c));
    expect(g.meta.posts).toBe(0);
    expect(g.geoms.glass).toBeDefined();
    expect(g.geoms.glassEdge).toBeDefined();
    expect(g.meta.tags.glassFixing).toBeGreaterThan(0);
  });
  test('pochwyt przyścienny przy ścianie ma uchwyty', () => {
    const c = cfg((x) => { x.stairs.shape = 'I'; x.room.depth = 6.5; x.stairs.alignX = 'left'; x.railing.outer = 'wallHandrail'; x.railing.inner = 'balustrade'; });
    const s = solve(c);
    expect(s.rails.find((r) => r.kind === 'wallHandrail')!.noWall).toBe(false);
    const g = buildRailingGeometry(c, s);
    expect(g.meta.tags.bracket).toBeGreaterThan(1);
  });
});

describe('F: zmiana drewna nie przebudowuje geometrii', () => {
  test('klucze geometrii i tożsamość layoutu bez zmian', () => {
    const a = cfg();
    const b = cfg((c) => { c.treads.wood = 'oakBlack'; c.steel.preset = 'white'; c.steel.color = '#fff'; c.steel.finish = 'brushed'; c.lighting.ledTemp = 4000; });
    const sa = solve(a);
    const sb = solve(b);
    expect(sb.layout).toBe(sa.layout);
    expect(stairGeometryKey(a, sa)).toBe(stairGeometryKey(b, sb));
    expect(railingGeometryKey(a, sa)).toBe(railingGeometryKey(b, sb));
  });
});

describe('ekstruzja profilu', () => {
  test('macierz o wyznaczniku +1 — normalne skierowane na zewnątrz', () => {
    const g = extrudeZY([[0, 0], [1, 0], [1, 0.5], [0, 0.5]], 0, 0.01);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    expect(bb.min.x).toBeCloseTo(0);
    expect(bb.max.x).toBeCloseTo(0.01);
    // objętość ze znakiem z twierdzenia o dywergencji > 0 ⇔ normalne na zewnątrz
    const p = g.attributes.position;
    let vol = 0;
    for (let i = 0; i < p.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(p, i);
      const b = new THREE.Vector3().fromBufferAttribute(p, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(p, i + 2);
      vol += a.dot(b.clone().cross(c)) / 6;
    }
    expect(vol).toBeGreaterThan(0);
    expect(vol).toBeCloseTo(0.005, 5);
  });
});

describe('stal nie przebija stopnic', () => {
  for (const t of STRUCTS) {
    test(t, () => {
      const c = cfg((x) => { x.structure.type = t; });
      const s = solve(c);
      const g = buildStairGeometry(c, s);
      const mesh = new THREE.Mesh(g.geoms.steel!, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      const th = c.stairs.treadThickness;
      const rc = new THREE.Raycaster();
      let hits = 0;
      for (const f of s.layout.flights) for (const tr of f.treadEls) {
        for (let a = 0.05; a <= 0.95; a += 0.1) for (const b of [0.03, 0.5, 0.97]) {
          const x = tr.rect.minX + (tr.rect.maxX - tr.rect.minX) * a;
          const z = tr.rect.minZ + (tr.rect.maxZ - tr.rect.minZ) * b;
          rc.set(new THREE.Vector3(x, tr.y - 0.001, z), new THREE.Vector3(0, -1, 0));
          rc.far = th - 0.004;
          if (rc.intersectObject(mesh).length) hits++;
        }
      }
      expect(hits).toBe(0);
    });
  }
});
