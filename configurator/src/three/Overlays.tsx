// Wizualizacja konfliktów (kolizje ze ścianami, brak prześwitu), obrys zajmowanej przestrzeni, kierunek wyjścia.
import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { LIMITS, WALL_LABEL } from '../engine/catalog';
import { cm } from '../engine/validate';
import type { Config, Solved } from '../engine/types';
import { useLabels, type LabelSpec } from './Labels';
import { RectOutline } from './Room';

export function Overlays({ config, solved, showFootprint }: { config: Config; solved: Solved; showFootprint: boolean }) {
  const H = config.room.height;
  const underside = H - config.room.slabThickness;
  const { collisions } = solved.fit;
  const short = solved.opening.headroomShortfalls;
  const labels: LabelSpec[] = useMemo(() => {
    const l: LabelSpec[] = collisions.map((c) => ({
      id: `col-${c.side}`,
      text: `${c.wallPresent ? 'Kolizja ze ścianą' : 'Poza obrysem pomieszczenia'} (${WALL_LABEL[c.side]}) · ${cm(c.amount)} cm`,
      pos: { x: (c.rect.minX + c.rect.maxX) / 2, y: Math.min(1.4, H * 0.45), z: (c.rect.minZ + c.rect.maxZ) / 2 },
      cls: 'conflict-label',
    }));
    if (short.length) {
      const worst = short.reduce((a, b) => (a.headroom < b.headroom ? a : b));
      l.push({ id: 'headroom', text: `Prześwit ${cm(worst.headroom)} cm`, pos: { x: (worst.rect.minX + worst.rect.maxX) / 2, y: (worst.y + underside) / 2, z: (worst.rect.minZ + worst.rect.maxZ) / 2 }, cls: 'conflict-label' });
    }
    return l;
  }, [collisions, short, H, underside]);
  useLabels('overlays', labels);

  const ex = solved.layout.exit;
  const arrow = useMemo(() => {
    const p = { x: ex.point.x + ex.dir.x * 0.25, z: ex.point.z + ex.dir.z * 0.25 };
    const q = { x: p.x + ex.dir.x * 0.5, z: p.z + ex.dir.z * 0.5 };
    const side = { x: -ex.dir.z, z: ex.dir.x };
    const y = H + 0.02;
    return {
      shaft: [[p.x, y, p.z], [q.x, y, q.z]] as [number, number, number][],
      head: [[q.x - ex.dir.x * 0.15 + side.x * 0.1, y, q.z - ex.dir.z * 0.15 + side.z * 0.1], [q.x, y, q.z], [q.x - ex.dir.x * 0.15 - side.x * 0.1, y, q.z - ex.dir.z * 0.15 - side.z * 0.1]] as [number, number, number][],
    };
  }, [ex, H]);

  return (
    <group>
      {collisions.map((c) => {
        const w = Math.max(0.01, c.rect.maxX - c.rect.minX);
        const d = Math.max(0.01, c.rect.maxZ - c.rect.minZ);
        return (
          <mesh key={c.side} position={[(c.rect.minX + c.rect.maxX) / 2, H / 2, (c.rect.minZ + c.rect.maxZ) / 2]} renderOrder={5}>
            <boxGeometry args={[w, H, d]} />
            <meshBasicMaterial color="#e5484d" transparent opacity={0.32} depthWrite={false} />
          </mesh>
        );
      })}
      {short.map((s, i) => {
        // brakujący prześwit: od spodu stropu do wymaganej wysokości nad stopnicą
        const top = s.y + LIMITS.headroom;
        const bottom = Math.min(underside, top - 0.01);
        return (
          <mesh key={i} position={[(s.rect.minX + s.rect.maxX) / 2, (bottom + top) / 2, (s.rect.minZ + s.rect.maxZ) / 2]} renderOrder={5}>
            <boxGeometry args={[s.rect.maxX - s.rect.minX, top - bottom, s.rect.maxZ - s.rect.minZ]} />
            <meshBasicMaterial color="#e5484d" transparent opacity={0.28} depthWrite={false} />
          </mesh>
        );
      })}
      {showFootprint && <RectOutline rect={solved.layout.footprint} y={0.01} color="#8a5a2b" dashed />}
      {showFootprint && <RectOutline rect={solved.layout.structureRect} y={0.012} color="#3d3a35" />}
      <Line points={arrow.shaft} color="#8a5a2b" lineWidth={2} />
      <Line points={arrow.head} color="#8a5a2b" lineWidth={2} />
    </group>
  );
}
