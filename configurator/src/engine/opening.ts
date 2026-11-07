// Otwór w stropie, prześwit nad stopnicami, strefa wyjścia na piętro.
import { LIMITS } from './catalog';
import type { Layout, OpeningResult, Rect, RoomConfig, StairConfig, Vec2, WallKey } from './types';

export function exitSideOf(dir: Vec2): WallKey {
  if (Math.abs(dir.z) >= Math.abs(dir.x)) return dir.z > 0 ? 'front' : 'back';
  return dir.x > 0 ? 'right' : 'left';
}

/** Zasięg stropu: pokój + przedłużenie przy brakujących ścianach. */
export function slabExtent(room: RoomConfig): Rect {
  const e = LIMITS.slabExtension;
  return {
    minX: room.walls.left ? 0 : -e,
    maxX: room.walls.right ? room.width : room.width + e,
    minZ: room.walls.back ? 0 : -e,
    maxZ: room.walls.front ? room.depth : room.depth + e,
  };
}

export const rectInside = (a: Rect, b: Rect, eps = 1e-6) =>
  a.minX >= b.minX - eps && a.maxX <= b.maxX + eps && a.minZ >= b.minZ - eps && a.maxZ <= b.maxZ + eps;

export const rectUnion = (rs: Rect[]): Rect => ({
  minX: Math.min(...rs.map((r) => r.minX)), maxX: Math.max(...rs.map((r) => r.maxX)),
  minZ: Math.min(...rs.map((r) => r.minZ)), maxZ: Math.max(...rs.map((r) => r.maxZ)),
});

const clampRect = (r: Rect, c: Rect): Rect => ({
  minX: Math.max(r.minX, c.minX), maxX: Math.min(r.maxX, c.maxX), minZ: Math.max(r.minZ, c.minZ), maxZ: Math.min(r.maxZ, c.maxZ),
});

/** Ustawia krawędź otworu od strony wyjścia dokładnie na linii ostatniego stopnia. */
function setExitEdge(r: Rect, side: WallKey, layout: Layout): Rect {
  const out = { ...r };
  const p = layout.exit.a;
  if (side === 'front') out.maxZ = p.z;
  if (side === 'back') out.minZ = p.z;
  if (side === 'right') out.maxX = p.x;
  if (side === 'left') out.minX = p.x;
  return out;
}

export function allSurfaces(layout: Layout): Array<{ rect: Rect; y: number }> {
  const s = layout.flights.flatMap((f) => f.treadEls.map((t) => ({ rect: t.rect, y: t.y })));
  if (layout.landing) s.push({ rect: layout.landing.rect, y: layout.landing.y });
  if (layout.winder) s.push(...layout.winder.treads.map((t) => ({ rect: t.rect, y: t.y })));
  if (layout.spiral) s.push(...layout.spiral.treads.map((t) => ({ rect: t.rect, y: t.y })));
  return s;
}

/** Schody kręcone: otwór kwadratowy wokół spirali; górny podest w ćwiartce przy wyjściu. */
function spiralOpening(room: RoomConfig, stairs: StairConfig, layout: Layout): OpeningResult {
  const sp = layout.spiral!;
  const slab = slabExtent(room);
  const c = sp.center;
  const m = LIMITS.openingMargin;
  const R = sp.radius;
  const auto = clampRect({ minX: c.x - R - m, maxX: c.x + R + m, minZ: c.z - R - m, maxZ: c.z + R + m }, slab);
  const rect = stairs.opening.mode === 'manual'
    ? clampRect({ minX: c.x - stairs.opening.width / 2, maxX: c.x + stairs.opening.width / 2, minZ: c.z - stairs.opening.length / 2, maxZ: c.z + stairs.opening.length / 2 }, slab)
    : auto;
  const underside = room.height - room.slabThickness;
  const platformUnder = room.height - LIMITS.platformThickness;
  const interior: Rect = { minX: 0, maxX: room.width, minZ: 0, maxZ: room.depth };
  let minHeadroom = Infinity;
  const shortfalls: OpeningResult['headroomShortfalls'] = [];
  const pr = sp.platform.rect;
  for (const t of sp.treads) {
    if (!rectInside(t.rect, interior)) continue;
    // pod podestem (środek stopnia w ćwiartce podestu)
    const mid = t.poly![Math.floor(t.poly!.length / 4)];
    const cx = (mid.x + c.x) / 2;
    const cz = (mid.z + c.z) / 2;
    const underPlatform = cx > pr.minX && cx < pr.maxX && cz > pr.minZ && cz < pr.maxZ;
    let hr = Infinity;
    if (underPlatform) hr = platformUnder - t.y;
    else if (!rectInside(t.rect, rect)) hr = underside - t.y;
    if (hr < minHeadroom) minHeadroom = hr;
    if (hr < LIMITS.headroom - 1e-6) shortfalls.push({ rect: t.rect, y: t.y, headroom: hr });
  }
  const side = exitSideOf(layout.exit.dir);
  const len = Math.min(rect.maxX - rect.minX, rect.maxZ - rect.minZ);
  return {
    rect, autoRect: auto, exitSide: side, requiredLength: auto.maxZ - auto.minZ, length: rect.maxZ - rect.minZ, width: rect.maxX - rect.minX,
    minHeadroom, headroomShortfalls: shortfalls, exitZone: pr, exitZoneDepth: Math.max(len, 1),
  };
}

export function computeOpening(room: RoomConfig, stairs: StairConfig, layout: Layout): OpeningResult {
  if (layout.spiral) return spiralOpening(room, stairs, layout);
  const underside = room.height - room.slabThickness;
  const side = exitSideOf(layout.exit.dir);
  const alongX = side === 'left' || side === 'right';
  const slab = slabExtent(room);
  const surfaces = allSurfaces(layout);
  const last = layout.flights[layout.flights.length - 1];

  // automatyczny: wszystko, nad czym prześwit < 205 cm, + cały ostatni bieg
  const need = surfaces.filter((s) => underside - s.y < LIMITS.headroom).map((s) => s.rect);
  need.push(...last.treadEls.map((t) => t.rect));
  const m = LIMITS.openingMargin;
  let auto = rectUnion(need);
  auto = { minX: auto.minX - m, maxX: auto.maxX + m, minZ: auto.minZ - m, maxZ: auto.maxZ + m };
  auto = clampRect(setExitEdge(auto, side, layout), slab);
  const requiredLength = alongX ? auto.maxX - auto.minX : auto.maxZ - auto.minZ;

  let rect: Rect;
  if (stairs.opening.mode === 'manual') {
    const L = stairs.opening.length;
    const W = stairs.opening.width;
    const sr = layout.structureRect;
    const ex = layout.exit.a;
    if (alongX) {
      const cz = (sr.minZ + sr.maxZ) / 2;
      rect = side === 'right' ? { minX: ex.x - L, maxX: ex.x, minZ: cz - W / 2, maxZ: cz + W / 2 } : { minX: ex.x, maxX: ex.x + L, minZ: cz - W / 2, maxZ: cz + W / 2 };
    } else {
      const cx = (sr.minX + sr.maxX) / 2;
      rect = side === 'front' ? { minX: cx - W / 2, maxX: cx + W / 2, minZ: ex.z - L, maxZ: ex.z } : { minX: cx - W / 2, maxX: cx + W / 2, minZ: ex.z, maxZ: ex.z + L };
    }
    rect = clampRect(rect, slab);
  } else rect = auto;

  // prześwit: stopnice i spocznik, które nie leżą w całości w otworze (elementy poza pokojem pomija kolizja)
  const interior: Rect = { minX: 0, maxX: room.width, minZ: 0, maxZ: room.depth };
  let minHeadroom = Infinity;
  const shortfalls: OpeningResult['headroomShortfalls'] = [];
  for (const s of surfaces) {
    if (rectInside(s.rect, rect)) continue;
    if (!rectInside(s.rect, interior)) continue;
    const hr = underside - s.y;
    if (hr < minHeadroom) minHeadroom = hr;
    if (hr < LIMITS.headroom - 1e-6) shortfalls.push({ rect: s.rect, y: s.y, headroom: hr });
  }

  // strefa wyjścia
  const d = layout.exit.dir;
  const zoneDepth = 0.8;
  const a = layout.exit.a;
  const b = layout.exit.b;
  const zone: Rect = {
    minX: Math.min(a.x, b.x, a.x + d.x * zoneDepth, b.x + d.x * zoneDepth),
    maxX: Math.max(a.x, b.x, a.x + d.x * zoneDepth, b.x + d.x * zoneDepth),
    minZ: Math.min(a.z, b.z, a.z + d.z * zoneDepth, b.z + d.z * zoneDepth),
    maxZ: Math.max(a.z, b.z, a.z + d.z * zoneDepth, b.z + d.z * zoneDepth),
  };
  const avail = side === 'front' ? slab.maxZ - a.z : side === 'back' ? a.z - slab.minZ : side === 'right' ? slab.maxX - a.x : a.x - slab.minX;

  return {
    rect,
    autoRect: auto,
    exitSide: side,
    requiredLength,
    length: alongX ? rect.maxX - rect.minX : rect.maxZ - rect.minZ,
    width: alongX ? rect.maxZ - rect.minZ : rect.maxX - rect.minX,
    minHeadroom,
    headroomShortfalls: shortfalls,
    exitZone: zone,
    exitZoneDepth: avail,
  };
}
