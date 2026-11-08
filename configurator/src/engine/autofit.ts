// „Dopasuj automatycznie”: przeszukanie parametrów, szybki filtr rozmiarem analitycznym, pełna walidacja najlepszych.
import { LIMITS } from './catalog';
import { analyticSize, spiralParams, windersOf } from './calc';
import { wallGaps } from './layout';
import { quickSolve, validate, applyPatch } from './validate';
import type { Config, EntryDir, Patch, Shape } from './types';

export interface AutofitResult {
  ok: boolean;
  shape: Shape;
  patch?: Patch;
  summary?: string;
  message?: string;
  feasibleShapes: Shape[];
  tested: number;
}

interface Cand { N: number; s: number; n1: number; ld: number; w: number; entry: EntryDir; cost: number; d?: number }

const ENTRIES: EntryDir[] = ['back', 'front', 'left', 'right'];

function spiralCands(c: Config): { cands: Cand[]; tested: number } {
  const H = c.room.height;
  const g = wallGaps(c.stairs);
  const m = c.railing.outer !== 'none' ? LIMITS.railMargin : 0;
  const maxD = Math.min(LIMITS.spiralMaxDiameter, c.room.width - g.left - g.right - 2 * m, c.room.depth - g.back - g.front - 2 * m);
  const cands: Cand[] = [];
  let tested = 0;
  const nMin = Math.ceil(H / LIMITS.riserMax - 1e-9);
  const nMax = Math.floor(H / LIMITS.riserMin + 1e-9);
  for (let d = LIMITS.spiralMinDiameter; d <= maxD + 1e-9; d = Math.round((d + 0.1) * 100) / 100) {
    for (let N = nMin; N <= nMax; N++) {
      const h = H / N;
      for (let g = 0.18; g <= 0.32 + 1e-9; g = Math.round((g + 0.01) * 100) / 100) {
        tested++;
        const sp = spiralParams({ ...c.stairs, spiralDiameter: d, going: g }, N, h, c.stairs.treadThickness);
        const eff = sp.theta * sp.walkRadius;
        const bl = 2 * h + eff;
        if (sp.risersPerTurn * h - c.stairs.treadThickness < LIMITS.spiralSelfHeadroom) continue;
        if (eff < LIMITS.spiralGoingWarn - 1e-9 || bl < LIMITS.blondelOkMin - 1e-9 || bl > LIMITS.blondelOkMax + 1e-9) continue;
        for (const entry of ENTRIES) {
          let cost = Math.abs(bl - 0.63) * 100 + Math.abs(h - 0.18) * 120 + Math.abs(eff - 0.25) * 60 + Math.max(0, 1.6 - d) * 15 + Math.max(0, d - 2.0) * 8;
          if (entry !== c.stairs.entry) cost += 0.3;
          cands.push({ N, s: g, n1: N, ld: 0, w: d, d, entry, cost });
        }
      }
    }
  }
  return { cands, tested };
}

function search(c: Config, shape: Shape, maxFull = 80): { best: Cand | null; tested: number } {
  if (shape === 'S') {
    const { cands, tested } = spiralCands(c);
    return { best: pickBest(c, shape, cands, maxFull), tested };
  }
  const H = c.room.height;
  const k = windersOf({ ...c.stairs, shape });
  const wCur = c.stairs.width;
  const nz = c.stairs.nosing;
  const g = wallGaps(c.stairs);
  const W = c.room.width;
  const D = c.room.depth;
  const outer = c.railing.outer === 'balustrade' ? LIMITS.railMargin : 0;
  const innerI = shape === 'I' && c.railing.inner === 'balustrade' ? LIMITS.railMargin : 0;
  const cands: Cand[] = [];
  const nMin = Math.ceil(H / LIMITS.riserMax - 1e-9);
  const nMax = Math.floor(H / LIMITS.riserMin + 1e-9);
  const widths: number[] = [];
  for (let w = wCur; w >= 0.8 - 1e-9; w = Math.round((w - 0.05) * 1000) / 1000) widths.push(w);
  if (!widths.length) widths.push(0.8);
  let tested = 0;
  for (let N = nMin; N <= nMax; N++) {
    const h = H / N;
    for (let s = 0.24; s <= LIMITS.goingMax + 1e-9; s = Math.round((s + 0.005) * 1000) / 1000) {
      const bl = 2 * h + s;
      if (bl < LIMITS.blondelOkMin - 1e-9 || bl > LIMITS.blondelOkMax + 1e-9) continue;
      const total = N - k + (k ? 1 : 0);
      const splits = shape === 'I' ? [N] : Array.from({ length: Math.max(0, total - 3) }, (_, i) => i + 2);
      for (const n1 of splits) {
        const n2 = total - n1;
        if (shape === 'I' ? N > 21 : n1 > LIMITS.maxRisersPerFlight || n2 > LIMITS.maxRisersPerFlight) continue;
        for (const w of widths) {
          const lds = shape === 'I' ? [0] : k ? [w] : [w, w + 0.1];
          for (const ld of lds) {
            const size = analyticSize({ shape, winders: k, split: shape === 'I' ? [N] : [n1, n2], width: w, going: s, nosing: nz, landingDepth: ld, landingWidth: w, gap: c.stairs.gap });
            const across = size.across + outer + innerI + (shape === 'U' ? outer : 0);
            const along = size.along + (shape === 'I' ? 0 : outer);
            for (const entry of ENTRIES) {
              tested++;
              const alongZ = entry === 'back' || entry === 'front';
              const fx = alongZ ? across : along;
              const fz = alongZ ? along : across;
              if (fx + g.left + g.right > W + 1e-9 || fz + g.back + g.front > D + 1e-9) continue;
              let cost = Math.abs(bl - 0.63) * 100 + Math.abs(h - 0.175) * 150;
              if (s < 0.27) cost += (0.27 - s) * 200;
              cost += (wCur - w) * 60;
              if (shape !== 'I') cost += Math.abs(n1 - n2) * (shape === 'U' ? 0.8 : 0.3);
              if (entry !== c.stairs.entry) cost += 0.3;
              if (ld > w + 1e-6) cost += 0.2;
              cands.push({ N, s, n1, ld, w, entry, cost });
            }
          }
        }
      }
    }
  }
  return { best: pickBest(c, shape, cands, maxFull), tested };
}

function pickBest(c: Config, shape: Shape, cands: Cand[], maxFull: number): Cand | null {
  cands.sort((a, b) => a.cost - b.cost);
  // pierwszy kandydat bez błędów; preferowany taki, który nie ma też ostrzeżeń
  let fallback: Cand | null = null;
  for (const k of cands.slice(0, maxFull)) {
    const cfg = applyPatch(c, { stairs: patchFor(shape, k).stairs });
    const q = quickSolve(cfg);
    if (!q.fit.fits || q.opening.headroomShortfalls.length) continue;
    const msgs = validate(cfg, q.calc, q.layout, q.fit, q.opening);
    if (msgs.some((x) => x.level === 'error')) continue;
    if (!msgs.some((x) => x.level === 'warning')) return k;
    fallback ??= k;
  }
  return fallback;
}

function patchFor(shape: Shape, k: Cand): Patch {
  if (shape === 'S') return { stairs: { shape, stepsMode: 'manual', manualSteps: k.N, going: k.s, spiralDiameter: k.d!, entry: k.entry } };
  return {
    stairs: {
      shape, stepsMode: 'manual', manualSteps: k.N, going: k.s, splitMode: shape === 'I' ? 'auto' : 'manual', manualSplit: k.n1,
      width: k.w, entry: k.entry, ...(shape === 'I' ? {} : { landingDepth: k.ld, landingWidth: k.w }),
    },
  };
}

export function autofit(c: Config, shape: Shape = c.stairs.shape): AutofitResult {
  const r = search(c, shape);
  if (r.best) {
    const k = r.best;
    const h = c.room.height / k.N;
    const f1 = (x: number) => (x * 100).toFixed(1).replace('.', ',');
    return {
      ok: true, shape, patch: patchFor(shape, k), tested: r.tested, feasibleShapes: [shape],
      summary: shape === 'S'
        ? `${k.N} stopni × ${f1(h)} cm, średnica ${(k.d! * 100).toFixed(0)} cm`
        : `${k.N} stopni × ${f1(h)} cm, krok ${f1(k.s)} cm, bieg ${(k.w * 100).toFixed(0)} cm`,
    };
  }
  const feasible = (['I', 'L', 'U', 'S'] as Shape[]).filter((sh) => sh !== shape && search(c, sh, 30).best);
  return { ok: false, shape, tested: r.tested, feasibleShapes: feasible, message: `Brak wykonalnej geometrii schodów typu ${shape}` };
}
