// Komentarze 3D: kropka unosząca się nad punktem na modelu, z nitką do punktu i numerem (etykieta DOM, klikalna).
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStudio } from '../studio/studioStore';
import { useLabels, type LabelSpec } from './Labels';

const LIFT = 0.32;
const COLOR = { owner: '#8a5a2b', contractor: '#2f6fd6', pending: '#e5484d', resolved: '#a8a29a' };

function Pin({ x, y, z, color, active, index, onClick }: { x: number; y: number; z: number; color: string; active: boolean; index: number; onClick?: () => void }) {
  const ball = useRef<THREE.Mesh>(null);
  const line = useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, LIFT, 0)]), []);
  useFrame(({ clock }) => {
    if (ball.current) ball.current.position.y = LIFT + Math.sin(clock.elapsedTime * 1.6 + index) * 0.025;
  });
  return (
    <group position={[x, y, z]}>
      <lineSegments geometry={line} renderOrder={20}>
        <lineBasicMaterial color={color} transparent opacity={0.7} depthTest={false} />
      </lineSegments>
      <mesh renderOrder={20}>
        <sphereGeometry args={[0.018, 12, 8]} />
        <meshBasicMaterial color={color} depthTest={false} transparent />
      </mesh>
      <mesh ref={ball} position={[0, LIFT, 0]} renderOrder={21} onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
        <sphereGeometry args={[active ? 0.075 : 0.058, 20, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 0.7 : 0.35} depthTest={false} transparent opacity={0.95} />
      </mesh>
    </group>
  );
}

export function CommentPins() {
  const comments = useStudio((s) => s.comments);
  const pending = useStudio((s) => s.pendingPin);
  const active = useStudio((s) => s.activeComment);
  const setActive = useStudio((s) => s.setActiveComment);
  const pinned = useMemo(() => comments.filter((c) => c.pos), [comments]);
  const labels: LabelSpec[] = useMemo(() => {
    const l: LabelSpec[] = pinned.map((c) => ({
      id: String(c.id), text: String(comments.indexOf(c) + 1), pos: { x: c.pos!.x, y: c.pos!.y + LIFT + 0.13, z: c.pos!.z },
      cls: `pin-label ${c.resolved ? 'pin-resolved' : c.author_role === 'contractor' ? 'pin-contractor' : 'pin-owner'}${active === c.id ? ' pin-active' : ''}`,
      onClick: () => setActive(active === c.id ? null : c.id),
    }));
    if (pending) l.push({ id: 'pending', text: '+', pos: { x: pending.x, y: pending.y + LIFT + 0.13, z: pending.z }, cls: 'pin-label pin-pending' });
    return l;
  }, [pinned, comments, pending, active, setActive]);
  useLabels('comments', labels);
  return (
    <group>
      {pinned.map((c, i) => (
        <Pin key={c.id} {...c.pos!} index={i} active={active === c.id} color={c.resolved ? COLOR.resolved : COLOR[c.author_role]} onClick={() => setActive(active === c.id ? null : c.id)} />
      ))}
      {pending && <Pin {...pending} index={99} active color={COLOR.pending} />}
    </group>
  );
}
