// Oświetlenie LED schodów: taśma pod noskami, oprawy punktowe albo profil wzdłuż biegu.
// Czysta geometria w układzie biegu (x = lewa ręka, y = góra od poziomu bazowego, z = kierunek marszu).
import { stepStyleOf } from './catalog';
import type { Config, FlightEl, LedMode, RoomConfig, StructureType } from './types';

export const LED_MODES: Array<{ key: LedMode; label: string; hint: string }> = [
  { key: 'nosing', label: 'Pod noskami', hint: 'Taśma LED w profilu pod przednią krawędzią każdej stopnicy.' },
  { key: 'spots', label: 'Punktowe', hint: 'Oprawy schodowe co drugi stopień — w ścianie obok biegu albo w czołach stopnic, gdy ściany brak.' },
  { key: 'along', label: 'Wzdłuż schodów', hint: 'Ciągły profil LED równoległy do biegu — w ścianie ok. 25 cm nad noskami albo na boku konstrukcji.' },
];

/**
 * Które tryby są możliwe. Przy szklanej balustradzie oprawy punktowe i profil wzdłuż biegu byłyby za szkłem
 * (w czołach stopnic / na boku konstrukcji) — dopuszczamy je tylko, gdy każdy bieg ma ścianę obok.
 */
export function ledModesAvailable(c: Config, s: { layout: { flights: FlightEl[]; spiral: unknown } }): Record<LedMode, boolean> {
  if (c.stairs.shape === 'S' || s.layout.spiral) return { nosing: true, spots: false, along: false };
  if (c.railing.type !== 'glass') return { nosing: true, spots: true, along: true };
  const wall = s.layout.flights.length > 0 && s.layout.flights.every((f) => flightLed(c, f, c.stairs.treadThickness).nearWall);
  return { nosing: true, spots: wall, along: wall };
}

/** Skuteczny tryb: wybrany, o ile jest możliwy — inaczej taśma pod noskami. */
export function ledModeOf(c: Config, s?: { layout: { flights: FlightEl[]; spiral: unknown } }): LedMode {
  if (c.stairs.shape === 'S') return 'nosing';
  const m = c.lighting.ledMode ?? 'nosing';
  return s && !ledModesAvailable(c, s)[m] ? 'nosing' : m;
}

/** Stopnie z oprawą punktową: co drugi, zawsze także ostatni. */
export function spotSteps(treads: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= treads; i += 2) out.push(i);
  if (treads > 1 && out[out.length - 1] !== treads) out.push(treads);
  return out;
}

export interface FlightLed {
  /** strona biegu (+1 = lewa ręka, −1 = prawa) — ta bliższa ścianie */
  side: 1 | -1;
  nearWall: boolean;
  /** x powierzchni montażu profilu i opraw (dodatnie, mnożone przez side) */
  alongX: number;
  spotX: number;
  /** linia profilu wzdłuż biegu: y = k·z + c */
  alongC: number;
  /** y oprawy punktowej dla stopnia i */
  spotY: (i: number) => number;
  /** zakres z profilu wzdłuż biegu */
  z0: number;
  z1: number;
}

const WALL_NEAR = 0.35;

/** Odległość punktu (świat) do najbliższej istniejącej ściany pokoju. */
function wallDistance(room: RoomConfig, x: number, z: number): number {
  const d: number[] = [];
  if (room.walls.left) d.push(x);
  if (room.walls.right) d.push(room.width - x);
  if (room.walls.back) d.push(z);
  if (room.walls.front) d.push(room.depth - z);
  return d.length ? Math.min(...d.map((v) => (v < -0.01 ? Infinity : Math.max(0, v)))) : Infinity;
}

/** Zewnętrzna powierzchnia konstrukcji po stronie biegu, gdzie można przykleić profil (bez ściany). */
function structureFace(type: StructureType, w: number, t: number): { x: number; c: number } {
  switch (type) {
    case 'centralBeam': return { x: 0.062, c: -t - 0.06 };
    case 'weldedFrame': return { x: w / 2 - 0.025 + 0.002, c: -t - 0.1 };
    case 'bentPlate': return { x: w / 4 + 0.006, c: -t - 0.07 };
    case 'zigzag': return { x: w / 2 - 0.1 + 0.008, c: -t - 0.06 };
    case 'concrete': return { x: w / 2 + 0.002, c: -t - 0.06 };
    default: return { x: w / 2 + 0.002, c: -t - 0.03 };
  }
}

export function flightLed(c: Config, f: FlightEl, t: number): FlightLed {
  const w = f.width;
  const L = f.length;
  const k = f.rise / f.going;
  const mid = (sx: number) => ({ x: f.origin.x + f.dir.x * L / 2 + f.left.x * sx * w / 2, z: f.origin.z + f.dir.z * L / 2 + f.left.z * sx * w / 2 });
  const dl = wallDistance(c.room, mid(1).x, mid(1).z);
  const dr = wallDistance(c.room, mid(-1).x, mid(-1).z);
  const side: 1 | -1 = dl <= dr ? 1 : -1;
  const d = Math.min(dl, dr);
  const nearWall = d < WALL_NEAR;
  const style = stepStyleOf(c);
  const clad = (style === 'boxed' || style === 'solid') && c.structure.type !== 'woodStringers';
  let alongX: number;
  let spotX: number;
  let alongC: number;
  let spotY: (i: number) => number;
  if (nearWall) {
    alongX = w / 2 + d - 0.004;
    spotX = alongX;
    alongC = 0.25;
    spotY = (i) => i * f.rise + 0.25;
  } else {
    const face = clad ? { x: w / 2 + 0.02, c: -t - 0.03 } : structureFace(c.structure.type, w, t);
    alongX = face.x;
    alongC = face.c;
    spotX = clad ? w / 2 + 0.02 : w / 2 + 0.002;
    spotY = (i) => i * f.rise - t / 2;
  }
  // profil zaczyna się nad posadzką / spocznikiem i kończy przed stropem
  const z0 = Math.max(0.08, (0.06 - alongC) / k);
  const z1 = Math.max(z0 + 0.1, L - 0.08);
  return { side, nearWall, alongX, spotX, alongC, spotY, z0, z1 };
}

/** Długość profilu wzdłuż biegu (do zestawienia). */
export function alongLength(f: FlightEl, led: FlightLed): number {
  const k = f.rise / f.going;
  return (led.z1 - led.z0) * Math.sqrt(1 + k * k);
}
