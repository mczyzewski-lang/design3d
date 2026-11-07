import { quantities } from '../engine/quantities';
import { solve } from '../engine/solve';
import { STATUS_LABEL } from '../engine/validate';
import type { Config } from '../engine/types';

/** Eksport: konfiguracja + wyniki obliczeń + zestawienie ilościowe (bez cen). */
export function exportPayload(c: Config) {
  const s = solve(c);
  return {
    app: 'Stair Studio · design3d.pl',
    exportedAt: new Date().toISOString(),
    disclaimer: 'Narzędzie koncepcyjne — wyniki nie stanowią projektu konstrukcyjnego ani potwierdzenia zgodności z przepisami.',
    units: 'metry',
    config: c,
    results: {
      status: STATUS_LABEL[s.status],
      risers: s.calc.risers,
      riserHeight: s.calc.rise,
      going: s.calc.going,
      treadDepth: s.calc.treadDepth,
      blondel: s.calc.blondel,
      angleDeg: s.calc.angleDeg,
      flights: s.calc.flights,
      landingHeight: s.calc.landingHeight,
      footprint: s.layout.footprint,
      gapsToWalls: s.fit.gaps,
      overflow: s.fit.overflow,
      opening: s.opening.rect,
      minHeadroom: Number.isFinite(s.opening.minHeadroom) ? s.opening.minHeadroom : null,
      exitDirection: s.exitDirLabel,
      messages: s.messages.map((m) => ({ level: m.level, title: m.title, cause: m.cause, suggestion: m.suggestion })),
    },
    quantities: quantities(c, s),
  };
}

export function downloadJson(obj: unknown, name: string) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickJsonFile(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return reject(new Error('Nie wybrano pliku'));
      try {
        const data = JSON.parse(await f.text());
        resolve(data && typeof data === 'object' && 'config' in data ? (data as any).config : data);
      } catch {
        reject(new Error('Niepoprawny plik JSON'));
      }
    };
    input.click();
  });
}
