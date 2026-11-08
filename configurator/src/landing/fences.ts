// design3d ogrodzenia (wkrótce): planer ogrodzenia działki (przęsła, słupki, brama, furtki) + lista oczekujących.
import './fences.css';
import { firstTouchSource, trackVisit } from '../analytics';
import { compute, GATE_W, WICKET_W, type FenceType, type Plan, type Result, type Side } from './fencePlan';

firstTouchSource();
trackVisit('ogrodzenia');

const TYPES: Record<FenceType, { label: string; sub: string; icon: string }> = {
  panel: { label: 'Panelowe', sub: 'panel 3D, przęsło 2,5 m', icon: '<rect x="8" y="6" width="44" height="28" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><g stroke="currentColor" stroke-width=".9" opacity=".6"><line x1="14" x2="14" y1="6" y2="34"/><line x1="20" x2="20" y1="6" y2="34"/><line x1="26" x2="26" y1="6" y2="34"/><line x1="32" x2="32" y1="6" y2="34"/><line x1="38" x2="38" y1="6" y2="34"/><line x1="44" x2="44" y1="6" y2="34"/><line x1="8" x2="52" y1="14" y2="14"/><line x1="8" x2="52" y1="26" y2="26"/></g>' },
  picket: { label: 'Sztachetowe', sub: 'stal / alu / drewno', icon: '<g fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 34V9l2-3 2 3v25M19 34V9l2-3 2 3v25M27 34V9l2-3 2 3v25M35 34V9l2-3 2 3v25M43 34V9l2-3 2 3v25"/></g><g stroke="currentColor" stroke-width="1" opacity=".55"><line x1="6" x2="54" y1="14" y2="14"/><line x1="6" x2="54" y1="28" y2="28"/></g>' },
  board: { label: 'Deska pozioma', sub: 'kompozyt / drewno', icon: '<rect x="6" y="6" width="5" height="28" fill="currentColor" opacity=".8"/><rect x="49" y="6" width="5" height="28" fill="currentColor" opacity=".8"/><g fill="none" stroke="currentColor" stroke-width="1.4"><rect x="11" y="8" width="38" height="4"/><rect x="11" y="15" width="38" height="4"/><rect x="11" y="22" width="38" height="4"/><rect x="11" y="29" width="38" height="4"/></g>' },
  gabion: { label: 'Gabionowe', sub: 'kosze z kamieniem', icon: '<rect x="8" y="8" width="44" height="26" fill="none" stroke="currentColor" stroke-width="1.6"/><g fill="currentColor" opacity=".45"><circle cx="15" cy="15" r="3"/><circle cx="24" cy="13" r="2.5"/><circle cx="33" cy="16" r="3.2"/><circle cx="44" cy="14" r="2.6"/><circle cx="19" cy="24" r="3.4"/><circle cx="29" cy="26" r="2.8"/><circle cx="39" cy="25" r="3.3"/><circle cx="47" cy="28" r="2.2"/><circle cx="13" cy="30" r="2.3"/></g>' },
  mesh: { label: 'Siatka', sub: 'plecionka, słupek co 2,5 m', icon: '<g fill="none" stroke="currentColor" stroke-width=".9" opacity=".7"><path d="M8 6l8 8 8-8 8 8 8-8 8 8M8 14l8 8 8-8 8 8 8-8 8 8M8 22l8 8 8-8 8 8 8-8 8 8"/></g><line x1="8" x2="8" y1="4" y2="36" stroke="currentColor" stroke-width="2"/><line x1="52" x2="52" y1="4" y2="36" stroke="currentColor" stroke-width="2"/>' },
};

const form = document.getElementById('planner') as HTMLFormElement;
let type: FenceType = 'panel';

// ---- wybór rodzaju ----
const typesEl = document.getElementById('types')!;
typesEl.innerHTML = (Object.keys(TYPES) as FenceType[]).map((k) => `<button type="button" class="type-btn" data-type="${k}" aria-pressed="${k === type}"><svg viewBox="0 0 60 40" aria-hidden="true">${TYPES[k].icon}</svg><span class="label">${TYPES[k].label}</span><span class="sub">${TYPES[k].sub}</span></button>`).join('');
typesEl.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-type]');
  if (!b) return;
  type = b.dataset.type as FenceType;
  typesEl.querySelectorAll('[data-type]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  update();
});

function readPlan(): Plan {
  const f = new FormData(form);
  const num = (k: string, min: number, max: number, def: number) => { const v = Number(String(f.get(k) ?? '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? Math.min(max, Math.max(min, v)) : def; };
  return {
    type, w: num('w', 5, 300, 25), d: num('d', 5, 400, 40), sides: f.getAll('side') as Side[], h: Number(f.get('h')) || 1.5,
    gate: (f.get('gate') as Plan['gate']) ?? 'none', wickets: Number(f.get('wicket')) || 0, base: f.get('base') === 'on',
  };
}

const fmt = (n: number, d = 1) => n.toLocaleString('pl-PL', { maximumFractionDigits: d });

function renderSummary(p: Plan, r: Result) {
  const rows: Array<[string, string]> = [
    ['Długość ogrodzenia', `${fmt(r.length)} mb`],
    p.type === 'mesh' ? ['Siatka (rolki 25 m)', `${r.rolls} szt.`] : ['Przęsła', `${r.spans} szt.`],
    ['Słupki', `${r.posts} szt.`],
    ['Słupki bramowe', `${r.gatePosts} szt.`],
    ['Brama wjazdowa', r.gate ? (p.gate === 'slide' ? 'przesuwna 4 m' : 'skrzydłowa 4 m') : '—'],
    ['Furtki', r.wickets ? `${r.wickets} × 1 m` : '—'],
    ['Podmurówka', r.base ? `${fmt(r.base)} mb` : '—'],
    ['Wysokość', `${Math.round(p.h * 100)} cm`],
  ];
  document.getElementById('summary')!.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

function renderPlot(p: Plan, r: Result) {
  const svg = document.getElementById('plot')!;
  const W = 320, H = 240, pad = 30;
  const sc = Math.min((W - pad * 2) / p.w, (H - pad * 2 - 14) / p.d);
  const pw = p.w * sc, pd = p.d * sc, x0 = (W - pw) / 2, y0 = (H - 14 - pd) / 2;
  const on = (s: Side) => p.sides.includes(s);
  const line = (x1: number, y1: number, x2: number, y2: number, active: boolean) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${active ? '#4f7a5a' : '#bdb5a8'}" stroke-width="${active ? 4 : 1.5}" stroke-linecap="round" ${active ? '' : 'stroke-dasharray="4 4"'}/>`;
  let out = `<rect x="${x0}" y="${y0}" width="${pw}" height="${pd}" fill="#eef3ea"/>`;
  // dom
  const hw = Math.min(pw * 0.42, 12 * sc), hd = Math.min(pd * 0.32, 10 * sc);
  out += `<rect x="${x0 + (pw - hw) / 2}" y="${y0 + pd * 0.28}" width="${hw}" height="${hd}" rx="2" fill="#fff" stroke="#d9d3c9"/><text x="${x0 + pw / 2}" y="${y0 + pd * 0.28 + hd / 2 + 4}" font-size="10" text-anchor="middle" fill="#77726a">dom</text>`;
  out += line(x0, y0, x0 + pw, y0, on('back')) + line(x0, y0, x0, y0 + pd, on('left')) + line(x0 + pw, y0, x0 + pw, y0 + pd, on('right'));
  // front z otworami: brama na środku, furtki obok
  const fy = y0 + pd;
  if (!on('front')) out += line(x0, fy, x0 + pw, fy, false);
  else {
    const ops: Array<{ c: number; w: number; kind: 'gate' | 'wicket' }> = [];
    if (r.gate) ops.push({ c: p.w / 2, w: GATE_W, kind: 'gate' });
    if (r.wickets >= 1) ops.push({ c: p.w / 2 + (r.gate ? GATE_W / 2 + 1.6 : 0), w: WICKET_W, kind: 'wicket' });
    if (r.wickets >= 2) ops.push({ c: p.w / 2 - (r.gate ? GATE_W / 2 + 1.6 : 1.6), w: WICKET_W, kind: 'wicket' });
    ops.sort((a, b) => a.c - b.c);
    let cur = 0;
    for (const o of ops) {
      const a = Math.max(0, o.c - o.w / 2), b = Math.min(p.w, o.c + o.w / 2);
      if (a > cur) out += line(x0 + cur * sc, fy, x0 + a * sc, fy, true);
      const ax = x0 + a * sc, bx = x0 + b * sc;
      out += `<rect x="${ax - 2}" y="${fy - 5}" width="4" height="10" fill="#141311"/><rect x="${bx - 2}" y="${fy - 5}" width="4" height="10" fill="#141311"/>`;
      if (o.kind === 'gate' && p.gate === 'slide') out += `<line x1="${ax}" y1="${fy + 7}" x2="${bx}" y2="${fy + 7}" stroke="#8a5a2b" stroke-width="2"/><path d="M${ax + 6} ${fy + 4} l-6 3 6 3" fill="none" stroke="#8a5a2b" stroke-width="1.5"/>`;
      else out += `<path d="M${ax} ${fy} A ${(bx - ax) / (o.kind === 'gate' ? 2 : 1)} ${(bx - ax) / (o.kind === 'gate' ? 2 : 1)} 0 0 0 ${o.kind === 'gate' ? (ax + bx) / 2 : bx} ${fy - (bx - ax) / (o.kind === 'gate' ? 2 : 1)}" fill="none" stroke="#8a5a2b" stroke-width="1" stroke-dasharray="2 2"/>`;
      cur = b;
    }
    if (cur < p.w) out += line(x0 + cur * sc, fy, x0 + pw, fy, true);
  }
  out += `<text x="${x0 + pw / 2}" y="${H - 4}" font-size="10.5" text-anchor="middle" fill="#77726a">ulica · front ${fmt(p.w)} m</text>`;
  out += `<text x="${x0 - 8}" y="${y0 + pd / 2}" font-size="10.5" text-anchor="middle" fill="#77726a" transform="rotate(-90 ${x0 - 8} ${y0 + pd / 2})">${fmt(p.d)} m</text>`;
  svg.innerHTML = out;
}

/** Ilustracja w hero: ogrodzenie w perspektywie, wypełnienie zależne od rodzaju. */
function renderHero(p: Plan) {
  const g = document.getElementById('hero-fence');
  if (!g) return;
  const n = 6, A = { x: 30, y: 352 }, B = { x: 600, y: 268 };
  const hA = 150 * (p.h / 1.5), hB = 96 * (p.h / 1.5);
  const pt = (t: number) => ({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, h: hA + (hB - hA) * t });
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = pt(i / n), b = pt((i + 1) / n);
    const top = (q: { x: number; y: number; h: number }, f: number) => q.y - q.h * f;
    const lerp = (f: number, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - (a.h + (b.h - a.h) * t) * f });
    if (p.base && p.type !== 'gabion') out += `<path d="M${a.x} ${a.y} L${b.x} ${b.y} L${b.x} ${b.y - b.h * 0.14} L${a.x} ${a.y - a.h * 0.14} Z" fill="#d9d3c9"/>`;
    const lo = p.base && p.type !== 'gabion' ? 0.16 : 0.04;
    if (p.type === 'gabion') {
      out += `<path d="M${a.x} ${a.y} L${b.x} ${b.y} L${b.x} ${top(b, 0.9)} L${a.x} ${top(a, 0.9)} Z" fill="#c9c3b8" stroke="#77726a" stroke-width="1"/>`;
      for (let k = 0; k < 26; k++) { const t = ((k * 37) % 26) / 26, f = 0.1 + ((k * 53) % 17) / 17 * 0.72; const q = lerp(f, t); out += `<circle cx="${q.x}" cy="${q.y}" r="${5 * (a.h / hA)}" fill="#a8a097" opacity=".8"/>`; }
    } else if (p.type === 'panel' || p.type === 'mesh') {
      out += `<path d="M${a.x} ${a.y - a.h * lo} L${b.x} ${b.y - b.h * lo} L${b.x} ${top(b, 0.95)} L${a.x} ${top(a, 0.95)} Z" fill="none" stroke="#3a4a3f" stroke-width="1.6"/>`;
      const v = p.type === 'mesh' ? 10 : 9;
      for (let k = 1; k < v; k++) { const t = k / v, q1 = lerp(lo, t), q2 = lerp(0.95, t); out += p.type === 'mesh' ? `<line x1="${q1.x}" y1="${q1.y}" x2="${lerp(0.95, Math.min(1, t + 0.1)).x}" y2="${lerp(0.95, Math.min(1, t + 0.1)).y}" stroke="#3a4a3f" stroke-width=".7" opacity=".7"/><line x1="${q1.x}" y1="${q1.y}" x2="${lerp(0.95, Math.max(0, t - 0.1)).x}" y2="${lerp(0.95, Math.max(0, t - 0.1)).y}" stroke="#3a4a3f" stroke-width=".7" opacity=".7"/>` : `<line x1="${q1.x}" y1="${q1.y}" x2="${q2.x}" y2="${q2.y}" stroke="#3a4a3f" stroke-width="1"/>`; }
      if (p.type === 'panel') for (const f of [0.38, 0.7]) { const q1 = lerp(f, 0), q2 = lerp(f, 1); out += `<line x1="${q1.x}" y1="${q1.y}" x2="${q2.x}" y2="${q2.y}" stroke="#3a4a3f" stroke-width="1.4"/>`; }
    } else if (p.type === 'picket') {
      for (const f of [0.3, 0.75]) { const q1 = lerp(f, 0), q2 = lerp(f, 1); out += `<line x1="${q1.x}" y1="${q1.y}" x2="${q2.x}" y2="${q2.y}" stroke="#8a7f70" stroke-width="2.5"/>`; }
      const v = 7;
      for (let k = 0; k < v; k++) { const t = (k + 0.5) / v, q1 = lerp(lo, t), q2 = lerp(0.95, t), wpx = Math.max(3, 9 * (a.h / hA)); out += `<path d="M${q1.x - wpx / 2} ${q1.y} L${q2.x - wpx / 2} ${q2.y} L${q2.x} ${q2.y - wpx * 0.7} L${q2.x + wpx / 2} ${q2.y} L${q1.x + wpx / 2} ${q1.y} Z" fill="#fdfcfa" stroke="#bdb5a8" stroke-width=".8"/>`; }
    } else {
      const v = 6;
      for (let k = 0; k < v; k++) { const f1 = lo + (0.95 - lo) * (k / v) + 0.012, f2 = lo + (0.95 - lo) * ((k + 1) / v) - 0.012; out += `<path d="M${lerp(f1, 0).x} ${lerp(f1, 0).y} L${lerp(f1, 1).x} ${lerp(f1, 1).y} L${lerp(f2, 1).x} ${lerp(f2, 1).y} L${lerp(f2, 0).x} ${lerp(f2, 0).y} Z" fill="#a47a52"/>`; }
    }
  }
  for (let i = 0; i <= n; i++) { const q = pt(i / n), w = 11 * (q.h / hA); out += `<rect x="${q.x - w / 2}" y="${q.y - q.h}" width="${w}" height="${q.h}" fill="${p.type === 'gabion' ? '#77726a' : '#2b2a27'}" rx="1"/>`; }
  g.innerHTML = out;
}

let lastPlan: Plan = readPlan();
function update() {
  const p = readPlan();
  lastPlan = p;
  const r = compute(p);
  renderSummary(p, r);
  renderPlot(p, r);
  renderHero(p);
}
form.addEventListener('input', update);
form.addEventListener('change', update);
update();

// ---- lista oczekujących (inwestor / wykonawca) ----
document.querySelectorAll<HTMLInputElement>('.postal').forEach((el) => el.addEventListener('input', () => {
  const d = el.value.replace(/\D/g, '').slice(0, 5);
  el.value = d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
}));
document.querySelectorAll<HTMLFormElement>('#notify-form, #contractor-wait').forEach((f) => {
  const err = f.querySelector<HTMLElement>('.form-err')!;
  const done = f.querySelector<HTMLElement>('.form-done')!;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(f);
    const kind = f.dataset.kind;
    const r = compute(lastPlan);
    const body = {
      product: 'ogrodzenia', kind, email: String(d.get('email') ?? ''), postalCode: String(d.get('postalCode') ?? '') || undefined, consent: d.get('consent') === 'on',
      detail: kind === 'investor' ? JSON.stringify({ type: lastPlan.type, w: lastPlan.w, d: lastPlan.d, sides: lastPlan.sides, h: lastPlan.h, gate: lastPlan.gate, wickets: lastPlan.wickets, base: lastPlan.base, length: r.length }) : undefined,
      source: firstTouchSource(),
    };
    const btn = f.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    btn.disabled = true; err.classList.add('hidden');
    try {
      const res = await fetch('/api/studio/waitlist', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { err.textContent = (data.errors ?? [data.error ?? 'Nie udało się zapisać']).join('. '); err.classList.remove('hidden'); btn.disabled = false; return; }
      f.querySelectorAll('input, button[type="submit"]').forEach((el) => { (el as HTMLInputElement).disabled = true; });
      done.classList.remove('hidden');
    } catch {
      err.textContent = 'Brak połączenia — spróbuj ponownie.'; err.classList.remove('hidden'); btn.disabled = false;
    }
  });
});
