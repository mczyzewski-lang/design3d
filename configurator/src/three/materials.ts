// Współdzielone materiały — tworzone raz i aktualizowane w miejscu (zmiana koloru/drewna nie przebudowuje geometrii).
import * as THREE from 'three';
import { FINISHES, GLASS_TINTS } from '../engine/catalog';
import type { Config } from '../engine/types';
import type { MatKey } from './geom/primitives';
import { brushedRoughness, floorTexture, meshAlpha, perforatedAlpha, wallTexture, woodTextures } from './textures';

export interface Materials {
  stair: Record<MatKey, THREE.Material>;
  floor: THREE.MeshStandardMaterial;
  upperFloor: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  wallGhost: THREE.MeshStandardMaterial;
  slab: THREE.MeshStandardMaterial;
  ground: THREE.MeshStandardMaterial;
}

export function createMaterials(): Materials {
  const steel = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.78, metalness: 0.15 });
  const railSteel = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.78, metalness: 0.15 });
  const w = woodTextures('oakNatural');
  const wood = new THREE.MeshStandardMaterial({ map: w.map, bumpMap: w.bump, bumpScale: 0.6, roughness: 0.58, metalness: 0 });
  const railWood = new THREE.MeshStandardMaterial({ map: w.map, roughness: 0.55, metalness: 0 });
  const riser = new THREE.MeshStandardMaterial({ map: w.map, roughness: 0.6, metalness: 0 });
  const led = new THREE.MeshStandardMaterial({ color: '#ffd2a1', emissive: new THREE.Color('#ffb46b'), emissiveIntensity: 2, toneMapped: false });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#d9efe9', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.2 });
  const glassEdge = new THREE.MeshStandardMaterial({ color: '#4f9c84', roughness: 0.15, transparent: true, opacity: 0.85 });
  const perforated = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.6, metalness: 0.3, alphaMap: perforatedAlpha(), alphaTest: 0.5, side: THREE.DoubleSide });
  perforated.alphaToCoverage = true;
  const mesh = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.6, metalness: 0.3, alphaMap: meshAlpha(), alphaTest: 0.5, side: THREE.DoubleSide });
  mesh.alphaToCoverage = true;
  const wallTex = wallTexture();
  return {
    stair: { steel, railSteel, wood, riser, railWood, led, glass, glassEdge, perforated, mesh },
    floor: new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.6 }),
    upperFloor: new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.6 }),
    wall: new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92, color: '#ffffff' }),
    wallGhost: new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92, transparent: true, opacity: 0.22, depthWrite: false }),
    slab: new THREE.MeshStandardMaterial({ color: '#f2efe9', roughness: 0.9 }),
    ground: new THREE.MeshStandardMaterial({ color: '#e9e5de', roughness: 1 }),
  };
}

function applySteel(m: THREE.MeshStandardMaterial, color: string, finish: string) {
  const f = FINISHES.find((x) => x.key === finish) ?? FINISHES[0];
  m.color.set(color);
  m.roughness = f.roughness;
  m.metalness = f.metalness;
  const wantMap = finish === 'brushed' ? brushedRoughness() : null;
  if (m.roughnessMap !== wantMap) {
    m.roughnessMap = wantMap;
    m.needsUpdate = true;
  }
}

const LED_COLOR: Record<number, string> = { 2700: '#ffb46b', 4000: '#ffe2c2' };

/** Aktualizacja w miejscu — bez przebudowy geometrii i bez remontowania canvasu. */
export function updateMaterials(M: Materials, c: Config): void {
  const s = M.stair as Record<MatKey, any>;
  applySteel(s.steel, c.steel.color, c.steel.finish);
  const railColor = c.railing.separateColor ? c.railing.color : c.steel.color;
  applySteel(s.railSteel, railColor, c.steel.finish);
  for (const k of ['perforated', 'mesh'] as const) {
    s[k].color.set(railColor);
    s[k].roughness = s.railSteel.roughness;
    s[k].metalness = s.railSteel.metalness;
  }
  const w = woodTextures(c.treads.wood);
  if (s.wood.map !== w.map) {
    s.wood.map = w.map;
    s.wood.bumpMap = w.bump;
    s.railWood.map = w.map;
    s.wood.needsUpdate = true;
    if (c.structure.riserFinish === 'wood') { s.riser.map = w.map; s.riser.needsUpdate = true; }
    s.railWood.needsUpdate = true;
  }
  // podstopnice
  const rf = c.structure.riserFinish;
  const riserMap = rf === 'wood' ? w.map : null;
  if (s.riser.map !== riserMap) { s.riser.map = riserMap; s.riser.needsUpdate = true; }
  s.riser.color.set(rf === 'white' ? '#f3f1ec' : rf === 'steel' ? c.steel.color : '#ffffff');
  s.riser.roughness = rf === 'steel' ? s.steel.roughness : 0.6;
  s.riser.metalness = rf === 'steel' ? s.steel.metalness : 0;
  // szkło
  const tint = GLASS_TINTS.find((g) => g.key === c.railing.glassTint) ?? GLASS_TINTS[0];
  s.glass.color.set(tint.color);
  s.glass.opacity = tint.opacity;
  s.glass.roughness = tint.roughness;
  s.glassEdge.color.set(tint.edge);
  const L = c.lighting;
  s.led.visible = L.led;
  s.led.emissive.set(LED_COLOR[L.ledTemp] ?? LED_COLOR[2700]);
  s.led.color.set(LED_COLOR[L.ledTemp] ?? LED_COLOR[2700]);
  s.led.emissiveIntensity = 0.5 + L.ledBrightness * (L.night ? 6 : 2.5);
}
