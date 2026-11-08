// Zmiana układu schodów „bez błędów”: od razu dopasowane parametry (krok, liczba stopni, szerokość, kierunek),
// balustrada po otwartej stronie, a w pomieszczeniu startowym — pokój, w którym dany układ się mieści.
import { autofit, type AutofitResult } from './autofit';
import { DEFAULT_CONFIG } from './defaults';
import { shapePatch } from './presets';
import { applyPatch } from './validate';
import type { Config, Shape, TurnType } from './types';

/** Pokoje startowe (szer. × głęb. w m), w których układ wychodzi bez ostrzeżeń przy kondygnacji 350 cm. */
export const STARTER_ROOMS: Record<string, { width: number; depth: number }> = {
  U: { width: DEFAULT_CONFIG.room.width, depth: DEFAULT_CONFIG.room.depth },
  'U-winders': { width: DEFAULT_CONFIG.room.width, depth: DEFAULT_CONFIG.room.depth },
  I: { width: 2.4, depth: 5.0 }, // proste 350 cm: zawsze 1 ostrzeżenie (19 stopni w biegu > 18 wg normy)
  L: { width: 3.4, depth: 4.6 },
  'L-winders': { width: 3.0, depth: 4.5 },
  S: { width: 3.0, depth: 3.0 },
};
const key = (shape: Shape, turnType: TurnType) => (turnType === 'winders' && (shape === 'L' || shape === 'U') ? `${shape}-winders` : shape);

/** Czy pomieszczenie jest nadal „startowe” (użytkownik nie zmieniał wymiarów pokoju). */
export function isStarterRoom(c: Config): boolean {
  const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  return eq(c.room.height, DEFAULT_CONFIG.room.height) && Object.values(STARTER_ROOMS).some((r) => eq(r.width, c.room.width) && eq(r.depth, c.room.depth));
}

import { solve } from './solve';

const warnings = (c: Config) => solve(c).messages.filter((m) => m.level !== 'info').length;

function fitIn(cfg: Config, shape: Shape): { config: Config; result: AutofitResult } {
  const result = autofit(cfg, shape);
  return { config: result.ok && result.patch ? applyPatch(cfg, result.patch) : cfg, result };
}

export function fitForShape(c: Config, shape: Shape, turnType: TurnType = c.stairs.turnType): { config: Config; result: AutofitResult } {
  const starter = isStarterRoom(c);
  let cfg: Config = {
    ...c,
    stairs: {
      ...c.stairs, ...shapePatch(c.stairs, shape), turnType,
      ...(starter ? { alignX: DEFAULT_CONFIG.stairs.alignX, alignZ: DEFAULT_CONFIG.stairs.alignZ } : {}),
    },
  };
  if (turnType === 'winders' && (c.stairs.turnType !== 'winders' || shape !== c.stairs.shape)) cfg.stairs.winders = shape === 'L' ? 3 : 6;
  // otwarta strona bez balustrady to ostrzeżenie — przy prostych i L domyślnie balustrada po obu stronach
  if ((shape === 'I' || shape === 'L') && cfg.railing.inner === 'none') cfg = { ...cfg, railing: { ...cfg.railing, inner: 'balustrade' } };
  if (shape === 'S' && cfg.railing.outer === 'none') cfg = { ...cfg, railing: { ...cfg.railing, outer: 'balustrade' } };
  // najpierw obecny pokój; pokój startowy podmieniamy tylko, gdy w obecnym zostają uwagi
  const here = fitIn(cfg, shape);
  if (!starter || (here.result.ok && warnings(here.config) === 0)) return here;
  const there = fitIn({ ...cfg, room: { ...cfg.room, ...STARTER_ROOMS[key(shape, turnType)] } }, shape);
  if (!there.result.ok) return here;
  return !here.result.ok || warnings(there.config) < warnings(here.config) ? there : here;
}
