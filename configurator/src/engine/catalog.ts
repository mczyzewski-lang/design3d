// Katalog: drewno, stal, konstrukcje, balustrady, limity ergonomiczne.
import type { StepStyle, GlassMount, GlassTint, GlassTop, LandingSupport, RailingType, RiserFinish, SteelFinish, StructureType, WoodKey } from './types';

export const LIMITS = {
  riserMin: 0.15,
  riserMax: 0.2,
  riserWarn: 0.19,
  goingMin: 0.22,
  goingWarn: 0.25,
  goingMax: 0.34,
  blondelOkMin: 0.6,
  blondelOkMax: 0.65,
  blondelErrMin: 0.57,
  blondelErrMax: 0.68,
  angleWarn: 41,
  angleErr: 45,
  maxRisersPerFlight: 18,
  headroom: 2.05,
  railingMinHeight: 0.9,
  railingMaxGap: 0.12,
  glassMinThickness: 0.0165,
  narrowGap: 0.12,
  railMargin: 0.05, // miejsce na balustradę poza krawędzią stopni
  railOffset: 0.035, // odsunięcie osi balustrady od krawędzi
  openingMargin: 0.05,
  slabExtension: 1.4, // strop poza pokojem przy brakującej ścianie
  wallAdjacent: 0.15,
  // schody kręcone (odniesienie ergonomiczne na linii chodu)
  spiralMinDiameter: 1.2,
  spiralMaxDiameter: 2.6,
  spiralColumnRadius: 0.06,
  spiralWalkFactor: 0.55, // linia chodu: kolumna + 55% szerokości stopnia
  spiralGoingWarn: 0.22,
  spiralGoingMin: 0.18,
  spiralTreadWidthWarn: 0.65,
  spiralSelfHeadroom: 2.0,
  platformThickness: 0.06,
  // stopnie zabiegowe
  winderGoingWarn: 0.2,
  winderInnerMin: 0.1,
};

export interface WoodSpec { key: WoodKey; label: string; base: string; dark: string; light: string; rays: boolean; contrast: number }

export const WOODS: WoodSpec[] = [
  { key: 'oakNatural', label: 'Dąb naturalny', base: '#c89f6d', dark: '#9c7444', light: '#dcb98a', rays: true, contrast: 0.55 },
  { key: 'oakBleached', label: 'Dąb bielony', base: '#e2d3bc', dark: '#c3ad8d', light: '#efe5d5', rays: true, contrast: 0.35 },
  { key: 'oakHoney', label: 'Dąb miodowy', base: '#c7883f', dark: '#97602a', light: '#dca463', rays: true, contrast: 0.55 },
  { key: 'oakSmoked', label: 'Dąb wędzony', base: '#7b5a3c', dark: '#523a25', light: '#977352', rays: true, contrast: 0.5 },
  { key: 'walnut', label: 'Orzech', base: '#6f4b33', dark: '#47301f', light: '#8b6447', rays: false, contrast: 0.6 },
  { key: 'ashNatural', label: 'Jesion naturalny', base: '#ddc6a0', dark: '#b39a72', light: '#ead9bb', rays: false, contrast: 0.6 },
  { key: 'oakBlack', label: 'Czarny dąb', base: '#2d2620', dark: '#17130f', light: '#463b31', rays: true, contrast: 0.45 },
];

export interface SteelPreset { key: string; label: string; color: string; finish: SteelFinish; ral?: string }

export const STEEL_PRESETS: SteelPreset[] = [
  { key: 'black', label: 'Czarny mat', ral: 'RAL 9005', color: '#141414', finish: 'powder' },
  { key: 'anthracite', label: 'Antracyt', ral: 'RAL 7016', color: '#373f43', finish: 'powder' },
  { key: 'white', label: 'Biały', ral: 'RAL 9016', color: '#f1f0ea', finish: 'powder' },
  { key: 'lightGrey', label: 'Jasnoszary', ral: 'RAL 7035', color: '#c5c7c4', finish: 'powder' },
  { key: 'bronze', label: 'Ciemny brąz', color: '#4a3a2c', finish: 'satin' },
  { key: 'champagne', label: 'Szampański metaliczny', color: '#bfa982', finish: 'metallic' },
  { key: 'brushed', label: 'Stal szczotkowana', color: '#b8bcbf', finish: 'brushed' },
];

export const FINISHES: Array<{ key: SteelFinish; label: string; roughness: number; metalness: number }> = [
  { key: 'powder', label: 'Mat proszkowy', roughness: 0.78, metalness: 0.15 },
  { key: 'satin', label: 'Satyna', roughness: 0.45, metalness: 0.45 },
  { key: 'metallic', label: 'Metalik', roughness: 0.3, metalness: 0.85 },
  { key: 'brushed', label: 'Szczotkowana', roughness: 0.38, metalness: 0.9 },
];

export type SupportTag = 'freestanding' | 'posts' | 'wall' | 'monolithic';
export const SUPPORT_TAG_LABEL: Record<SupportTag, string> = {
  freestanding: 'wolnostojąca',
  posts: 'wymaga słupów',
  wall: 'może wymagać ściany',
  monolithic: 'wylewana na budowie',
};

export type StructureMaterial = 'steel' | 'wood' | 'concrete';
export interface StructureSpec { key: StructureType; label: string; short: string; tag: SupportTag; closedRisersAllowed: boolean; description: string; material?: StructureMaterial }

export const STRUCTURES: StructureSpec[] = [
  { key: 'centralBeam', label: 'Belka centralna', short: 'A', tag: 'freestanding', closedRisersAllowed: false, description: 'Profil zamknięty 200×120 pod osią biegu, żebra i płaskowniki pod stopnicami — efekt lewitacji.' },
  { key: 'sideStringers', label: 'Dwa policzki boczne', short: 'B', tag: 'freestanding', closedRisersAllowed: true, description: 'Blachy 12 mm, wys. ok. 26 cm, stopnice między policzkami na kątownikach.' },
  { key: 'zigzag', label: 'Policzki zygzakowe', short: 'C', tag: 'freestanding', closedRisersAllowed: true, description: 'Profil w zęby piły kopiujący stopnie, stopnice oparte od góry.' },
  { key: 'bentPlate', label: 'Gięta blacha', short: 'D', tag: 'wall', closedRisersAllowed: true, description: 'Ciągła taśma 10 mm (stopień + podstopnica) z drewnianymi nakładkami i ukrytymi żebrami.' },
  { key: 'weldedFrame', label: 'Rama spawana', short: 'E', tag: 'posts', closedRisersAllowed: false, description: 'Dwie podłużnice 100×50, każda stopnica na ramce 30×30 ze słupkami; słupy pośrednie przy długich biegach.' },
  { key: 'woodStringers', label: 'Policzki drewniane', short: 'F', tag: 'freestanding', closedRisersAllowed: true, material: 'wood', description: 'Klejone policzki 6×30 cm z tego samego drewna co stopnice, stopnice wpuszczone między policzki na ukrytych listwach — klasyczna konstrukcja drewniana.' },
  { key: 'concrete', label: 'Płyta żelbetowa', short: 'G', tag: 'monolithic', closedRisersAllowed: true, material: 'concrete', description: 'Monolityczna płyta schodowa gr. 15 cm z betonowymi stopniami, obłożona drewnem; spocznik jako płyta żelbetowa. Wykonywana na etapie stanu surowego.' },
];

/** Materiał konstrukcji nośnej (stal domyślnie). */
export const structureMaterial = (k: StructureType): StructureMaterial => STRUCTURES.find((s) => s.key === k)?.material ?? 'steel';

export const LANDING_SUPPORTS: Array<{ key: LandingSupport; label: string }> = [
  { key: 'none', label: 'Bez słupów (samonośny)' },
  { key: 'fourPosts', label: '4 słupy' },
  { key: 'framePosts', label: 'Rama + 2 słupy' },
  { key: 'wall', label: 'Do ściany' },
];

export interface RailingSpec { key: RailingType; label: string; hasSpacing: boolean; hasPosts: boolean }

export const RAILINGS: RailingSpec[] = [
  { key: 'verticalBars', label: 'Pręty pionowe', hasSpacing: true, hasPosts: false },
  { key: 'flatBars', label: 'Płaskowniki pionowe', hasSpacing: true, hasPosts: false },
  { key: 'horizontalBars', label: 'Pręty poziome', hasSpacing: true, hasPosts: true },
  { key: 'perforated', label: 'Blacha perforowana', hasSpacing: false, hasPosts: true },
  { key: 'mesh', label: 'Siatka cięto-ciągniona', hasSpacing: false, hasPosts: true },
  { key: 'solid', label: 'Pełne panele', hasSpacing: false, hasPosts: true },
  { key: 'glass', label: 'Szkło VSG', hasSpacing: false, hasPosts: false },
];

export const ENTRY_LABEL: Record<string, string> = { back: 'do tyłu', front: 'do przodu', left: 'w lewo', right: 'w prawo' };
export const WALL_LABEL: Record<string, string> = { back: 'tylna', front: 'przednia', left: 'lewa', right: 'prawa' };
export const SHAPE_LABEL: Record<string, string> = { I: 'Proste (I)', L: 'Łamane 90° (L)', U: 'Łamane 180° (U)', S: 'Kręcone (spiralne)' };

export const woodSpec = (k: WoodKey) => WOODS.find((w) => w.key === k) ?? WOODS[0];
export const structureSpec = (k: StructureType) => STRUCTURES.find((s) => s.key === k) ?? STRUCTURES[0];
export const railingSpec = (k: RailingType) => RAILINGS.find((r) => r.key === k) ?? RAILINGS[0];

export const GLASS_MOUNTS: Array<{ key: GlassMount; label: string; hint: string }> = [
  { key: 'point', label: 'Uchwyty punktowe', hint: 'Tafle na rozetach mocowanych do boku konstrukcji, bez słupków.' },
  { key: 'channel', label: 'Listwa dolna (profil U)', hint: 'Szkło osadzone w ciągłym profilu aluminiowo-stalowym.' },
  { key: 'clamps', label: 'Zaciski między słupkami', hint: 'Tafle w zaciskach na słupkach stalowych.' },
];

export const GLASS_TINTS: Array<{ key: GlassTint; label: string; color: string; opacity: number; roughness: number; edge: string }> = [
  { key: 'clear', label: 'Bezbarwne', color: '#d9efe9', opacity: 0.22, roughness: 0.04, edge: '#4f9c84' },
  { key: 'extraClear', label: 'Extra clear (niskożelazowe)', color: '#f2f8f8', opacity: 0.16, roughness: 0.03, edge: '#a9cfc6' },
  { key: 'frosted', label: 'Satynowe (mleczne)', color: '#f4f6f5', opacity: 0.72, roughness: 0.6, edge: '#cfdcd8' },
  { key: 'grey', label: 'Grafitowe', color: '#5d6266', opacity: 0.45, roughness: 0.05, edge: '#3d4447' },
  { key: 'bronze', label: 'Brązowe', color: '#8a6d4f', opacity: 0.42, roughness: 0.05, edge: '#5e4935' },
];

export const GLASS_TOPS: Array<{ key: GlassTop; label: string }> = [
  { key: 'woodCap', label: 'Drewniany pochwyt na szkle' },
  { key: 'steelCap', label: 'Nakładka stalowa' },
  { key: 'none', label: 'Bez pochwytu' },
];

export const RISER_FINISHES: Array<{ key: RiserFinish; label: string }> = [
  { key: 'wood', label: 'Drewno jak stopnice' },
  { key: 'white', label: 'Biała lakierowana' },
  { key: 'steel', label: 'W kolorze stali' },
];

export const STEP_STYLES: Array<{ key: StepStyle; label: string; hint: string }> = [
  { key: 'open', label: 'Ażurowe', hint: 'Otwarte — bez podstopnic, widoczna konstrukcja nośna.' },
  { key: 'closedFront', label: 'Zabudowane od frontu', hint: 'Podstopnice zamykają front każdego stopnia; konstrukcja widoczna z boku.' },
  { key: 'boxed', label: 'Zabudowane z podbitką', hint: 'Podstopnice + okładzina boków i spodu wzdłuż biegu — konstrukcja ukryta.' },
  { key: 'solid', label: 'Pełna zabudowa do posadzki', hint: 'Schody jako bryła do podłogi — miejsce na schowek lub szafę pod schodami.' },
  { key: 'blocks', label: 'Klockowe', hint: 'Masywne stopnie o wysokości stopnia — efekt drewnianych bloków.' },
];

/** Styl stopni z uwzględnieniem starszych konfiguracji (closedRisers) i schodów kręconych. */
export function stepStyleOf(c: { treads: { style?: StepStyle }; structure: { closedRisers: boolean }; stairs: { shape: string } }): StepStyle {
  if (c.stairs.shape === 'S') return 'open';
  const st = c.treads.style ?? 'open';
  return st === 'open' && c.structure.closedRisers ? 'closedFront' : st;
}
