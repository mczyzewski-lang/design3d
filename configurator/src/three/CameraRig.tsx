// 5 trybów kamery: perspektywa, z góry (ortho), z boku (ortho), przekrój, poziom oczu. Płynne przejścia CameraControls.
import { useEffect, useMemo, useRef } from 'react';
import { CameraControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import CameraControlsImpl from 'camera-controls';
import * as THREE from 'three';
import type { Config, Solved } from '../engine/types';
import type { ViewState } from '../store/store';

export const isOrtho = (m: ViewState['camera']) => m === 'top' || m === 'side';

export function CameraRig({ config, solved, view }: { config: Config; solved: Solved; view: ViewState }) {
  const ortho = isOrtho(view.camera);
  const ref = useRef<CameraControlsImpl>(null);
  const { room } = config;
  const W = room.width;
  const D = room.depth;
  const H = room.height;
  const sr = solved.layout.structureRect;

  const boxes = useMemo(() => ({
    room: new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(W + 0.3, H + 0.3, D + 0.3)),
    stair: new THREE.Box3(new THREE.Vector3(sr.minX, 0, sr.minZ), new THREE.Vector3(sr.maxX, H, sr.maxZ)),
  }), [W, D, H, sr.minX, sr.maxX, sr.minZ, sr.maxZ]);

  const applyPose = (animate: boolean) => {
    const c = ref.current;
    if (!c) return;
    const cx = (sr.minX + sr.maxX) / 2;
    const cz = (sr.minZ + sr.maxZ) / 2;
    const lock = (on: boolean) => {
      c.azimuthRotateSpeed = on ? 0 : 1;
      c.polarRotateSpeed = on ? 0 : 1;
      c.mouseButtons.left = on ? CameraControlsImpl.ACTION.TRUCK : CameraControlsImpl.ACTION.ROTATE;
      c.touches.one = on ? CameraControlsImpl.ACTION.TOUCH_TRUCK : CameraControlsImpl.ACTION.TOUCH_ROTATE;
    };
    const f0 = solved.layout.flights[0];
    switch (view.camera) {
      case 'top': {
        lock(true);
        c.setLookAt(W / 2, H + 25, D / 2 + 0.0001, W / 2, 0, D / 2, false);
        const pad = 0.9;
        const b = boxes.room.clone().expandByVector(new THREE.Vector3(pad, 0, pad));
        void c.fitToBox(b, animate, { cover: false });
        break;
      }
      case 'side': {
        lock(true);
        const s = view.sideFlip ? -1 : 1;
        const n = new THREE.Vector3(f0.left.x * s, 0, f0.left.z * s);
        const t = new THREE.Vector3(W / 2, H / 2, D / 2);
        const p = t.clone().add(n.multiplyScalar(25));
        c.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, false);
        const b = boxes.room.clone().expandByScalar(0.6);
        void c.fitToBox(b, animate, { cover: false });
        break;
      }
      case 'eye': {
        lock(false);
        if (view.eyeFrom === 'entry') {
          const e = solved.layout.entry;
          const p = { x: e.point.x - e.dir.x * 1.5, z: e.point.z - e.dir.z * 1.5 };
          c.setLookAt(p.x, 1.62, p.z, e.point.x + e.dir.x * 2, 1.45, e.point.z + e.dir.z * 2, animate);
        } else {
          const ex = solved.layout.exit;
          const p = { x: ex.point.x + ex.dir.x * 1.6, z: ex.point.z + ex.dir.z * 1.6 };
          c.setLookAt(p.x, H + 1.62, p.z, cx, H * 0.45, cz, animate);
        }
        break;
      }
      default: {
        lock(false);
        const R = Math.max(W, D) * 0.85 + 2.2;
        const y = view.camera === 'section' ? H + 2.6 : H * 0.8 + 1.0;
        c.setLookAt(cx + R * 0.75, y, cz + R * 1.05, cx, H * 0.42, cz, animate);
      }
    }
  };

  // pozycja po zmianie trybu (nowe CameraControls po zmianie projekcji)
  useEffect(() => {
    const id = requestAnimationFrame(() => applyPose(!ortho));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.camera, view.eyeFrom, view.sideFlip, view.resetNonce, ortho]);

  // dopasuj schody do widoku
  useEffect(() => {
    if (!view.fitNonce) return;
    const c = ref.current;
    if (!c) return;
    if (ortho) void c.fitToBox(boxes.stair.clone().expandByScalar(0.3), true);
    // w perspektywie fitToSphere — fitToBox przyciąga obrót do 90°
    else void c.fitToSphere(boxes.stair.getBoundingSphere(new THREE.Sphere()), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.fitNonce]);

  return (
    <>
      {ortho ? (
        <OrthographicCamera makeDefault near={0.1} far={300} zoom={60} position={[W / 2, H + 25, D / 2]} />
      ) : (
        <PerspectiveCamera makeDefault fov={view.camera === 'eye' ? 70 : 45} near={0.05} far={300} position={[W + 4, H + 2, D + 5]} />
      )}
      <CameraControls key={ortho ? 'ortho' : 'persp'} ref={ref} makeDefault smoothTime={0.35} minDistance={0.3} maxDistance={60} dollyToCursor />
    </>
  );
}
