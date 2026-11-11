// Oświetlenie: miękkie słońce z cieniami + środowisko z Lightformerów (bez plików HDR). Tryb nocny z LED.
import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import type { Config, Solved } from '../engine/types';
import { stepStyleOf } from '../engine/catalog';
import { ledLightPositions } from './geom/led';
import { stairGeometryKey } from './geom/stair';

export function Lighting({ config, solved, hq = true }: { config: Config; solved: Solved; hq?: boolean }) {
  const { room, lighting } = config;
  const night = lighting.night;
  const W = room.width;
  const D = room.depth;
  const H = room.height;
  const scene = useThree((s) => s.scene);
  const sun = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    scene.background = new THREE.Color(night ? '#16181d' : '#f3f0ea');
  }, [scene, night]);
  useEffect(() => {
    const l = sun.current;
    if (!l) return;
    l.target.position.set(W / 2, H / 3, D / 2);
    l.target.updateMatrixWorld();
    const r = Math.max(W, D, H) * 1.2;
    const cam = l.shadow.camera as THREE.OrthographicCamera;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 0.5; cam.far = 40;
    cam.updateProjectionMatrix();
  }, [W, D, H]);
  // ciepłe światło od LED: kilka źródeł rozłożonych wzdłuż każdego biegu, wg rodzaju oprawy
  const t = stepStyleOf(config) === 'blocks' ? solved.calc.rise - 0.014 : config.stairs.treadThickness;
  const ledKey = stairGeometryKey(config, solved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ledLights = useMemo(() => ledLightPositions(config, solved, t), [ledKey]);
  const ledColor = lighting.ledTemp === 2700 ? '#ffb46b' : '#ffe2c2';
  return (
    <>
      <hemisphereLight args={[night ? '#3a4050' : '#f3f6fb', night ? '#20232a' : '#d9cfc0', night ? 0.15 : 0.58]} />
      {/* kontra bez cieni z przeciwnej strony: wydobywa bryłę ciemnej stali i spody stopni */}
      {!night && <directionalLight position={[W / 2 - 7, H * 0.6, D / 2 - 4]} intensity={0.45} color="#eaf0ff" />}
      <directionalLight
        ref={sun}
        castShadow
        position={[W / 2 + 6, H + 7, D / 2 + 5]}
        intensity={night ? 0 : 2.3}
        color="#fff8ee"
        shadow-mapSize={hq ? [4096, 4096] : [2048, 2048]}
        shadow-radius={hq ? 3 : 2}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {night && <pointLight position={[W / 2, H - 0.4, D / 2]} intensity={2.5} distance={8} color="#ffd9a8" />}
      {/* światła LED tylko nocą — w dzień ich wkład jest znikomy, a każde źródło kosztuje (szczególnie na telefonach) */}
      {lighting.led && night && ledLights.map((p, i) => (
        <pointLight key={i} position={p} intensity={2.6 * lighting.ledBrightness} distance={2.6} decay={2} color={ledColor} />
      ))}
      <Environment resolution={256} environmentIntensity={night ? 0.12 : 0.72} background={false} frames={1}>
        {/* jasne, ciepłe tło otoczenia: metal (np. szampański, szczotkowany) odbija wnętrze zamiast czerni */}
        <color attach="background" args={['#5f584e']} />
        <Lightformer form="rect" intensity={2.2} color="#fffaf2" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#fff1dd" position={[8, 3, 2]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#eef3ff" position={[-8, 3, -2]} rotation-y={Math.PI / 2} scale={[10, 4, 1]} />
        <Lightformer form="ring" intensity={1.5} color="#ffffff" position={[2, 4, 8]} scale={3} />
      </Environment>
    </>
  );
}
