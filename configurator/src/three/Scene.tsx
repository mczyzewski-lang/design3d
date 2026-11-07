// Scena 3D — ładowana leniwie (three w osobnym chunku).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useConfig, useSolved, useView } from '../store/store';
import { createMaterials, updateMaterials } from './materials';
import { Room } from './Room';
import { Staircase } from './Staircase';
import { Lighting } from './Lighting';
import { CameraRig } from './CameraRig';
import { Dimensions } from './Dimensions';
import { Overlays } from './Overlays';
import { LabelContext, LabelLayer, LabelUpdater } from './Labels';
import { capture } from './capture';
import type { DimView } from '../engine/dimensions';

function Capture() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    capture.fn = () => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL('image/png');
    };
    return () => { capture.fn = null; };
  }, [gl, scene, camera]);
  return null;
}

export default function Scene() {
  const config = useConfig();
  const solved = useSolved();
  const view = useView();
  const mats = useMemo(() => createMaterials(), []);
  useEffect(() => updateMaterials(mats, config), [mats, config]);
  const labelRoot = useRef<HTMLDivElement>(null);
  const [layer, setLayer] = useState<LabelLayer | null>(null);
  useEffect(() => { if (labelRoot.current) setLayer(new LabelLayer(labelRoot.current)); }, []);
  const dimView: DimView | null = !view.showDims ? null : view.camera === 'top' ? 'top' : view.camera === 'side' ? 'side' : view.camera === 'eye' ? null : 'persp';

  return (
    <div className="absolute inset-0">
      <Canvas shadows="percentage" gl={{ antialias: true, preserveDrawingBuffer: false }} dpr={[1, 2]} data-testid="stair-canvas">
        <LabelContext.Provider value={layer}>
          <CameraRig config={config} solved={solved} view={view} />
          <Lighting config={config} solved={solved} />
          <Room config={config} solved={solved} view={view} mats={mats} />
          <Staircase config={config} solved={solved} mats={mats} />
          <Overlays config={config} solved={solved} showFootprint={view.showFootprint || view.camera === 'top'} />
          <Dimensions config={config} solved={solved} view={dimView} sideFlip={view.sideFlip} />
          <LabelUpdater />
          <Capture />
        </LabelContext.Provider>
      </Canvas>
      <div ref={labelRoot} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
