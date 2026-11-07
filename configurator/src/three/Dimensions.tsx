// Linie wymiarowe ze strzałkami; etykiety przez warstwę DOM (useLabels).
import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { dimensionSpecs, type DimSpec, type DimView } from '../engine/dimensions';
import type { Config, Solved } from '../engine/types';
import { useLabels, type LabelSpec } from './Labels';

const COLORS: Record<DimSpec['kind'], string> = { room: '#3d3a35', stair: '#8a5a2b', gap: '#2f7a55', opening: '#6a5acd', vertical: '#3d3a35' };

function dimLines(d: DimSpec): { main: THREE.Vector3[]; ext: THREE.Vector3[][]; arrows: THREE.Vector3[][]; mid: THREE.Vector3 } {
  const a = new THREE.Vector3(d.a.x, d.a.y, d.a.z);
  const b = new THREE.Vector3(d.b.x, d.b.y, d.b.z);
  const off = new THREE.Vector3(d.dir.x, d.dir.y, d.dir.z).multiplyScalar(d.offset);
  const A = a.clone().add(off);
  const B = b.clone().add(off);
  const ext = d.offset > 0.001 ? [[a.clone().add(off.clone().multiplyScalar(0.15)), A.clone().add(off.clone().setLength(0.04))], [b.clone().add(off.clone().multiplyScalar(0.15)), B.clone().add(off.clone().setLength(0.04))]] : [];
  const dir = B.clone().sub(A);
  const L = dir.length();
  dir.normalize();
  const size = Math.min(0.07, L / 4);
  // strzałki w płaszczyźnie wyznaczonej przez linię i kierunek odsunięcia (lub pion/poziom)
  let side = new THREE.Vector3(d.dir.x, d.dir.y, d.dir.z);
  if (side.lengthSq() < 1e-6 || Math.abs(side.dot(dir)) > 0.9) side = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  side = side.sub(dir.clone().multiplyScalar(side.dot(dir))).normalize();
  const arrow = (tip: THREE.Vector3, back: THREE.Vector3) => [
    tip.clone().add(back.clone().multiplyScalar(size)).add(side.clone().multiplyScalar(size * 0.45)), tip, tip.clone().add(back.clone().multiplyScalar(size)).add(side.clone().multiplyScalar(-size * 0.45)),
  ];
  return { main: [A, B], ext, arrows: [arrow(A, dir), arrow(B, dir.clone().negate())], mid: A.clone().add(B).multiplyScalar(0.5) };
}

export function Dimensions({ config, solved, view, sideFlip }: { config: Config; solved: Solved; view: DimView | null; sideFlip: boolean }) {
  const specs = useMemo(() => (view ? dimensionSpecs(config, solved, view, sideFlip) : []), [config.room, solved, view, sideFlip]);
  const geo = useMemo(() => specs.map((d) => ({ d, ...dimLines(d) })), [specs]);
  const labels: LabelSpec[] = useMemo(() => geo.map((g) => ({ id: g.d.id, text: g.d.label, pos: g.mid, cls: `dim-label dim-${g.d.kind}` })), [geo]);
  useLabels('dims', labels);
  return (
    <group>
      {geo.map((g) => (
        <group key={g.d.id}>
          <Line points={g.main} color={COLORS[g.d.kind]} lineWidth={1.4} depthTest={false} renderOrder={10} />
          {g.ext.map((e, i) => <Line key={i} points={e} color={COLORS[g.d.kind]} lineWidth={0.8} transparent opacity={0.6} depthTest={false} renderOrder={10} />)}
          {g.arrows.map((e, i) => <Line key={`a${i}`} points={e} color={COLORS[g.d.kind]} lineWidth={1.4} depthTest={false} renderOrder={10} />)}
        </group>
      ))}
    </group>
  );
}
