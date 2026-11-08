// Planer ogrodzenia: przęsła, słupki, otwory (brama, furtki) — czysta logika, testowana w vitest.
export type FenceType = 'panel' | 'picket' | 'board' | 'gabion' | 'mesh';
export type Side = 'front' | 'left' | 'right' | 'back';
/** Rozstaw słupków (długość przęsła) w metrach. */
export const SPAN: Record<FenceType, number> = { panel: 2.5, picket: 2.0, board: 2.0, gabion: 2.0, mesh: 2.5 };
export const GATE_W = 4, WICKET_W = 1;

export interface Plan { type: FenceType; w: number; d: number; sides: Side[]; h: number; gate: 'none' | 'swing' | 'slide'; wickets: number; base: boolean }
export interface Result { length: number; spans: number; posts: number; gatePosts: number; base: number; rolls: number; gate: boolean; wickets: number }
export function compute(p: Plan): Result {
  const span = SPAN[p.type];
  const len: Record<Side, number> = { front: p.w, back: p.w, left: p.d, right: p.d };
  const hasFront = p.sides.includes('front');
  const gate = hasFront && p.gate !== 'none';
  const wickets = hasFront ? Math.min(p.wickets, 2) : 0;
  const openings = (gate ? 1 : 0) + wickets;
  let length = 0, spans = 0, posts = 0;
  for (const s of p.sides) {
    let net = len[s];
    if (s === 'front') net = Math.max(0, net - (gate ? GATE_W : 0) - wickets * WICKET_W);
    const runs = s === 'front' ? openings + 1 : 1;
    const runLen = net / runs;
    for (let i = 0; i < runs; i++) {
      const n = runLen > 0.05 ? Math.ceil(runLen / span - 1e-6) : 0;
      spans += n;
      posts += n ? n + 1 : 0;
    }
    length += net;
  }
  // narożniki wspólne dla sąsiednich boków
  const has = (s: Side) => p.sides.includes(s);
  for (const [a, b] of [['front', 'left'], ['front', 'right'], ['back', 'left'], ['back', 'right']] as Array<[Side, Side]>) if (has(a) && has(b)) posts -= 1;
  // końce przęseł przy bramie i furtkach stoją na słupkach bramowych
  posts = Math.max(0, posts - openings * 2);
  const gatePosts = openings * 2;
  return {
    length: Math.round(length * 10) / 10, spans: p.type === 'mesh' ? 0 : spans, posts, gatePosts,
    base: p.base && p.type !== 'gabion' ? Math.round(length * 10) / 10 : 0,
    rolls: p.type === 'mesh' ? Math.ceil(length / 25) : 0, gate, wickets,
  };
}

