// Schody kręcone, stopnie zabiegowe, link udostępniania.
import { describe, expect, test } from 'vitest';
import { DEFAULT_CONFIG, cloneConfig } from './defaults';
import { solve } from './solve';
import { autofit } from './autofit';
import { applyPatch } from './validate';
import { configFromHash, decodeConfig, encodeConfig, shareUrl } from './share';
import { quantities } from './quantities';
import { dimensionSpecs } from './dimensions';
import type { Config, Vec2 } from './types';

const cfg = (p: (c: Config) => void = () => {}): Config => {
  const c = cloneConfig(DEFAULT_CONFIG);
  p(c);
  return c;
};
const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);
const area = (p: Vec2[]) => Math.abs(p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + q.x * r.z - r.x * q.z; }, 0)) / 2;
const spiral = (p: (c: Config) => void = () => {}) => cfg((c) => { c.stairs.shape = 'S'; c.stairs.spiralDiameter = 1.8; c.stairs.going = 0.25; p(c); });

describe('schody kręcone', () => {
  test('ciągłość: stopnie co h, podest na poziomie stropu, kąt całkowity = wielokrotność 90°', () => {
    const s = solve(spiral());
    const sp = s.layout.spiral!;
    expect(s.layout.flights).toEqual([]);
    expect(sp.treads.length).toBe(s.calc.risers - 1);
    sp.treads.forEach((t, i) => near(t.y, (i + 1) * s.calc.rise));
    near(sp.platform.y, DEFAULT_CONFIG.room.height);
    near((sp.sweep / (Math.PI / 2)) % 1, 0, 1e-9);
    near(sp.theta * sp.treads.length, sp.sweep, 1e-9);
  });
  test('wejście styczne do kierunku wejścia, wyjście prostopadłe do linii wyjścia i wchodzi na podest', () => {
    for (const entry of ['back', 'front', 'left', 'right'] as const) for (const turn of ['left', 'right'] as const) {
      const s = solve(spiral((c) => { c.stairs.entry = entry; c.stairs.turn = turn; c.room.width = 4; c.room.depth = 4; }));
      const sp = s.layout.spiral!;
      const tan = { x: -sp.sense * Math.sin(sp.phi0), z: sp.sense * Math.cos(sp.phi0) };
      near(tan.x, s.layout.entry.dir.x, 1e-9);
      near(tan.z, s.layout.entry.dir.z, 1e-9);
      const ex = s.layout.exit;
      const radial = { x: ex.b.x - ex.a.x, z: ex.b.z - ex.a.z };
      near(radial.x * ex.dir.x + radial.z * ex.dir.z, 0, 1e-9);
      // środek podestu leży po stronie wyjścia
      const pr = sp.platform.rect;
      const pc = { x: (pr.minX + pr.maxX) / 2 - ex.point.x, z: (pr.minZ + pr.maxZ) / 2 - ex.point.z };
      expect(pc.x * ex.dir.x + pc.z * ex.dir.z).toBeGreaterThan(0);
    }
  });
  test('stopnie mieszczą się w okręgu, kwadratowy rzut, otwór obejmuje spiralę', () => {
    const s = solve(spiral());
    const sp = s.layout.spiral!;
    for (const t of sp.treads) for (const p of t.poly!) expect(Math.hypot(p.x - sp.center.x, p.z - sp.center.z)).toBeLessThanOrEqual(sp.radius + 1e-9);
    const f = s.layout.structureRect;
    near(f.maxX - f.minX, 1.8);
    near(f.maxZ - f.minZ, 1.8);
    const o = s.opening.rect;
    expect(o.maxX - o.minX).toBeGreaterThanOrEqual(1.8);
    expect(s.fit.fits).toBe(true);
  });
  test('za mało stopni na obrót → błąd prześwitu nad samą sobą', () => {
    const bad = solve(spiral((c) => { c.stairs.spiralDiameter = 1.4; c.stairs.going = 0.3; }));
    expect(bad.layout.spiral!.selfHeadroom).toBeLessThan(2.0);
    expect(bad.messages.some((m) => m.id === 'spiral-self' && m.level === 'error')).toBe(true);
    const ok = solve(spiral((c) => { c.stairs.spiralDiameter = 2.0; c.stairs.going = 0.22; }));
    expect(ok.messages.some((m) => m.id === 'spiral-self')).toBe(false);
  });
  test('auto-dopasowanie spirali w małym pomieszczeniu i sugestia spirali gdy U się nie mieści', () => {
    const c = cfg((x) => { x.room.width = 2.2; x.room.depth = 2.2; });
    const r = autofit(c, 'S');
    expect(r.ok).toBe(true);
    const s = solve(applyPatch(c, r.patch!));
    expect(s.fit.fits).toBe(true);
    expect(s.messages.some((m) => m.level === 'error')).toBe(false);
    expect(solve(c).suggestions.some((x) => x.id === 'shape-S')).toBe(true);
  });
  test('balustrada spiralna: helisa od h do H, gładka; balustrada otworu bez ćwiartki podestu', () => {
    const s = solve(spiral());
    const helix = s.rails.find((r) => r.id === 'spiral-outer')!;
    expect(helix.smooth).toBe(true);
    near(helix.points[0].y, s.calc.rise);
    near(helix.points[helix.points.length - 1].y, DEFAULT_CONFIG.room.height);
    expect(s.rails.some((r) => r.id === 'platform-edge')).toBe(true);
    expect(quantities(spiral(), s).some((q) => q.name.startsWith('Kolumna centralna'))).toBe(true);
    expect(dimensionSpecs(spiral(), s, 'top').some((d) => d.id === 't-dia')).toBe(true);
    expect(dimensionSpecs(spiral(), s, 'side').length).toBeGreaterThan(2);
  });
});

describe('stopnie zabiegowe', () => {
  for (const shape of ['L', 'U'] as const) for (const turn of ['left', 'right'] as const) {
    test(`${shape} ${turn}: wysokości ciągłe, wielokąty wypełniają zakręt, ostatni stopień na stropie`, () => {
      const k = shape === 'L' ? 3 : 6;
      const c = cfg((x) => { x.stairs.shape = shape; x.stairs.turn = turn; x.stairs.turnType = 'winders'; x.stairs.winders = k; x.room.width = 4.5; x.room.depth = 5; });
      const s = solve(c);
      const W = s.layout.winder!;
      expect(W.treads.length).toBe(k);
      expect(s.layout.landing).toBeNull();
      const ys = [...s.layout.flights.flatMap((f) => f.treadEls.map((t) => t.y)), ...W.treads.map((t) => t.y)].sort((a, b) => a - b);
      expect(ys.length).toBe(s.calc.risers - 1);
      ys.forEach((y, i) => near(y, (i + 1) * s.calc.rise, 1e-9));
      const w = c.stairs.width;
      const expected = shape === 'L' ? w * w : (2 * w + c.stairs.gap) * Math.max(c.stairs.landingDepth, w * 0.8);
      near(W.treads.reduce((a, t) => a + area(t.poly!), 0), expected, 1e-6);
      near(s.layout.flights[1].topY, DEFAULT_CONFIG.room.height);
      expect(s.rails.filter((r) => r.side === 'outer').length).toBe(1);
    });
  }
  test('podział wewnętrznej balustrady w narożu i sugestia zastąpienia spocznika', () => {
    const c = cfg((x) => { x.stairs.shape = 'L'; x.stairs.turnType = 'winders'; x.room.width = 4; x.room.depth = 5; x.railing.inner = 'balustrade'; });
    expect(solve(c).rails.filter((r) => r.side === 'inner').length).toBe(2);
    const tight = cfg((x) => { x.stairs.shape = 'L'; x.room.width = 3.6; x.room.depth = 3.55; });
    const s = solve(tight);
    if (!s.fit.fits) expect(s.suggestions.some((x) => x.id === 'winders' || x.id.startsWith('shape'))).toBe(true);
  });
  test('auto-dopasowanie zachowuje stopnie zabiegowe', () => {
    const c = cfg((x) => { x.stairs.shape = 'L'; x.stairs.turnType = 'winders'; x.room.width = 3.2; x.room.depth = 3.6; });
    const r = autofit(c);
    expect(r.ok).toBe(true);
    const s = solve(applyPatch(c, r.patch!));
    expect(s.layout.winder).not.toBeNull();
    expect(s.fit.fits).toBe(true);
  });
});

describe('szkło i link', () => {
  test('szkło bez pochwytu → ostrzeżenie; z drewnianym pochwytem — brak', () => {
    const ids = (p: (c: Config) => void) => solve(cfg(p)).messages.map((m) => m.id);
    expect(ids((c) => { c.railing.type = 'glass'; c.railing.glassTop = 'none'; })).toContain('glass-handrail');
    expect(ids((c) => { c.railing.type = 'glass'; c.railing.glassTop = 'woodCap'; })).not.toContain('glass-handrail');
  });
  test('link: koduje tylko różnice i odtwarza konfigurację', () => {
    const c = spiral((x) => { x.railing.type = 'glass'; x.railing.glassTint = 'bronze'; x.treads.wood = 'walnut'; });
    const code = encodeConfig(c);
    expect(code.length).toBeLessThan(200);
    expect(decodeConfig(code)).toEqual(c);
    expect(configFromHash(shareUrl(c, 'https://design3d.pl/konfigurator/').split('/konfigurator/')[1])).toEqual(c);
    expect(encodeConfig(DEFAULT_CONFIG)).toBe('e30');
    expect(decodeConfig('!!!')).toBeNull();
  });
});
