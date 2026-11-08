import { describe, expect, it } from 'vitest';
import { compute, type Plan } from './fencePlan';

const base: Plan = { type: 'panel', w: 25, d: 40, sides: ['front', 'left', 'right'], h: 1.5, gate: 'swing', wickets: 1, base: true };

describe('planer ogrodzenia', () => {
  it('liczy długość bez bramy i furtki oraz przęsła 2,5 m', () => {
    const r = compute(base);
    expect(r.length).toBe(25 - 4 - 1 + 80);
    // front: 20 m netto w 3 odcinkach po 6,67 m → 3 × 3 przęsła; boki po 16 przęseł
    expect(r.spans).toBe(9 + 32);
    expect(r.gatePosts).toBe(4);
    // słupki: front 3×4 + boki 2×17 − 2 narożniki − 4 końce przy otworach
    expect(r.posts).toBe(12 + 34 - 2 - 4);
    expect(r.base).toBe(r.length);
  });
  it('pełny obwód bez otworów: słupków tyle co przęseł', () => {
    const r = compute({ ...base, sides: ['front', 'left', 'right', 'back'], gate: 'none', wickets: 0, w: 20, d: 30 });
    expect(r.length).toBe(100);
    expect(r.spans).toBe(40);
    expect(r.posts).toBe(40);
  });
  it('bez frontu nie ma bramy ani furtek; siatka w rolkach, gabion bez podmurówki', () => {
    const m = compute({ ...base, type: 'mesh', sides: ['left', 'back'] });
    expect(m.gate).toBe(false);
    expect(m.wickets).toBe(0);
    expect(m.spans).toBe(0);
    expect(m.rolls).toBe(Math.ceil(65 / 25));
    expect(compute({ ...base, type: 'gabion' }).base).toBe(0);
  });
});
