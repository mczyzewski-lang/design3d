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
  if (s.stepsMode === 'manual') return Math.max(s.shape === 'I' ? 2 : 4, Math.round(s.manualSteps));
  return autoRiserCount(room.height, s.preferredRiser);
}

/** Podział podnoszeń na biegi [bieg1, bieg2]. Każdy bieg ma co najmniej 2 podnoszenia (≥1 stopnica). */
export function splitRisers(shape: Shape, N: number, mode: 'auto' | 'manual', manual: number): number[] {
  if (shape === 'I') return [N];
  let n1 = mode === 'manual' ? Math.round(manual) : Math.ceil(N / 2);
  n1 = Math.min(Math.max(n1, 2), N - 2);
  return [n1, N - n1];
}

export function computeCalc(room: RoomConfig, s: StairConfig): Calc {
  const N = riserCount(room, s);
  const h = room.height / N;
  const split = splitRisers(s.shape, N, s.splitMode, s.manualSplit);
  return {
    totalRise: room.height,
    risers: N,
    rise: h,
    going: s.going,
    treadDepth: s.going + s.nosing,
    blondel: 2 * h + s.going,
    angleDeg: (Math.atan2(h, s.going) * 180) / Math.PI,
    flights: split.map((n) => ({ risers: n, treads: n - 1, length: (n - 1) * s.going })),
    landingHeight: s.shape === 'I' ? null : split[0] * h,
  };
}

export interface AnalyticInput {
  shape: Shape;
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
  if (a.shape === 'I') return { across: a.width, along: L[0] + a.nosing };
  if (a.shape === 'L') {
    const lw = Math.max(a.landingWidth, a.width);
    return { across: lw + L[1], along: L[0] + a.nosing + Math.max(a.landingDepth, a.width) };
  }
  return { across: 2 * a.width + a.gap, along: Math.max(L[0], L[1]) + a.nosing + a.landingDepth };
}
