// Dopasowanie, ergonomia, bezpieczeństwo, sugestie. Wartości referencyjne mają charakter ergonomiczny — nie są certyfikatem.
import { LIMITS, ENTRY_LABEL, SHAPE_LABEL, WALL_LABEL, railingSpec } from './catalog';
import { computeCalc } from './calc';
import { buildLayout, toWorld, dirToWorld } from './layout';
import { computeOpening } from './opening';
import { wallInDirection } from './railingLayout';
import type { Calc, Config, EntryDir, Fit, Layout, Message, OpeningResult, Patch, RoomConfig, Shape, StairConfig, Status, Suggestion, WallKey } from './types';

export const cm = (m: number, digits = 1): string => {
  let v = Math.round(m * 100 * 10 ** digits) / 10 ** digits;
  if (Object.is(v, -0) || Math.abs(v) < 10 ** -(digits + 1)) v = 0;
  return v.toLocaleString('pl-PL', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
};

export function railFlags(c: Config) {
  return { outer: c.railing.outer === 'balustrade', inner: c.railing.inner === 'balustrade' && c.stairs.shape === 'I', landing: c.railing.landing };
}

export function computeFit(room: RoomConfig, layout: Layout): Fit {
  const f = layout.footprint;
  const overflow: Record<WallKey, number> = {
    left: Math.max(0, -f.minX), right: Math.max(0, f.maxX - room.width), back: Math.max(0, -f.minZ), front: Math.max(0, f.maxZ - room.depth),
  };
  const gaps: Record<WallKey, number> = { left: f.minX, right: room.width - f.maxX, back: f.minZ, front: room.depth - f.maxZ };
  const tol = 1e-4;
  const collisions: Fit['collisions'] = [];
  const zr = { minZ: Math.max(f.minZ, 0), maxZ: Math.min(f.maxZ, room.depth) };
  const xr = { minX: Math.max(f.minX, 0), maxX: Math.min(f.maxX, room.width) };
  if (overflow.left > tol) collisions.push({ side: 'left', amount: overflow.left, wallPresent: room.walls.left, rect: { minX: f.minX, maxX: 0, ...zr } });
  if (overflow.right > tol) collisions.push({ side: 'right', amount: overflow.right, wallPresent: room.walls.right, rect: { minX: room.width, maxX: f.maxX, ...zr } });
  if (overflow.back > tol) collisions.push({ side: 'back', amount: overflow.back, wallPresent: room.walls.back, rect: { minZ: f.minZ, maxZ: 0, ...xr } });
  if (overflow.front > tol) collisions.push({ side: 'front', amount: overflow.front, wallPresent: room.walls.front, rect: { minZ: room.depth, maxZ: f.maxZ, ...xr } });
  return { fits: collisions.length === 0, overflow, gaps, collisions };
}

/** Szybkie rozwiązanie geometrii (bez balustrad i komunikatów) — do sugestii i auto-dopasowania. */
export function quickSolve(c: Config): { calc: Calc; layout: Layout; fit: Fit; opening: OpeningResult } {
  const calc = computeCalc(c.room, c.stairs);
  const layout = buildLayout(c.room, c.stairs, calc, railFlags(c));
  const fit = computeFit(c.room, layout);
  const opening = computeOpening(c.room, c.stairs, layout);
  return { calc, layout, fit, opening };
}

export function withStairs(c: Config, s: Partial<StairConfig>): Config {
  return { ...c, stairs: { ...c.stairs, ...s } };
}

const flightSides = (c: Config): { outerHand: 'left' | 'right' } => ({ outerHand: c.stairs.shape !== 'I' && c.stairs.turn === 'left' ? 'right' : 'left' });

/** Czy dana strona biegów przylega do ściany (każdy segment biegu). */
function sideAgainstWall(c: Config, layout: Layout, side: 'outer' | 'inner'): boolean {
  const e = side === 'outer' ? layout.edges.outer : layout.edges.inner;
  const pts = e.points;
  let any = false;
  for (let i = 0; i < pts.length - 1; i++) {
    if (side === 'outer' && layout.edges.outer.landingSeg && i >= layout.edges.outer.landingSeg[0] && i < layout.edges.outer.landingSeg[1]) continue;
    const du = pts[i + 1].u - pts[i].u;
    const dv = pts[i + 1].v - pts[i].v;
    const L = Math.hypot(du, dv);
    if (L < 0.3) continue;
    const o = e.interior === 'right' ? { u: -dv / L, v: du / L } : { u: dv / L, v: -du / L };
    const n = dirToWorld(layout.xf, o.u, o.v);
    const mid = toWorld(layout.xf, (pts[i].u + pts[i + 1].u) / 2, (pts[i].v + pts[i + 1].v) / 2);
    const hit = wallInDirection(c.room, mid, n);
    if (!hit.present || hit.dist > LIMITS.wallAdjacent) return false;
    any = true;
  }
  return any;
}

function landingAgainstWalls(c: Config, layout: Layout): boolean {
  const seg = layout.edges.outer.landingSeg;
  if (!seg) return true;
  const pts = layout.edges.outer.points;
  for (let i = seg[0]; i < seg[1]; i++) {
    const du = pts[i + 1].u - pts[i].u;
    const dv = pts[i + 1].v - pts[i].v;
    const L = Math.hypot(du, dv);
    if (L < 0.2) continue;
    const e = layout.edges.outer;
    const o = e.interior === 'right' ? { u: -dv / L, v: du / L } : { u: dv / L, v: -du / L };
    const hit = wallInDirection(c.room, toWorld(layout.xf, (pts[i].u + pts[i + 1].u) / 2, (pts[i].v + pts[i + 1].v) / 2), dirToWorld(layout.xf, o.u, o.v));
    if (!hit.present || hit.dist > LIMITS.wallAdjacent) return false;
  }
  return true;
}

export function validate(c: Config, calc: Calc, layout: Layout, fit: Fit, opening: OpeningResult): Message[] {
  const m: Message[] = [];
  const s = c.stairs;
  const rc = c.railing;
  const h = calc.rise;

  if (!fit.fits) {
    const parts = fit.collisions.map((k) => `${k.wallPresent ? 'ściana ' : 'krawędź (brak ściany) '}${WALL_LABEL[k.side]}: ${cm(k.amount)} cm`);
    m.push({ id: 'fit', level: 'error', title: 'Schody nie mieszczą się w dostępnej przestrzeni.', cause: `Przekroczenie — ${parts.join(', ')}.`, suggestion: 'Zmień kształt, kierunek wejścia lub wymiary — zobacz sugestie poniżej.' });
  }
  if (h > LIMITS.riserMax + 1e-9) {
    m.push({ id: 'riser', level: 'error', title: 'Zbyt strome schody — zwiększ liczbę stopni lub głębokość przestrzeni.', cause: `Wysokość stopnia ${cm(h)} cm > ${cm(LIMITS.riserMax)} cm.`, suggestion: `Zwiększ liczbę stopni do co najmniej ${Math.ceil(c.room.height / LIMITS.riserMax)}.` });
  } else if (h > LIMITS.riserWarn + 1e-9) {
    m.push({ id: 'riser', level: 'warning', title: 'Wysokie stopnie.', cause: `Wysokość stopnia ${cm(h)} cm (zalecane do ${cm(LIMITS.riserWarn)} cm).`, suggestion: 'Dodaj jeden stopień.' });
  } else if (h < LIMITS.riserMin - 1e-9) {
    m.push({ id: 'riser', level: 'warning', title: 'Bardzo niskie stopnie.', cause: `Wysokość stopnia ${cm(h)} cm < ${cm(LIMITS.riserMin)} cm.`, suggestion: 'Zmniejsz liczbę stopni.' });
  }
  if (s.going < LIMITS.goingMin - 1e-9) {
    m.push({ id: 'going', level: 'error', title: 'Za płytki stopień.', cause: `Krok ${cm(s.going)} cm < ${cm(LIMITS.goingMin)} cm.`, suggestion: 'Zwiększ głębokość stopnia.' });
  } else if (s.going < LIMITS.goingWarn - 1e-9) {
    m.push({ id: 'going', level: 'warning', title: 'Płytki stopień.', cause: `Krok ${cm(s.going)} cm (zalecane ≥ ${cm(LIMITS.goingWarn)} cm).`, suggestion: 'Zwiększ głębokość stopnia.' });
  } else if (s.going > LIMITS.goingMax + 1e-9) {
    m.push({ id: 'going', level: 'warning', title: 'Bardzo głęboki stopień.', cause: `Krok ${cm(s.going)} cm > ${cm(LIMITS.goingMax)} cm.`, suggestion: 'Zmniejsz głębokość stopnia.' });
  }
  const b = calc.blondel;
  if (b < LIMITS.blondelErrMin - 1e-9 || b > LIMITS.blondelErrMax + 1e-9) {
    m.push({ id: 'blondel', level: 'error', title: 'Niewygodna proporcja stopnia (Blondel).', cause: `2h + s = ${cm(b)} cm, poza zakresem 57–68 cm (odniesienie ergonomiczne, nie certyfikat).`, suggestion: 'Skoryguj krok lub liczbę stopni, by zbliżyć się do 63 cm.' });
  } else if (b < LIMITS.blondelOkMin - 1e-9 || b > LIMITS.blondelOkMax + 1e-9) {
    m.push({ id: 'blondel', level: 'warning', title: 'Proporcja stopnia poza zalecanym zakresem.', cause: `2h + s = ${cm(b)} cm (zalecane 60–65 cm; odniesienie ergonomiczne, nie certyfikat).`, suggestion: 'Skoryguj krok o 1–2 cm.' });
  }
  if (calc.angleDeg > LIMITS.angleErr) {
    m.push({ id: 'angle', level: 'error', title: 'Zbyt duże nachylenie.', cause: `Kąt ${calc.angleDeg.toFixed(1).replace('.', ',')}° > ${LIMITS.angleErr}°.`, suggestion: 'Zwiększ krok lub liczbę stopni.' });
  } else if (calc.angleDeg > LIMITS.angleWarn) {
    m.push({ id: 'angle', level: 'warning', title: 'Duże nachylenie.', cause: `Kąt ${calc.angleDeg.toFixed(1).replace('.', ',')}° > ${LIMITS.angleWarn}°.`, suggestion: 'Zwiększ krok.' });
  }
  calc.flights.forEach((f, i) => {
    if (f.risers > LIMITS.maxRisersPerFlight) {
      m.push({ id: `flight-${i}`, level: 'warning', title: 'Zalecana zmiana liczby stopni.', cause: `Bieg ${i + 1} ma ${f.risers} stopni (zalecane ≤ ${LIMITS.maxRisersPerFlight} w jednym biegu).`, suggestion: s.shape === 'I' ? 'Rozważ schody L lub U ze spocznikiem.' : 'Zmień podział stopni między biegami.' });
    }
  });
  if (s.shape === 'U' && s.landingDepth < s.width - 1e-9) {
    m.push({ id: 'landing', level: 'warning', title: 'Spocznik krótszy niż szerokość biegu.', cause: `Spocznik ${cm(s.landingDepth)} cm < szerokość biegu ${cm(s.width)} cm.`, suggestion: `Wydłuż spocznik do ${cm(s.width)} cm.` });
  }
  if (opening.headroomShortfalls.length) {
    const worst = Math.min(...opening.headroomShortfalls.map((x) => x.headroom));
    const manual = s.opening.mode === 'manual';
    m.push({
      id: 'headroom', level: 'error', title: 'Niewystarczająca wysokość przejścia.',
      cause: `Prześwit ${cm(worst)} cm < ${cm(LIMITS.headroom)} cm (spód stropu − poziom stopnicy).`,
      suggestion: manual ? `Zwiększ długość otworu w stropie do ${cm(Math.ceil(opening.requiredLength * 100) / 100, 0)} cm.` : 'Zwiększ długość otworu w stropie (ściany ograniczają otwór) lub zmień układ schodów.',
    });
  }
  if (opening.exitZoneDepth < 0.6) {
    m.push({ id: 'exit', level: 'warning', title: 'Mała strefa wyjścia na piętro.', cause: `Za ostatnim stopniem jest tylko ${cm(Math.max(0, opening.exitZoneDepth))} cm do ściany.`, suggestion: 'Zmień kierunek wejścia lub położenie schodów.' });
  }

  // balustrady
  const spec = railingSpec(rc.type);
  const anyBalustrade = rc.outer === 'balustrade' || rc.inner === 'balustrade' || rc.opening;
  if (anyBalustrade) {
    if (rc.height < LIMITS.railingMinHeight - 1e-9) {
      m.push({ id: 'rail-height', level: 'warning', title: 'Niska balustrada.', cause: `Wysokość ${cm(rc.height)} cm < ${cm(LIMITS.railingMinHeight)} cm.`, suggestion: `Podnieś balustradę do co najmniej ${cm(LIMITS.railingMinHeight)} cm.` });
    }
    if (spec.hasSpacing) {
      const gap = rc.spacing - rc.profile;
      if (gap > LIMITS.railingMaxGap + 1e-9) {
        m.push({ id: 'rail-gap', level: 'warning', title: 'Zbyt duży prześwit między elementami balustrady.', cause: `Prześwit ${cm(gap)} cm > ${cm(LIMITS.railingMaxGap)} cm.`, suggestion: `Zmniejsz rozstaw do ${cm(LIMITS.railingMaxGap + rc.profile)} cm.` });
      }
    }
    if (rc.type === 'horizontalBars') {
      m.push({ id: 'rail-climb', level: 'warning', title: 'Pręty poziome ułatwiają wspinanie.', cause: 'Poziome wypełnienie działa jak drabinka — ryzykowne przy dzieciach.', suggestion: 'Rozważ pręty pionowe, blachę perforowaną lub szkło.' });
    }
    if (rc.type === 'glass' && rc.glassThickness < LIMITS.glassMinThickness - 1e-9) {
      m.push({ id: 'rail-glass', level: 'warning', title: 'Cienkie szkło balustrady.', cause: `Szkło ${(rc.glassThickness * 1000).toFixed(1).replace('.', ',')} mm < 16,5 mm.`, suggestion: 'Zastosuj laminat VSG ok. 17 mm (np. 8.8.2).' });
    }
  }
  const { outerHand } = flightSides(c);
  const sideName = (side: 'outer' | 'inner') => (s.shape === 'I' ? (side === 'outer' ? 'lewa' : 'prawa') : side === 'outer' ? 'zewnętrzna' : 'wewnętrzna');
  for (const side of ['outer', 'inner'] as const) {
    const mode = side === 'outer' ? rc.outer : rc.inner;
    if (side === 'inner' && s.shape === 'U' && s.gap <= LIMITS.narrowGap + 1e-9) continue;
    const walled = sideAgainstWall(c, layout, side);
    if (mode === 'none' && !walled) {
      m.push({ id: `open-${side}`, level: 'warning', title: 'Otwarta krawędź bez balustrady.', cause: `Strona ${sideName(side)} schodów nie przylega do ściany i nie ma balustrady.`, suggestion: 'Dodaj balustradę po tej stronie.' });
    }
    if (mode === 'wallHandrail' && !walled) {
      m.push({ id: `wall-${side}`, level: 'warning', title: 'Pochwyt przyścienny bez ściany.', cause: `Strona ${sideName(side)} nie przylega do ściany — pochwyt nie ma do czego się mocować.`, suggestion: 'Ustaw schody przy ścianie lub wybierz balustradę.' });
    }
  }
  if (s.shape !== 'I' && rc.outer === 'balustrade' && !rc.landing && !landingAgainstWalls(c, layout)) {
    m.push({ id: 'open-landing', level: 'warning', title: 'Otwarta krawędź spocznika.', cause: 'Spocznik ma krawędzie, które nie przylegają do ściany i nie mają balustrady.', suggestion: 'Włącz balustradę wokół spocznika.' });
  }
  if (rc.outer === 'none' && rc.inner === 'none') {
    m.push({ id: 'no-handrail', level: 'warning', title: 'Brak jakiegokolwiek pochwytu.', cause: 'Żadna strona schodów nie ma balustrady ani pochwytu przyściennego.', suggestion: 'Dodaj pochwyt co najmniej po jednej stronie.' });
  }
  void outerHand;

  // kotwienie (informacje)
  const st = c.structure;
  const infos: Record<string, string> = {
    centralBeam: 'Belka centralna przenosi obciążenia na płyty kotwiące w posadzce i czole stropu — wymaga sztywnego zamocowania.',
    sideStringers: 'Policzki boczne kotwione w posadzce i czole stropu; stopnice na kątownikach.',
    zigzag: 'Policzki zygzakowe kotwione w posadzce i czole stropu.',
    bentPlate: 'Gięta blacha: przy dłuższych biegach może wymagać dodatkowego mocowania do ściany.',
    weldedFrame: 'Rama spawana ze słupami pośrednimi pod biegami dłuższymi niż ok. 1,6 m.',
  };
  m.push({ id: 'anchor', level: 'info', title: 'Kotwienie konstrukcji.', cause: infos[st.type] });
  if (s.shape !== 'I') {
    const ls: Record<string, string> = {
      none: 'Spocznik samonośny: rama skrzynkowa zespolona z belkami biegów, kotwienie wyłącznie w posadzce i stropie.',
      fourPosts: 'Spocznik na 4 słupach sięgających posadzki.',
      framePosts: 'Spocznik: rama + 2 słupy przy dalszej krawędzi.',
      wall: 'Spocznik mocowany blachami do przylegających ścian; słupy tylko przy wolnych narożach.',
    };
    m.push({ id: 'landing-support', level: 'info', title: 'Podparcie spocznika.', cause: ls[st.landingSupport] });
  }
  if (rc.type === 'glass' && anyBalustrade) {
    m.push({ id: 'glass-info', level: 'info', title: 'Szkło VSG.', cause: 'Panele szklane mocowane na uchwytach punktowych do konstrukcji — bez słupków.' });
  }
  m.push({ id: 'concept', level: 'info', title: 'Narzędzie koncepcyjne.', cause: 'Wyniki nie stanowią projektu konstrukcyjnego ani potwierdzenia zgodności z przepisami — wymagają weryfikacji przez konstruktora.' });
  return m;
}

export function statusOf(fit: Fit, messages: Message[]): Status {
  if (!fit.fits) return 'nofit';
  if (messages.some((x) => x.level === 'error' || x.level === 'warning')) return 'adjust';
  return 'ok';
}

export const STATUS_LABEL: Record<Status, string> = { ok: 'Mieści się', adjust: 'Wymaga korekty', nofit: 'Nie mieści się' };

const ceilCm = (m: number) => Math.ceil(m * 200 - 1e-6) / 200; // do 0,5 cm

/** Konkretne sugestie z gotowymi poprawkami (patch). */
export function buildSuggestions(c: Config, calc: Calc, fit: Fit, opening: OpeningResult): Suggestion[] {
  const out: Suggestion[] = [];
  const s = c.stairs;
  const fitsWith = (cfg: Config) => {
    const q = quickSolve(cfg);
    return q.fit.fits && q.opening.headroomShortfalls.length === 0;
  };
  if (!fit.fits) {
    const o = fit.overflow;
    if (o.back + o.front > 1e-4) {
      const req = ceilCm(c.room.depth + o.back + o.front);
      out.push({ id: 'room-depth', label: `Zwiększ głębokość pomieszczenia do ${cm(req)} cm`, patch: { room: { depth: req } } });
    }
    if (o.left + o.right > 1e-4) {
      const req = ceilCm(c.room.width + o.left + o.right);
      out.push({ id: 'room-width', label: `Zwiększ szerokość pomieszczenia do ${cm(req)} cm`, patch: { room: { width: req } } });
    }
    for (let g = Math.round(s.going * 200) / 200 - 0.005; g >= LIMITS.goingWarn - 1e-9; g -= 0.005) {
      const gg = Math.round(g * 1000) / 1000;
      if (fitsWith(withStairs(c, { going: gg }))) {
        out.push({ id: 'going', label: `Zmniejsz krok do ${cm(gg)} cm`, patch: { stairs: { going: gg } } });
        break;
      }
    }
    for (const sh of ['I', 'L', 'U'] as Shape[]) {
      if (sh === s.shape) continue;
      if (fitsWith(withStairs(c, { shape: sh, splitMode: 'auto' }))) out.push({ id: `shape-${sh}`, label: `Zmień kształt na ${SHAPE_LABEL[sh]}`, patch: { stairs: { shape: sh, splitMode: 'auto' } } });
    }
    for (const e of ['back', 'front', 'left', 'right'] as EntryDir[]) {
      if (e === s.entry) continue;
      if (fitsWith(withStairs(c, { entry: e }))) { out.push({ id: `entry-${e}`, label: `Zmień kierunek wejścia: ${ENTRY_LABEL[e]}`, patch: { stairs: { entry: e } } }); }
    }
    if (s.shape !== 'I' && s.landingDepth > s.width + 1e-6 && fitsWith(withStairs(c, { landingDepth: s.width }))) {
      out.push({ id: 'landing', label: `Skróć spocznik do ${cm(s.width)} cm`, patch: { stairs: { landingDepth: s.width } } });
    }
    if (s.shape !== 'I') {
      const N = calc.risers;
      for (let d = 1; d < N; d++) {
        const cand = [calc.flights[0].risers + d, calc.flights[0].risers - d].filter((n) => n >= 2 && n <= N - 2);
        const hit = cand.find((n1) => fitsWith(withStairs(c, { splitMode: 'manual', manualSplit: n1 })));
        if (hit) { out.push({ id: 'split', label: `Zmień podział na ${hit} + ${N - hit}`, patch: { stairs: { splitMode: 'manual', manualSplit: hit } } }); break; }
      }
    }
  }
  if (opening.headroomShortfalls.length && s.opening.mode === 'manual') {
    const req = Math.ceil(opening.requiredLength * 100) / 100;
    out.push({ id: 'opening-length', label: `Zwiększ długość otworu do ${cm(req, 0)} cm`, patch: { stairs: { opening: { ...s.opening, length: req } } } });
    out.push({ id: 'opening-auto', label: 'Ustaw otwór automatycznie', patch: { stairs: { opening: { ...s.opening, mode: 'auto' } } } });
  }
  if (calc.rise > LIMITS.riserMax && s.stepsMode === 'manual') {
    const n = Math.ceil(c.room.height / LIMITS.riserMax);
    out.push({ id: 'steps', label: `Zwiększ liczbę stopni do ${n}`, patch: { stairs: { manualSteps: n } } });
  }
  return out;
}

export function applyPatch(c: Config, p: Patch): Config {
  return {
    ...c,
    room: { ...c.room, ...(p.room ?? {}) },
    stairs: { ...c.stairs, ...(p.stairs ?? {}) },
    structure: { ...c.structure, ...(p.structure ?? {}) },
    railing: { ...c.railing, ...(p.railing ?? {}) },
  };
}
