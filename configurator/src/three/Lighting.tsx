// Oświetlenie: miękkie słońce z cieniami + środowisko z Lightformerów (bez plików HDR). Tryb nocny z LED.
import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import type { Config, Solved } from '../engine/types';

export function Lighting({ config, solved }: { config: Config; solved: Solved }) {
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
  // ciepłe światło od taśm LED w nocy: jedno źródło na bieg
  const ledLights = useMemo(() => solved.layout.flights.map((f) => {
    const mid = f.length / 2;
    return [f.origin.x + f.dir.x * mid, f.baseY + (f.topY - f.baseY) / 2 - 0.2, f.origin.z + f.dir.z * mid] as [number, number, number];
  }), [solved.layout]);
  const ledColor = lighting.ledTemp === 2700 ? '#ffb46b' : '#ffe2c2';
  return (
    <>
      <hemisphereLight args={[night ? '#3a4050' : '#fffaf0', night ? '#20232a' : '#d8cdbd', night ? 0.15 : 0.55]} />
      <directionalLight
        ref={sun}
        castShadow
        position={[W / 2 + 6, H + 7, D / 2 + 5]}
        intensity={night ? 0 : 2.4}
        color="#fff4e2"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {night && <pointLight position={[W / 2, H - 0.4, D / 2]} intensity={2.5} distance={8} color="#ffd9a8" />}
      {lighting.led && ledLights.map((p, i) => (
        <pointLight key={i} position={p} intensity={(night ? 4 : 0.6) * lighting.ledBrightness} distance={3.5} decay={2} color={ledColor} />
      ))}
      <Environment resolution={256} environmentIntensity={night ? 0.12 : 0.9} background={false} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#fffaf2" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#fff1dd" position={[8, 3, 2]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#eef3ff" position={[-8, 3, -2]} rotation-y={Math.PI / 2} scale={[10, 4, 1]} />
        <Lightformer form="ring" intensity={1.5} color="#ffffff" position={[2, 4, 8]} scale={3} />
      </Environment>
    </>
  );
}
