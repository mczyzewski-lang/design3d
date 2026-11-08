// Zestawienie ilościowe (baza pod BOM) — BEZ cen.
import { GLASS_MOUNTS, GLASS_TINTS, GLASS_TOPS, railingSpec, stepStyleOf, structureMaterial, structureSpec, woodSpec } from './catalog';
import { pathLength } from './railingLayout';
import { alongLength, flightLed, ledModeOf, spotSteps } from './led';
import type { Config, Solved } from './types';

export interface QtyItem { group: string; name: string; qty: number; unit: string }

const r2 = (x: number) => Math.round(x * 100) / 100;

export function quantities(c: Config, s: Solved): QtyItem[] {
  const L = s.layout;
  const items: QtyItem[] = [];
  const polyArea = (p: Array<{ x: number; z: number }>) => Math.abs(p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + q.x * r.z - r.x * q.z; }, 0)) / 2;
  if (L.spiral) {
    const sp = L.spiral;
    const t = c.stairs.treadThickness;
    const area = sp.treads.reduce((a, tr) => a + polyArea(tr.poly!), 0);
    const plat = (sp.platform.rect.maxX - sp.platform.rect.minX) * (sp.platform.rect.maxZ - sp.platform.rect.minZ);
    items.push({ group: 'Drewno', name: `Stopnie klinowe (${woodSpec(c.treads.wood).label}, ${Math.round(t * 1000)} mm)`, qty: sp.treads.length, unit: 'szt.' });
    items.push({ group: 'Drewno', name: 'Powierzchnia stopni', qty: r2(area), unit: 'm²' });
    items.push({ group: 'Drewno', name: 'Górny podest', qty: r2(plat), unit: 'm²' });
    items.push({ group: 'Stal', name: 'Kolumna centralna Ø120', qty: r2(c.room.height), unit: 'mb' });
    items.push({ group: 'Stal', name: 'Tuleje dystansowe + wsporniki stopni', qty: sp.treads.length, unit: 'kpl.' });
    items.push({ group: 'Stal', name: 'Płyty kotwiące (posadzka + strop)', qty: 2, unit: 'szt.' });
    const railLen = s.rails.reduce((a, p) => a + pathLength(p.points), 0);
    if (railLen) items.push({ group: 'Balustrada', name: `${railingSpec(c.railing.type).label} (spirala + otwór)`, qty: r2(railLen), unit: 'mb' });
    if (c.lighting.led) items.push({ group: 'Oświetlenie', name: `Taśma LED ${c.lighting.ledTemp} K`, qty: r2(sp.treads.length * (sp.radius - sp.columnRadius)), unit: 'mb' });
    return items;
  }
  const treads = L.flights.reduce((a, f) => a + f.treads, 0);
  const treadArea = L.flights.reduce((a, f) => a + f.treads * f.width * (f.going + f.nosing), 0);
  const landingArea = L.landing ? (L.landing.rect.maxX - L.landing.rect.minX) * (L.landing.rect.maxZ - L.landing.rect.minZ) : 0;
  const t = c.stairs.treadThickness;
  const wood = woodSpec(c.treads.wood).label;
  items.push({ group: 'Drewno', name: `Stopnice (${wood}, ${Math.round(t * 1000)} mm)`, qty: treads, unit: 'szt.' });
  items.push({ group: 'Drewno', name: 'Powierzchnia stopnic', qty: r2(treadArea), unit: 'm²' });
  if (L.landing) items.push({ group: 'Drewno', name: 'Okładzina spocznika', qty: r2(landingArea), unit: 'm²' });
  if (L.winder) items.push({ group: 'Drewno', name: 'Stopnie zabiegowe', qty: L.winder.treads.length, unit: 'szt.' });
  items.push({ group: 'Drewno', name: 'Objętość drewna (stopnice + spocznik)', qty: Math.round((treadArea + landingArea) * t * 1000) / 1000, unit: 'm³' });
  const style = stepStyleOf(c);
  if (style === 'closedFront' || style === 'boxed' || style === 'solid') items.push({ group: 'Drewno', name: 'Podstopnice', qty: L.flights.reduce((a, f) => a + f.risers, 0) + (L.winder?.treads.length ?? 0), unit: 'szt.' });
  if (style === 'blocks') items.push({ group: 'Drewno', name: 'Stopnie klockowe (masywne)', qty: treads, unit: 'szt.' });
  if (style === 'boxed' || style === 'solid') {
    const side = L.flights.reduce((a, f) => {
      const slope = Math.hypot(f.length, f.topY - f.baseY);
      return a + (style === 'solid' ? 2 * f.length * (f.baseY + (f.topY - f.baseY) / 2) : 2 * slope * 0.35 + slope * f.width);
    }, 0);
    items.push({ group: 'Zabudowa', name: style === 'solid' ? 'Okładzina pełnej zabudowy do posadzki' : 'Okładzina boków i podbitka', qty: r2(side), unit: 'm²' });
  }

  const slope = L.flights.reduce((a, f) => a + Math.hypot(f.length, f.topY - f.baseY), 0);
  const st = c.structure.type;
  const mat = structureMaterial(st);
  const steelName = structureSpec(st).label;
  if (mat === 'concrete') {
    // płyta gr. 15 cm (prostopadle do spadku) + trójkąty stopni betonowych
    const vol = L.flights.reduce((a, f) => a + f.width * (Math.hypot(f.length, f.topY - f.baseY) * 0.15 + f.treads * 0.5 * f.rise * f.going), 0)
      + (L.winder ? L.winder.treads.reduce((a, tr) => a + polyArea(tr.poly!) * (s.calc.rise + 0.15), 0) : 0)
      + landingArea * 0.18;
    items.push({ group: 'Beton', name: 'Płyta schodowa żelbetowa C25/30, gr. 15 cm (z stopniami)', qty: Math.round(vol * 100) / 100, unit: 'm³' });
    items.push({ group: 'Beton', name: 'Zbrojenie (szacunkowo 110 kg/m³)', qty: Math.round(vol * 110), unit: 'kg' });
    items.push({ group: 'Beton', name: 'Deskowanie (spód + boki + czoła stopni)', qty: r2(L.flights.reduce((a, f) => {
      const sl = Math.hypot(f.length, f.topY - f.baseY);
      return a + sl * f.width + 2 * sl * 0.3 + f.risers * f.rise * f.width;
    }, 0) + landingArea), unit: 'm²' });
    if (L.landing) {
      const posts = { none: 0, fourPosts: 4, framePosts: 2, wall: 0 }[c.structure.landingSupport];
      if (posts) items.push({ group: 'Beton', name: 'Słupy żelbetowe spocznika 20×20', qty: posts, unit: 'szt.' });
    }
  } else {
    const grp = mat === 'wood' ? 'Drewno' : 'Stal';
    const stringerCount = st === 'centralBeam' ? 1 : 2;
    const profile: Record<string, string> = { centralBeam: 'profil 200×120', sideStringers: 'blacha 12 mm, h 260', zigzag: 'blacha 10 mm (zygzak)', bentPlate: 'taśma gięta 10 mm', weldedFrame: 'profil 100×50', woodStringers: `klejonka ${wood.toLowerCase()} 60×300 mm` };
    items.push({ group: grp, name: `${steelName} — ${profile[st]}`, qty: r2(slope * stringerCount), unit: 'mb' });
    if (st === 'centralBeam') items.push({ group: 'Stal', name: 'Żebra + płaskowniki pod stopnicami', qty: treads, unit: 'kpl.' });
    if (st === 'sideStringers') items.push({ group: 'Stal', name: 'Kątowniki pod stopnice', qty: treads * 2, unit: 'szt.' });
    if (st === 'woodStringers') items.push({ group: 'Drewno', name: 'Listwy nośne pod stopnice (ukryte)', qty: treads * 2, unit: 'szt.' });
    if (st === 'weldedFrame') {
      items.push({ group: 'Stal', name: 'Ramki stopnic 30×30', qty: treads, unit: 'szt.' });
      items.push({ group: 'Stal', name: 'Słupy pośrednie', qty: L.flights.reduce((a, f) => a + (f.length > 1.6 ? Math.floor(f.length / 1.6) * 2 : 0), 0), unit: 'szt.' });
    }
    if (L.landing) {
      const per = 2 * (L.landing.rect.maxX - L.landing.rect.minX + L.landing.rect.maxZ - L.landing.rect.minZ);
      items.push({ group: grp, name: 'Rama spocznika', qty: r2(per), unit: 'mb' });
      const posts = { none: 0, fourPosts: 4, framePosts: 2, wall: 0 }[c.structure.landingSupport];
      if (posts) items.push({ group: grp, name: 'Słupy spocznika', qty: posts, unit: 'szt.' });
    }
    items.push({ group: 'Stal', name: mat === 'wood' ? 'Kotwy stalowe policzków (posadzka + strop)' : 'Płyty kotwiące (posadzka + strop)', qty: stringerCount * 2, unit: 'szt.' });
  }

  const rc = c.railing;
  const spec = railingSpec(rc.type);
  const balust = s.rails.filter((p) => p.kind === 'balustrade');
  const railLen = balust.reduce((a, p) => a + pathLength(p.points), 0);
  if (railLen > 0) {
    items.push({ group: 'Balustrada', name: `${spec.label} — długość`, qty: r2(railLen), unit: 'mb' });
    if (rc.type !== 'glass') items.push({ group: 'Balustrada', name: `Pochwyt (${rc.handrailMaterial === 'wood' ? 'drewno' : 'stal'})`, qty: r2(railLen), unit: 'mb' });
    if (spec.hasSpacing && rc.type !== 'horizontalBars') items.push({ group: 'Balustrada', name: 'Elementy wypełnienia (pręty/płaskowniki)', qty: Math.ceil(railLen / rc.spacing), unit: 'szt.' });
    if (rc.type === 'horizontalBars') items.push({ group: 'Balustrada', name: 'Pręty poziome', qty: r2(railLen * Math.max(1, Math.floor((rc.height - 0.15) / rc.spacing))), unit: 'mb' });
    const area = railLen * (rc.height - 0.1);
    if (['perforated', 'mesh', 'solid'].includes(rc.type)) items.push({ group: 'Balustrada', name: 'Panele wypełnienia', qty: r2(area), unit: 'm²' });
    if (rc.type === 'glass') {
      const tint = GLASS_TINTS.find((g) => g.key === rc.glassTint)!.label.toLowerCase();
      items.push({ group: 'Balustrada', name: `Szkło VSG ${(rc.glassThickness * 1000).toFixed(1).replace('.', ',')} mm, ${tint}`, qty: r2(area), unit: 'm²' });
      items.push({ group: 'Balustrada', name: `Mocowanie: ${GLASS_MOUNTS.find((g) => g.key === rc.glassMount)!.label.toLowerCase()}`, qty: r2(railLen), unit: 'mb' });
      if (rc.glassTop !== 'none') items.push({ group: 'Balustrada', name: GLASS_TOPS.find((g) => g.key === rc.glassTop)!.label, qty: r2(railLen), unit: 'mb' });
    }
  }
  const wallRail = s.rails.filter((p) => p.kind === 'wallHandrail');
  if (wallRail.length) {
    items.push({ group: 'Balustrada', name: 'Pochwyt przyścienny Ø42', qty: r2(wallRail.reduce((a, p) => a + pathLength(p.points), 0)), unit: 'mb' });
    items.push({ group: 'Balustrada', name: 'Uchwyty ścienne', qty: wallRail.reduce((a, p) => a + (p.wallBrackets?.length ?? 0), 0), unit: 'szt.' });
  }
  if (c.lighting.led) {
    const mode = ledModeOf(c);
    const tt = style === 'blocks' ? s.calc.rise - 0.014 : t;
    if (mode === 'nosing') items.push({ group: 'Oświetlenie', name: `Taśma LED pod noskami ${c.lighting.ledTemp} K + profil`, qty: r2(L.flights.reduce((a, f) => a + f.treads * f.width, 0) + (L.winder ? L.winder.treads.length * L.flights[0].width : 0) + (L.landing ? L.landing.rect.maxX - L.landing.rect.minX : 0)), unit: 'mb' });
    if (mode === 'spots') items.push({ group: 'Oświetlenie', name: `Oprawy schodowe LED ${c.lighting.ledTemp} K`, qty: L.flights.reduce((a, f) => a + spotSteps(f.treads).length, 0), unit: 'szt.' });
    if (mode === 'along') items.push({ group: 'Oświetlenie', name: `Profil LED wzdłuż biegu ${c.lighting.ledTemp} K`, qty: r2(L.flights.reduce((a, f) => a + alongLength(f, flightLed(c, f, tt)), 0)), unit: 'mb' });
    items.push({ group: 'Oświetlenie', name: 'Zasilacz LED + sterownik (czujnik ruchu / ściemniacz)', qty: 1, unit: 'kpl.' });
  }
  return items;
}
