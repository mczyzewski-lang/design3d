// Etykiety imperatywne: warstwa DOM nad canvasem, pozycje rzutowane w useFrame.
// (Zastępuje <Html> z drei, które przy React 19 crashuje przy odmontowaniu: „removeChild”/„synchronously unmount a root”.)
import { createContext, useContext, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface Item { node: HTMLDivElement; pos: THREE.Vector3; owner: string }

export class LabelLayer {
  private items = new Map<string, Item>();
  private v = new THREE.Vector3();
  constructor(readonly root: HTMLDivElement) {}
  set(owner: string, id: string, text: string, pos: { x: number; y: number; z: number }, cls: string): void {
    const key = `${owner}:${id}`;
    let it = this.items.get(key);
    if (!it) {
      const node = document.createElement('div');
      node.style.position = 'absolute';
      node.style.left = '0';
      node.style.top = '0';
      node.style.pointerEvents = 'none';
      node.style.willChange = 'transform';
      this.root.appendChild(node);
      it = { node, pos: new THREE.Vector3(), owner };
      this.items.set(key, it);
    }
    if (it.node.textContent !== text) it.node.textContent = text;
    if (it.node.className !== cls) it.node.className = cls;
    it.pos.set(pos.x, pos.y, pos.z);
  }
  /** Usuwa etykiety właściciela, których nie ma w `keep`. */
  prune(owner: string, keep: Set<string>): void {
    for (const [key, it] of this.items) {
      if (it.owner !== owner) continue;
      if (!keep.has(key.slice(owner.length + 1))) {
        it.node.remove();
        this.items.delete(key);
      }
    }
  }
  clear(owner: string): void {
    this.prune(owner, new Set());
  }
  update(camera: THREE.Camera, w: number, h: number): void {
    for (const it of this.items.values()) {
      this.v.copy(it.pos).project(camera);
      const visible = this.v.z > -1 && this.v.z < 1 && Math.abs(this.v.x) < 1.2 && Math.abs(this.v.y) < 1.2;
      if (!visible) {
        it.node.style.display = 'none';
        continue;
      }
      it.node.style.display = '';
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h;
      it.node.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }
}

export const LabelContext = createContext<LabelLayer | null>(null);

export function LabelUpdater() {
  const layer = useContext(LabelContext);
  const size = useThree((s) => s.size);
  useFrame(({ camera }) => layer?.update(camera, size.width, size.height));
  return null;
}

export interface LabelSpec { id: string; text: string; pos: { x: number; y: number; z: number }; cls: string }

/** Synchronizuje zestaw etykiet danego właściciela z warstwą DOM. */
export function useLabels(owner: string, labels: LabelSpec[]) {
  const layer = useContext(LabelContext);
  useEffect(() => {
    if (!layer) return;
    const keep = new Set<string>();
    for (const l of labels) {
      layer.set(owner, l.id, l.text, l.pos, l.cls);
      keep.add(l.id);
    }
    layer.prune(owner, keep);
  }, [layer, owner, labels]);
  useEffect(() => () => layer?.clear(owner), [layer, owner]);
}
