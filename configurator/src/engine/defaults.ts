import type { Config } from './types';

/** Konfiguracja domyślna: U, kondygnacja 350, pokój 240×390, bieg 95, odstęp 10, krok 28 → 20 × 17,5 cm, 10 + 10. */
export const DEFAULT_CONFIG: Config = {
  version: 1,
  collection: 'minimalBlackOak',
  room: {
    height: 3.5,
    width: 2.4,
    depth: 3.9,
    slabThickness: 0.25,
    wallThickness: 0.2,
    walls: { back: true, left: true, right: true, front: false },
  },
  stairs: {
    shape: 'U',
    turn: 'right',
    width: 0.95,
    going: 0.28,
    treadThickness: 0.04,
    nosing: 0.02,
    stepsMode: 'auto',
    preferredRiser: 0.175,
    manualSteps: 20,
    splitMode: 'auto',
    manualSplit: 10,
    landingDepth: 0.95,
    landingWidth: 0.95,
    gap: 0.1,
    entry: 'back',
    alignX: 'center',
    alignZ: 'back',
    manualX: 0.2,
    manualZ: 0.08,
    wallGap: 0.08,
    opening: { mode: 'auto', length: 3.0, width: 2.1 },
  },
  structure: { type: 'centralBeam', landingSupport: 'none', closedRisers: false },
  treads: { wood: 'oakNatural', edge: 'square' },
  steel: { preset: 'black', color: '#141414', finish: 'powder' },
  railing: {
    type: 'verticalBars',
    height: 1.0,
    profile: 0.012,
    spacing: 0.11,
    handrail: 'round',
    handrailMaterial: 'steel',
    outer: 'balustrade',
    inner: 'none',
    landing: true,
    opening: true,
    glassThickness: 0.0176,
    separateColor: false,
    color: '#141414',
  },
  lighting: { led: true, ledTemp: 2700, ledBrightness: 0.6, night: false },
};

export function cloneConfig(c: Config): Config {
  return structuredClone(c);
}

/** Scala (np. importowany) obiekt z konfiguracją domyślną — brakujące pola uzupełnia wartościami domyślnymi. */
export function mergeWithDefaults(input: unknown): Config {
  const base = cloneConfig(DEFAULT_CONFIG);
  if (!input || typeof input !== 'object') return base;
  const src = input as Record<string, any>;
  const out: any = base;
  for (const section of ['room', 'stairs', 'structure', 'treads', 'steel', 'railing', 'lighting'] as const) {
    const s = src[section];
    if (!s || typeof s !== 'object') continue;
    for (const [k, v] of Object.entries(s)) {
      if (!(k in out[section])) continue;
      const cur = out[section][k];
      if (cur !== null && typeof cur === 'object' && v && typeof v === 'object') out[section][k] = { ...cur, ...(v as object) };
      else if (typeof cur === typeof v) out[section][k] = v;
    }
  }
  if (typeof src.collection === 'string') out.collection = src.collection;
  return out as Config;
}
