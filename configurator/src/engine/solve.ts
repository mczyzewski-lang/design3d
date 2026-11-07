// Memoizowane selektory: layout i walidacja liczone tylko przy zmianie pokoju, schodów lub geometrii balustrad.
import { ENTRY_LABEL } from './catalog';
import { buildRailPaths } from './railingLayout';
import { buildSuggestions, quickSolve, statusOf, validate } from './validate';
import type { Config, Solved } from './types';

/** Klucz tylko z pól wpływających na geometrię/obliczenia (materiały, kolory i oświetlenie są pomijane). */
export function solveKey(c: Config): string {
  const r = c.railing;
  return JSON.stringify([
    c.room, c.stairs, c.structure.type, c.structure.landingSupport,
    r.type, r.height, r.profile, r.spacing, r.outer, r.inner, r.landing, r.opening, r.glassThickness,
  ]);
}

const cache = new Map<string, Solved>();
const MAX = 24;

export function solve(c: Config): Solved {
  const key = solveKey(c);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const { calc, layout, fit, opening } = quickSolve(c);
  const rails = buildRailPaths(c.room, layout, opening, c.railing);
  const messages = validate(c, calc, layout, fit, opening);
  const suggestions = buildSuggestions(c, calc, fit, opening);
  const status = statusOf(fit, messages);
  const out: Solved = { key, calc, layout, fit, opening, rails, messages, suggestions, status, exitDirLabel: exitLabel(layout.exit.dir) };
  cache.set(key, out);
  if (cache.size > MAX) cache.delete(cache.keys().next().value as string);
  return out;
}

function exitLabel(d: { x: number; z: number }): string {
  if (Math.abs(d.z) >= Math.abs(d.x)) return d.z > 0 ? ENTRY_LABEL.front : ENTRY_LABEL.back;
  return d.x > 0 ? ENTRY_LABEL.right : ENTRY_LABEL.left;
}
