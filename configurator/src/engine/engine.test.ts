import { describe, expect, test } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig, mergeWithDefaults } from './defaults';
import { solve, solveKey } from './solve';
import { autofit } from './autofit';
import { applyPatch, cm, quickSolve } from './validate';
import { applyCollection, COLLECTIONS } from './presets';
import { dimensionSpecs } from './dimensions';
import { quantities } from './quantities';
import { autoRiserCount } from './calc';
import { pathPlanLength } from './railingLayout';
import type { Config, Layout, Shape } from './types';

const cfg = (p: (c: Config) => void = () => {}): Config => {
  const c = cloneConfig(DEFAULT_CONFIG);
  p(c);
  return c;
};
const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('konfiguracja domyślna', () => {
  const s = solve(DEFAULT_CONFIG);
  test('20 stopni × 17,5 cm, podział 10 + 10, spocznik 175 cm, Blondel 63, kąt ≈ 32°', () => {
    expect(s.calc.risers).toBe(20);
    near(s.calc.rise, 0.175);
    expect(s.calc.flights.map((f) => f.risers)).toEqual([10, 10]);
    near(s.calc.landingHeight!, 1.75);
    near(s.calc.blondel, 0.63);
    expect(Math.round(s.calc.angleDeg)).toBe(32);
    expect(s.layout.landing!.depth).toBeCloseTo(0.95, 6);
  });
  test('status „Mieści się”, wyśrodkowane, spocznik przy tylnej ścianie (8 cm), wyjście w stronę otwartą', () => {
    expect(s.status).toBe('ok');
    expect(s.messages.filter((m) => m.level !== 'info')).toEqual([]);
    near(s.fit.gaps.left, s.fit.gaps.right);
    near(s.fit.gaps.back, 0.08);
    expect(s.exitDirLabel).toBe('do przodu');
    expect(DEFAULT_CONFIG.room.walls.front).toBe(false);
  });
});

describe('A: zmiana U → I', () => {
  test('zmienia liczbę biegów, spocznik i rzut', () => {
    const u = solve(DEFAULT_CONFIG);
    const i = solve(cfg((c) => { c.stairs.shape = 'I'; c.room.depth = 6.5; }));
    expect(u.layout.flights.length).toBe(2);
    expect(i.layout.flights.length).toBe(1);
    expect(u.layout.landing).not.toBeNull();
    expect(i.layout.landing).toBeNull();
    expect(i.layout.localSize.across).toBeLessThan(u.layout.localSize.across);
    expect(i.layout.localSize.along).toBeGreaterThan(u.layout.localSize.along);
  });
});

describe('B: 300 → 350 cm', () => {
  test('przelicza stopnie; ostatni stopień kończy się na poziomie stropu', () => {
    for (const H of [3.0, 3.5]) {
      const s = solve(cfg((c) => { c.room.height = H; }));
      near(s.calc.rise * s.calc.risers, H);
      const last = s.layout.flights[s.layout.flights.length - 1];
      near(last.topY, H);
      near(last.baseY + last.risers * last.rise, H);
      expect(s.calc.rise).toBeGreaterThanOrEqual(0.15);
      expect(s.calc.rise).toBeLessThanOrEqual(0.2);
    }
    expect(solve(cfg((c) => { c.room.height = 3.0; })).calc.risers).not.toBe(20);
  });
});

describe('C: zmniejszanie głębokości', () => {
  test('daje konflikt, „Nie mieści się”, sugestie i bryły kolizji', () => {
    const s = solve(cfg((c) => { c.room.depth = 3.0; }));
    expect(s.status).toBe('nofit');
    expect(s.fit.fits).toBe(false);
    expect(s.fit.collisions.length).toBeGreaterThan(0);
    const fitMsg = s.messages.find((m) => m.id === 'fit')!;
    expect(fitMsg.title).toBe('Schody nie mieszczą się w dostępnej przestrzeni.');
    expect(fitMsg.cause).toMatch(/\d/);
    expect(s.suggestions.some((x) => /Zwiększ głębokość pomieszczenia do/.test(x.label))).toBe(true);
    const sug = s.suggestions.find((x) => x.id === 'room-depth')!;
    expect(solve(applyPatch(s.layout && cfg((c) => { c.room.depth = 3.0; }), sug.patch)).fit.fits).toBe(true);
  });
});

describe('ciągłość biegów L i U', () => {
  for (const shape of ['L', 'U'] as Shape[]) {
    for (const turn of ['left', 'right'] as const) {
      test(`${shape} ${turn}`, () => {
        const s = solve(cfg((c) => { c.stairs.shape = shape; c.stairs.turn = turn; c.room.width = 4; c.room.depth = 5; }));
        const [f1, f2] = s.layout.flights;
        const L = s.layout.landing!;
        near(f1.topY, L.y);
        near(f2.baseY, L.y);
        near(f2.topY, DEFAULT_CONFIG.room.height);
        // koniec biegu 1 i początek biegu 2 leżą na krawędziach spocznika
        const end1 = { x: f1.origin.x + f1.dir.x * f1.length, z: f1.origin.z + f1.dir.z * f1.length };
        const onEdge = (p: { x: number; z: number }, r: typeof L.rect) =>
          Math.min(Math.abs(p.x - r.minX), Math.abs(p.x - r.maxX), Math.abs(p.z - r.minZ), Math.abs(p.z - r.maxZ)) < DEFAULT_CONFIG.stairs.nosing + 1e-6;
        expect(onEdge(end1, L.rect)).toBe(true);
        expect(onEdge(f2.origin, L.rect)).toBe(true);
        // stopnie: każdy kolejny wyżej o h
        const ys = s.layout.flights.flatMap((f) => f.treadEls.map((t) => t.y));
        const all = [...ys, L.y].sort((a, b) => a - b);
        for (let i = 1; i < all.length; i++) near(all[i] - all[i - 1], s.calc.rise, 1e-9);
      });
    }
  }
});

describe('spocznik L ≥ szerokości biegu', () => {
  test('głębokość spocznika L nie mniejsza niż bieg', () => {
    const s = solve(cfg((c) => { c.stairs.shape = 'L'; c.stairs.landingDepth = 0.5; c.room.width = 4; c.room.depth = 5; }));
    expect(s.layout.landing!.depth).toBeGreaterThanOrEqual(DEFAULT_CONFIG.stairs.width - 1e-9);
  });
});

describe('otwór i prześwit', () => {
  test('auto: krawędź wyjścia dokładnie na linii ostatniego stopnia, prześwit ≥ 205', () => {
    const s = solve(DEFAULT_CONFIG);
    near(s.opening.rect.maxZ, s.layout.exit.a.z);
    expect(s.opening.headroomShortfalls).toEqual([]);
  });
  test('ręczny za krótki otwór → „Niewystarczająca wysokość przejścia.” z wymaganą długością', () => {
    const s = solve(cfg((c) => { c.stairs.opening = { mode: 'manual', length: 1.2, width: 2.1 }; }));
    const m = s.messages.find((x) => x.id === 'headroom')!;
    expect(m.title).toBe('Niewystarczająca wysokość przejścia.');
    expect(m.suggestion).toMatch(/Zwiększ długość otworu w stropie do \d+/);
    near(s.opening.rect.maxZ, s.layout.exit.a.z); // kotwiony w linii wyjścia
    const fix = s.suggestions.find((x) => x.id === 'opening-length')!;
    const s2 = solve(applyPatch(cfg((c) => { c.stairs.opening = { mode: 'manual', length: 1.2, width: 2.1 }; }), fix.patch));
    expect(s2.opening.headroomShortfalls).toEqual([]);
  });
});

describe('walidacja ergonomii i balustrad', () => {
  test('zbyt strome schody', () => {
    const s = solve(cfg((c) => { c.stairs.stepsMode = 'manual'; c.stairs.manualSteps = 16; }));
    expect(s.messages.some((m) => m.title.startsWith('Zbyt strome schody'))).toBe(true);
  });
  test('krok, Blondel, kąt', () => {
    expect(solve(cfg((c) => { c.stairs.going = 0.215; })).messages.some((m) => m.id === 'going' && m.level === 'error')).toBe(true);
    expect(solve(cfg((c) => { c.stairs.going = 0.24; })).messages.some((m) => m.id === 'going' && m.level === 'warning')).toBe(true);
    expect(solve(cfg((c) => { c.stairs.going = 0.33; })).messages.some((m) => m.id === 'blondel')).toBe(true);
  });
  test('bieg > 18 stopni', () => {
    const s = solve(cfg((c) => { c.stairs.shape = 'I'; c.room.depth = 7; c.room.height = 4.0; }));
    expect(s.messages.some((m) => m.title === 'Zalecana zmiana liczby stopni.')).toBe(true);
  });
  test('balustrada: wysokość, prześwit, pręty poziome, szkło, otwarta krawędź, brak pochwytu, pochwyt bez ściany', () => {
    const ids = (p: (c: Config) => void) => solve(cfg(p)).messages.map((m) => m.id);
    expect(ids((c) => { c.railing.height = 0.85; })).toContain('rail-height');
    expect(ids((c) => { c.railing.spacing = 0.15; })).toContain('rail-gap');
    expect(ids((c) => { c.railing.type = 'horizontalBars'; })).toContain('rail-climb');
    expect(ids((c) => { c.railing.type = 'glass'; c.railing.glassThickness = 0.012; })).toContain('rail-glass');
    expect(ids((c) => { c.railing.outer = 'none'; })).toContain('open-outer');
    expect(ids((c) => { c.railing.outer = 'none'; })).toContain('no-handrail');
    expect(ids((c) => { c.stairs.gap = 0.3; c.room.width = 2.8; })).toContain('open-inner');
    expect(ids(() => {})).not.toContain('open-inner'); // wąska szczelina U ≤ 12 cm
    expect(ids((c) => { c.stairs.shape = 'I'; c.room.depth = 6.5; c.room.width = 3.5; c.railing.inner = 'wallHandrail'; })).toContain('wall-inner');
  });
});

describe('ścieżki balustrad', () => {
  test('E: ścieżka zewnętrzna U jest ciągła: bieg → spocznik → bieg, pozioma na spoczniku', () => {
    const s = solve(DEFAULT_CONFIG);
    const outer = s.rails.filter((r) => r.side === 'outer');
    expect(outer.length).toBe(1);
    const p = outer[0].points;
    for (let i = 0; i < p.length - 1; i++) expect(Math.hypot(p[i + 1].x - p[i].x, p[i + 1].z - p[i].z)).toBeLessThan(4);
    const L = s.layout.landing!.y;
    expect(p.filter((q) => Math.abs(q.y - L) < 1e-9).length).toBeGreaterThanOrEqual(3);
    near(p[p.length - 1].y, DEFAULT_CONFIG.room.height);
    // odsunięcie 3,5 cm na zewnątrz krawędzi
    expect(pathPlanLength(p)).toBeGreaterThan(2 * 2.52 + 2.0);
  });
  test('bez balustrady spocznika ścieżka dzieli się na dwie', () => {
    const s = solve(cfg((c) => { c.railing.landing = false; }));
    expect(s.rails.filter((r) => r.side === 'outer').length).toBe(2);
  });
});

describe('auto-dopasowanie', () => {
  test('znajduje rozwiązanie mieszczące się bez błędów', () => {
    const c = cfg((x) => { x.room.depth = 3.1; });
    const r = autofit(c);
    expect(r.ok).toBe(true);
    const s = solve(applyPatch(c, r.patch!));
    expect(s.fit.fits).toBe(true);
    expect(s.opening.headroomShortfalls.length).toBe(0);
    expect(s.messages.some((m) => m.level === 'error')).toBe(false);
  });
  test('brak rozwiązania → komunikat i inne kształty', () => {
    const c = cfg((x) => { x.stairs.shape = 'I'; x.room.depth = 3.9; x.room.width = 4; });
    const r = autofit(c);
    expect(r.ok).toBe(false);
    expect(r.message).toBe('Brak wykonalnej geometrii schodów typu I');
    expect(r.feasibleShapes.length).toBeGreaterThan(0);
    for (const sh of r.feasibleShapes) expect(autofit(c, sh).ok).toBe(true);
  });
  test('ciasne pomieszczenie bez żadnego rozwiązania', () => {
    const r = autofit(cfg((x) => { x.room.width = 1.6; x.room.depth = 2.0; }));
    expect(r.ok).toBe(false);
    expect(r.feasibleShapes).toEqual([]);
  });
});

describe('F: materiały nie zmieniają layoutu', () => {
  test('zmiana drewna/koloru/LED → ten sam klucz i ta sama tożsamość rozwiązania', () => {
    const a = solve(DEFAULT_CONFIG);
    const b = solve(cfg((c) => { c.treads.wood = 'walnut'; c.steel.color = '#ffffff'; c.lighting.night = true; }));
    expect(solveKey(DEFAULT_CONFIG)).toBe(solveKey(cfg((c) => { c.treads.wood = 'walnut'; })));
    expect(b).toBe(a);
    expect(b.layout).toBe(a.layout);
  });
});

describe('G: wymiary rzutu', () => {
  test('widok z góry zawiera pokój, rzut, odstępy, biegi, spocznik, odstęp U i otwór', () => {
    const s = solve(DEFAULT_CONFIG);
    const ids = dimensionSpecs(DEFAULT_CONFIG, s, 'top').map((d) => d.id);
    for (const id of ['t-w', 't-d', 't-fw', 't-fd', 't-gl', 't-gr', 't-gb', 't-bw0', 't-bw1', 't-bl0', 't-lw', 't-gap', 't-ow']) expect(ids).toContain(id);
    const side = dimensionSpecs(DEFAULT_CONFIG, s, 'side').map((d) => d.label);
    expect(side.some((l) => l.startsWith('H 350'))).toBe(true);
    expect(side.some((l) => l.startsWith('spocznik 175'))).toBe(true);
    expect(side.some((l) => l.startsWith('h 17,5'))).toBe(true);
  });
});

describe('różne', () => {
  test('formatowanie cm bez „−0”', () => {
    expect(cm(-0.00001)).toBe('0');
    expect(cm(0.175)).toBe('17,5');
  });
  test('kolekcje zmieniają tylko styl', () => {
    for (const col of COLLECTIONS) {
      const c = applyCollection(DEFAULT_CONFIG, col.key);
      expect(c.room).toEqual(DEFAULT_CONFIG.room);
      expect(c.stairs).toEqual(DEFAULT_CONFIG.stairs);
    }
  });
  test('zestawienie ilościowe bez cen', () => {
    const q = quantities(DEFAULT_CONFIG, solve(DEFAULT_CONFIG));
    expect(q.find((x) => x.name.startsWith('Stopnice'))!.qty).toBe(18);
    expect(JSON.stringify(q)).not.toMatch(/zł|PLN|cena/i);
  });
  test('import JSON uzupełnia braki wartościami domyślnymi', () => {
    const c = mergeWithDefaults({ room: { height: 3.0 }, stairs: { shape: 'L' } });
    expect(c.room.height).toBe(3.0);
    expect(c.stairs.shape).toBe('L');
    expect(c.railing.type).toBe('verticalBars');
  });
  test('autoRiserCount trzyma h w 15–20 cm', () => {
    for (let H = 2.5; H <= 4.5; H += 0.05) {
      const n = autoRiserCount(H, 0.175);
      expect(H / n).toBeLessThanOrEqual(0.2 + 1e-9);
      expect(H / n).toBeGreaterThanOrEqual(0.15 - 1e-9);
    }
  });
  test('4 kierunki wejścia × 3 kształty dają spójny układ w pokoju', () => {
    for (const shape of ['I', 'L', 'U'] as Shape[]) for (const entry of ['back', 'front', 'left', 'right'] as const) {
      const c = cfg((x) => { x.stairs.shape = shape; x.stairs.entry = entry; x.room.width = 7; x.room.depth = 7; });
      const q = quickSolve(c);
      const L: Layout = q.layout;
      expect(q.fit.fits).toBe(true);
      const ex = L.exit;
      // ostatni stopień dochodzi do linii wyjścia
      const last = L.flights[L.flights.length - 1];
      const end = { x: last.origin.x + last.dir.x * last.length, z: last.origin.z + last.dir.z * last.length };
      near(end.x, ex.point.x, 1e-9);
      near(end.z, ex.point.z, 1e-9);
    }
  });
});
