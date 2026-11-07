// Zestawienie ilościowe (baza pod BOM) — BEZ cen.
import { railingSpec, structureSpec, woodSpec } from './catalog';
import { pathLength } from './railingLayout';
import type { Config, Solved } from './types';

export interface QtyItem { group: string; name: string; qty: number; unit: string }

const r2 = (x: number) => Math.round(x * 100) / 100;

export function quantities(c: Config, s: Solved): QtyItem[] {
  const L = s.layout;
  const items: QtyItem[] = [];
  const treads = L.flights.reduce((a, f) => a + f.treads, 0);
  const treadArea = L.flights.reduce((a, f) => a + f.treads * f.width * (f.going + f.nosing), 0);
  const landingArea = L.landing ? (L.landing.rect.maxX - L.landing.rect.minX) * (L.landing.rect.maxZ - L.landing.rect.minZ) : 0;
  const t = c.stairs.treadThickness;
  const wood = woodSpec(c.treads.wood).label;
  items.push({ group: 'Drewno', name: `Stopnice (${wood}, ${Math.round(t * 1000)} mm)`, qty: treads, unit: 'szt.' });
  items.push({ group: 'Drewno', name: 'Powierzchnia stopnic', qty: r2(treadArea), unit: 'm²' });
  if (L.landing) items.push({ group: 'Drewno', name: 'Okładzina spocznika', qty: r2(landingArea), unit: 'm²' });
  items.push({ group: 'Drewno', name: 'Objętość drewna (stopnice + spocznik)', qty: Math.round((treadArea + landingArea) * t * 1000) / 1000, unit: 'm³' });
  const closed = c.structure.closedRisers && structureSpec(c.structure.type).closedRisersAllowed;
  if (closed) items.push({ group: 'Drewno', name: 'Podstopnice', qty: L.flights.reduce((a, f) => a + f.risers, 0), unit: 'szt.' });

  const slope = L.flights.reduce((a, f) => a + Math.hypot(f.length, f.topY - f.baseY), 0);
  const st = c.structure.type;
  const steelName = structureSpec(st).label;
  const stringerCount = st === 'centralBeam' ? 1 : 2;
  const profile = { centralBeam: 'profil 200×120', sideStringers: 'blacha 12 mm, h 260', zigzag: 'blacha 10 mm (zygzak)', bentPlate: 'taśma gięta 10 mm', weldedFrame: 'profil 100×50' }[st];
  items.push({ group: 'Stal', name: `${steelName} — ${profile}`, qty: r2(slope * stringerCount), unit: 'mb' });
  if (st === 'centralBeam') items.push({ group: 'Stal', name: 'Żebra + płaskowniki pod stopnicami', qty: treads, unit: 'kpl.' });
  if (st === 'sideStringers') items.push({ group: 'Stal', name: 'Kątowniki pod stopnice', qty: treads * 2, unit: 'szt.' });
  if (st === 'weldedFrame') {
    items.push({ group: 'Stal', name: 'Ramki stopnic 30×30', qty: treads, unit: 'szt.' });
    items.push({ group: 'Stal', name: 'Słupy pośrednie', qty: L.flights.reduce((a, f) => a + (f.length > 1.6 ? Math.floor(f.length / 1.6) * 2 : 0), 0), unit: 'szt.' });
  }
  if (L.landing) {
    const per = 2 * (L.landing.rect.maxX - L.landing.rect.minX + L.landing.rect.maxZ - L.landing.rect.minZ);
    items.push({ group: 'Stal', name: 'Rama spocznika', qty: r2(per), unit: 'mb' });
    const posts = { none: 0, fourPosts: 4, framePosts: 2, wall: 0 }[c.structure.landingSupport];
    if (posts) items.push({ group: 'Stal', name: 'Słupy spocznika', qty: posts, unit: 'szt.' });
  }
  items.push({ group: 'Stal', name: 'Płyty kotwiące (posadzka + strop)', qty: stringerCount * 2, unit: 'szt.' });

  const rc = c.railing;
  const spec = railingSpec(rc.type);
  const balust = s.rails.filter((p) => p.kind === 'balustrade');
  const railLen = balust.reduce((a, p) => a + pathLength(p.points), 0);
  if (railLen > 0) {
    items.push({ group: 'Balustrada', name: `${spec.label} — długość`, qty: r2(railLen), unit: 'mb' });
    items.push({ group: 'Balustrada', name: `Pochwyt (${rc.handrailMaterial === 'wood' ? 'drewno' : 'stal'})`, qty: r2(railLen), unit: 'mb' });
    if (spec.hasSpacing && rc.type !== 'horizontalBars') items.push({ group: 'Balustrada', name: 'Elementy wypełnienia (pręty/płaskowniki)', qty: Math.ceil(railLen / rc.spacing), unit: 'szt.' });
    if (rc.type === 'horizontalBars') items.push({ group: 'Balustrada', name: 'Pręty poziome', qty: r2(railLen * Math.max(1, Math.floor((rc.height - 0.15) / rc.spacing))), unit: 'mb' });
    const area = railLen * (rc.height - 0.1);
    if (['perforated', 'mesh', 'solid'].includes(rc.type)) items.push({ group: 'Balustrada', name: 'Panele wypełnienia', qty: r2(area), unit: 'm²' });
    if (rc.type === 'glass') items.push({ group: 'Balustrada', name: `Szkło VSG ${(rc.glassThickness * 1000).toFixed(1).replace('.', ',')} mm`, qty: r2(area), unit: 'm²' });
  }
  const wallRail = s.rails.filter((p) => p.kind === 'wallHandrail');
  if (wallRail.length) {
    items.push({ group: 'Balustrada', name: 'Pochwyt przyścienny Ø42', qty: r2(wallRail.reduce((a, p) => a + pathLength(p.points), 0)), unit: 'mb' });
    items.push({ group: 'Balustrada', name: 'Uchwyty ścienne', qty: wallRail.reduce((a, p) => a + (p.wallBrackets?.length ?? 0), 0), unit: 'szt.' });
  }
  if (c.lighting.led) items.push({ group: 'Oświetlenie', name: `Taśma LED ${c.lighting.ledTemp} K`, qty: r2(L.flights.reduce((a, f) => a + f.treads * f.width, 0)), unit: 'mb' });
  return items;
}
