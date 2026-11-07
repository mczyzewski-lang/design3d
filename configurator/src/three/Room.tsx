// Pomieszczenie: posadzka z desek, ściany z grubością (obecne/nieobecne), strop z otworem, posadzka piętra.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LIMITS } from '../engine/catalog';
import { slabExtent } from '../engine/opening';
import type { Config, Rect, Solved, WallKey } from '../engine/types';
import type { ViewState } from '../store/store';
import type { Materials } from './materials';

interface Props { config: Config; solved: Solved; view: ViewState; mats: Materials }

const SECTION_H = 1.05;

export function Room({ config, solved, view, mats }: Props) {
  const { room } = config;
  const W = room.width;
  const D = room.depth;
  const H = room.height;
  const T = room.wallThickness;
  const slab = slabExtent(room);
  const wallH = H + 1.2;
  const sectionMode = view.wallMode === 'section' || view.camera === 'section';
  const slabVisible = view.showSlab && view.camera !== 'section' && view.camera !== 'top';

  const walls = useMemo(() => {
    const list: Array<{ key: WallKey; pos: [number, number, number]; size: [number, number, number] }> = [];
    const ext = (k: WallKey) => (room.walls[k] ? T : 0);
    if (room.walls.back) list.push({ key: 'back', pos: [W / 2, 0, -T / 2], size: [W + ext('left') + ext('right'), 1, T] });
    if (room.walls.front) list.push({ key: 'front', pos: [W / 2, 0, D + T / 2], size: [W + ext('left') + ext('right'), 1, T] });
    if (room.walls.left) list.push({ key: 'left', pos: [-T / 2, 0, D / 2], size: [T, 1, D] });
    if (room.walls.right) list.push({ key: 'right', pos: [W + T / 2, 0, D / 2], size: [T, 1, D] });
    // przesunięcie X dla ścian tył/przód, gdy brakuje bocznej
    for (const w of list) if (w.key === 'back' || w.key === 'front') w.pos[0] = W / 2 + (ext('right') - ext('left')) / 2;
    return list;
  }, [room.walls, W, D, T]);

  const refs = useRef<Partial<Record<WallKey, THREE.Mesh>>>({});
  // automatyczne ukrywanie ścian od strony kamery — per klatka, bez re-renderu React
  useFrame(({ camera }) => {
    for (const w of walls) {
      const m = refs.current[w.key];
      if (!m) continue;
      let vis = true;
      if (view.wallMode === 'auto' || view.camera === 'section') {
        const p = camera.position;
        if (w.key === 'back') vis = p.z > 0;
        if (w.key === 'front') vis = p.z < D;
        if (w.key === 'left') vis = p.x > 0;
        if (w.key === 'right') vis = p.x < W;
        if (view.camera === 'top') vis = true;
      } else if (view.wallMode === 'selected') vis = view.selectedWalls[w.key];
      m.visible = vis;
    }
  });

  const wallHeight = sectionMode ? SECTION_H : wallH;
  const wallMat = view.wallMode === 'transparent' && view.camera !== 'section' ? mats.wallGhost : mats.wall;

  // strop jako pierścień wokół otworu
  const slabPieces = useMemo(() => ringPieces(slab, solved.opening.rect), [slab.minX, slab.maxX, slab.minZ, slab.maxZ, solved.opening.rect]);
  const t = room.slabThickness;

  return (
    <group>
      {/* grunt poza pokojem */}
      <mesh rotation-x={-Math.PI / 2} position={[W / 2, -0.002, D / 2]} receiveShadow material={mats.ground}>
        <planeGeometry args={[W + 30, D + 30]} />
      </mesh>
      {/* posadzka z desek (także poza pokojem przy brakujących ścianach) */}
      <mesh rotation-x={-Math.PI / 2} position={[(slab.minX + slab.maxX) / 2, 0, (slab.minZ + slab.maxZ) / 2]} receiveShadow material={mats.floor}>
        <planeGeometry args={[slab.maxX - slab.minX, slab.maxZ - slab.minZ]} />
      </mesh>
      {walls.map((w) => (
        <group key={w.key}>
          <mesh
            ref={(m) => { refs.current[w.key] = m ?? undefined; }}
            position={[w.pos[0], wallHeight / 2, w.pos[2]]}
            scale={[1, wallHeight, 1]}
            castShadow
            receiveShadow
            material={wallMat}
          >
            <boxGeometry args={w.size} />
          </mesh>
          <WallOutline pos={[w.pos[0], wallHeight / 2, w.pos[2]]} size={[w.size[0], wallHeight, w.size[2]]} />
        </group>
      ))}
      {slabVisible && (
        <group>
          {slabPieces.map((r, i) => (
            <group key={i}>
              <mesh position={[(r.minX + r.maxX) / 2, H - t / 2, (r.minZ + r.maxZ) / 2]} castShadow receiveShadow material={mats.slab}>
                <boxGeometry args={[r.maxX - r.minX, t - 0.012, r.maxZ - r.minZ]} />
              </mesh>
              <mesh position={[(r.minX + r.maxX) / 2, H - 0.006, (r.minZ + r.maxZ) / 2]} receiveShadow castShadow material={mats.upperFloor}>
                <boxGeometry args={[r.maxX - r.minX, 0.012, r.maxZ - r.minZ]} />
              </mesh>
            </group>
          ))}
        </group>
      )}
      {!slabVisible && <RectOutline rect={solved.opening.rect} y={H + 0.01} color="#8a6a46" dashed />}
    </group>
  );
}

/** Prostokąt stropu minus otwór → do 4 prostokątów. */
export function ringPieces(s: Rect, o: Rect): Rect[] {
  const oc: Rect = { minX: Math.max(o.minX, s.minX), maxX: Math.min(o.maxX, s.maxX), minZ: Math.max(o.minZ, s.minZ), maxZ: Math.min(o.maxZ, s.maxZ) };
  const out: Rect[] = [];
  if (oc.minZ - s.minZ > 1e-3) out.push({ minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: oc.minZ });
  if (s.maxZ - oc.maxZ > 1e-3) out.push({ minX: s.minX, maxX: s.maxX, minZ: oc.maxZ, maxZ: s.maxZ });
  if (oc.minX - s.minX > 1e-3) out.push({ minX: s.minX, maxX: oc.minX, minZ: oc.minZ, maxZ: oc.maxZ });
  if (s.maxX - oc.maxX > 1e-3) out.push({ minX: oc.maxX, maxX: s.maxX, minZ: oc.minZ, maxZ: oc.maxZ });
  return out;
}

function WallOutline({ pos, size }: { pos: [number, number, number]; size: [number, number, number] }) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), [size[0], size[1], size[2]]);
  return (
    <lineSegments geometry={geo} position={pos}>
      <lineBasicMaterial color="#9a958c" transparent opacity={0.35} />
    </lineSegments>
  );
}

export function RectOutline({ rect, y, color, dashed = false }: { rect: Rect; y: number; color: string; dashed?: boolean }) {
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(rect.minX, y, rect.minZ), new THREE.Vector3(rect.maxX, y, rect.minZ), new THREE.Vector3(rect.maxX, y, rect.maxZ),
      new THREE.Vector3(rect.minX, y, rect.maxZ), new THREE.Vector3(rect.minX, y, rect.minZ),
    ]);
    const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.08, gapSize: 0.05 }) : new THREE.LineBasicMaterial({ color });
    const l = new THREE.Line(g, m);
    if (dashed) l.computeLineDistances();
    return l;
  }, [rect.minX, rect.maxX, rect.minZ, rect.maxZ, y, color, dashed]);
  return <primitive object={line} />;
}

export const SLAB_EXT = LIMITS.slabExtension;
