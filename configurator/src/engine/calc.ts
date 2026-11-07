// Liczba stopni, podział biegów, Blondel, kąt, rozmiar analityczny.
import { LIMITS } from './catalog';
import type { Calc, RoomConfig, Shape, StairConfig } from './types';

const EPS = 1e-9;

/** N = round(H / preferowana), korekta tak, by h mieściło się w 15–20 cm. */
export function autoRiserCount(H: number, preferred: number): number {
  let n = Math.max(2, Math.round(H / preferred));
  while (H / n > LIMITS.riserMax + EPS) n++;
  while (n > 2 && H / n < LIMITS.riserMin - EPS && H / (n - 1) <= LIMITS.riserMax + EPS) n--;
  return n;
}

export function riserCount(room: RoomConfig, s: StairConfig): number {
  if (s.stepsMode === 'manual') return Math.max(s.shape === 'I' || s.shape === 'S' ? 2 : 4 + windersOf(s), Math.round(s.manualSteps));
  return autoRiserCount(room.height, s.preferredRiser);
}

/** Liczba stopni zabiegowych (0 = spocznik lub kształt bez zakrętu). */
export function windersOf(s: Pick<StairConfig, 'shape' | 'turnType' | 'winders'>): number {
  if (s.turnType !== 'winders' || (s.shape !== 'L' && s.shape !== 'U')) return 0;
  return s.shape === 'L' ? Math.min(4, Math.max(2, Math.round(s.winders))) : Math.min(7, Math.max(4, Math.round(s.winders)));
}

/**
 * Podział podnoszeń na biegi [bieg1, bieg2]. Każdy bieg ma co najmniej 2 podnoszenia (≥1 stopnica).
 * Przy stopniach zabiegowych (k): stopnice = (n1−1) + k + (n2−1) = N − 1  →  n1 + n2 = N − k + 1.
 */
export function splitRisers(shape: Shape, N: number, mode: 'auto' | 'manual', manual: number, winders = 0): number[] {
  if (shape === 'I' || shape === 'S') return [N];
  const total = N - winders + (winders ? 1 : 0);
  let n1 = mode === 'manual' ? Math.round(manual) : Math.ceil(total / 2);
  n1 = Math.min(Math.max(n1, 2), total - 2);
  return [n1, total - n1];
}

/** Schody kręcone: kąt stopnia dobrany z kroku na linii chodu, kąt całkowity zaokrąglony do 90° (górny podest w ćwiartce). */
export function spiralParams(s: StairConfig, N: number, rise: number, t: number) {
  const R = Math.min(LIMITS.spiralMaxDiameter, Math.max(LIMITS.spiralMinDiameter, s.spiralDiameter)) / 2;
  const rc = LIMITS.spiralColumnRadius;
  const rw = rc + (R - rc) * LIMITS.spiralWalkFactor;
  const nT = Math.max(1, N - 1);
  const raw = (nT * s.going) / rw;
  const q = Math.PI / 2;
  // podest leży w ćwiartce [sweep, sweep+90°] — pod nim są stopnie z obrotu niżej (kąty sweep−360°…sweep−270°).
  // Spośród sąsiednich wielokrotności 90° wybierz najbliższą tej z kroku, przy której prześwit pod podestem ≥ 205 cm.
  const H = N * rise;
  const underPlatform = (sw: number) => {
    const th = sw / nT;
    const maxAngle = sw - 3 * q; // najwyższy stopień pod podestem
    return maxAngle <= 0 ? Infinity : H - LIMITS.platformThickness - Math.min(nT, Math.ceil(maxAngle / th)) * rise;
  };
  const base = Math.round(raw / q);
  const cands = [base, base - 1, base + 1, base - 2, base + 2].map((k) => Math.max(2, k) * q);
  const sweep = cands.reduce((best, sw) => {
    const score = (x: number) => Math.abs(x - raw) + (underPlatform(x) < LIMITS.headroom ? 100 : 0);
    return score(sw) < score(best) ? sw : best;
  }, cands[0]);
  const theta = sweep / nT;
  const risersPerTurn = (2 * Math.PI) / theta;
  return { radius: R, columnRadius: rc, walkRadius: rw, theta, sweep, risersPerTurn, treadWidth: R - rc, selfHeadroom: risersPerTurn * rise - t };
}

export function computeCalc(room: RoomConfig, s: StairConfig): Calc {
  const N = riserCount(room, s);
  const h = room.height / N;
  const k = windersOf(s);
  if (s.shape === 'S') {
    const sp = spiralParams(s, N, h, s.treadThickness);
    const g = sp.theta * sp.walkRadius;
    return {
      totalRise: room.height, risers: N, rise: h, going: g, treadDepth: g + s.nosing, blondel: 2 * h + g,
      angleDeg: (Math.atan2(h, g) * 180) / Math.PI, flights: [{ risers: N, treads: N - 1, length: (N - 1) * g }], landingHeight: null,
      winders: 0, spiral: { radius: sp.radius, columnRadius: sp.columnRadius, walkRadius: sp.walkRadius, theta: sp.theta, sweep: sp.sweep, risersPerTurn: sp.risersPerTurn, treadWidth: sp.treadWidth },
    };
  }
  const split = splitRisers(s.shape, N, s.splitMode, s.manualSplit, k);
  return {
    totalRise: room.height,
    risers: N,
    rise: h,
    going: s.going,
    treadDepth: s.going + s.nosing,
    blondel: 2 * h + s.going,
    angleDeg: (Math.atan2(h, s.going) * 180) / Math.PI,
    flights: split.map((n) => ({ risers: n, treads: n - 1, length: (n - 1) * s.going })),
    landingHeight: s.shape === 'I' || k ? null : split[0] * h,
    winders: k,
    spiral: null,
  };
}

export interface AnalyticInput {
  shape: Shape;
  winders?: number;
  split: number[];
  width: number;
  going: number;
  nosing: number;
  landingDepth: number;
  landingWidth: number;
  gap: number;
}

/** Rozmiar w układzie lokalnym bez generowania elementów: across = w poprzek (u), along = wzdłuż wejścia (v). */
export function analyticSize(a: AnalyticInput): { across: number; along: number } {
  const L = a.split.map((n) => (n - 1) * a.going);
  if (a.shape === 'S') return { across: a.width, along: a.width }; // width = średnica
  if (a.winders && a.shape === 'L') return { across: a.width + L[1], along: L[0] + a.nosing + a.width };
  if (a.shape === 'I') return { across: a.width, along: L[0] + a.nosing };
  if (a.shape === 'L') {
    const lw = Math.max(a.landingWidth, a.width);
    return { across: lw + L[1], along: L[0] + a.nosing + Math.max(a.landingDepth, a.width) };
  }
  return { across: 2 * a.width + a.gap, along: Math.max(L[0], L[1]) + a.nosing + a.landingDepth };
}
