// Schody + balustrady: jedna siatka na materiał. Geometria przebudowywana tylko przy zmianie klucza geometrii.
import { useEffect, useMemo } from 'react';
import type { Config, Solved } from '../engine/types';
import { buildStairGeometry, stairGeometryKey } from './geom/stair';
import { buildRailingGeometry, railingGeometryKey } from './geom/railing';
import type { MatKey } from './geom/primitives';
import type { Materials } from './materials';

interface Props { config: Config; solved: Solved; mats: Materials }

export function Staircase({ config, solved, mats }: Props) {
  const sKey = stairGeometryKey(config, solved);
  const rKey = railingGeometryKey(config, solved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stair = useMemo(() => buildStairGeometry(config, solved), [sKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const railing = useMemo(() => buildRailingGeometry(config, solved), [rKey]);
  useEffect(() => () => Object.values(stair.geoms).forEach((g) => g?.dispose()), [stair]);
  useEffect(() => () => Object.values(railing.geoms).forEach((g) => g?.dispose()), [railing]);
  return (
    <group>
      {(Object.entries(stair.geoms) as Array<[MatKey, any]>).map(([k, g]) => (
        <mesh key={`s-${k}`} geometry={g} material={mats.stair[k]} castShadow={k !== 'led'} receiveShadow={k !== 'led'} />
      ))}
      {(Object.entries(railing.geoms) as Array<[MatKey, any]>).map(([k, g]) => (
        <mesh key={`r-${k}`} geometry={g} material={mats.stair[k]} castShadow={k !== 'glass'} receiveShadow renderOrder={k === 'glass' ? 2 : 0} />
      ))}
    </group>
  );
}
