// Kolekcje — wyłącznie styl (konstrukcja, drewno, stal, balustrada). Wymiary pozostają bez zmian.
import type { Config, RailingConfig, StructureConfig, SteelConfig, TreadConfig, LightingConfig } from './types';

export interface Collection {
  key: string;
  label: string;
  description: string;
  structure: Partial<StructureConfig>;
  treads: Partial<TreadConfig>;
  steel: Partial<SteelConfig>;
  railing: Partial<RailingConfig>;
  lighting?: Partial<LightingConfig>;
}

export const COLLECTIONS: Collection[] = [
  {
    key: 'minimalBlackOak',
    label: 'Minimal Black Oak',
    description: 'Belka centralna, spocznik samonośny, dąb naturalny, czarny mat, cienkie pręty.',
    structure: { type: 'centralBeam', landingSupport: 'none', closedRisers: false },
    treads: { wood: 'oakNatural', edge: 'square' },
    steel: { preset: 'black', color: '#141414', finish: 'powder' },
    railing: { type: 'verticalBars', profile: 0.012, spacing: 0.11, handrail: 'round', handrailMaterial: 'steel', separateColor: false },
  },
  {
    key: 'japandi',
    label: 'Japandi Natural',
    description: 'Dwa policzki, jesion, jasnoszara stal, płaskowniki i drewniany pochwyt.',
    structure: { type: 'sideStringers', landingSupport: 'none', closedRisers: false },
    treads: { wood: 'ashNatural', edge: 'rounded' },
    steel: { preset: 'lightGrey', color: '#c5c7c4', finish: 'powder' },
    railing: { type: 'flatBars', profile: 0.04, spacing: 0.12, handrail: 'rect', handrailMaterial: 'wood', separateColor: false },
  },
  {
    key: 'zigzag',
    label: 'Architectural Zigzag',
    description: 'Policzki zygzakowe w antracycie, dąb miodowy, szkło VSG.',
    structure: { type: 'zigzag', landingSupport: 'none', closedRisers: false },
    treads: { wood: 'oakHoney', edge: 'square' },
    steel: { preset: 'anthracite', color: '#373f43', finish: 'powder' },
    railing: { type: 'glass', handrail: 'flat', handrailMaterial: 'steel', separateColor: false },
  },
  {
    key: 'industrial',
    label: 'Industrial Loft',
    description: 'Rama spawana, dąb wędzony, czarna stal, siatka cięto-ciągniona.',
    structure: { type: 'weldedFrame', landingSupport: 'fourPosts', closedRisers: false },
    treads: { wood: 'oakSmoked', edge: 'square' },
    steel: { preset: 'black', color: '#141414', finish: 'satin' },
    railing: { type: 'mesh', handrail: 'round', handrailMaterial: 'steel', separateColor: false },
  },
  {
    key: 'modernWhite',
    label: 'Modern White Oak',
    description: 'Gięta blacha w bieli, dąb bielony, blacha perforowana.',
    structure: { type: 'bentPlate', landingSupport: 'wall', closedRisers: true },
    treads: { wood: 'oakBleached', edge: 'rounded' },
    steel: { preset: 'white', color: '#f1f0ea', finish: 'powder' },
    railing: { type: 'perforated', handrail: 'round', handrailMaterial: 'wood', separateColor: false },
  },
  {
    key: 'darkLuxury',
    label: 'Dark Luxury',
    description: 'Belka centralna w brązie, orzech, pełne panele w kolorze szampańskim.',
    structure: { type: 'centralBeam', landingSupport: 'none', closedRisers: false },
    treads: { wood: 'walnut', edge: 'square' },
    steel: { preset: 'bronze', color: '#4a3a2c', finish: 'satin' },
    railing: { type: 'solid', handrail: 'flat', handrailMaterial: 'steel', separateColor: true, color: '#bfa982' },
    lighting: { led: true, ledTemp: 2700 },
  },
];

export function applyCollection(cfg: Config, key: string): Config {
  const c = COLLECTIONS.find((x) => x.key === key);
  if (!c) return cfg;
  return {
    ...cfg,
    collection: key,
    structure: { ...cfg.structure, ...c.structure },
    treads: { ...cfg.treads, ...c.treads },
    steel: { ...cfg.steel, ...c.steel },
    railing: { ...cfg.railing, ...c.railing },
    lighting: { ...cfg.lighting, ...(c.lighting ?? {}) },
  };
}
