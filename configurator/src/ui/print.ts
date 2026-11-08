// Karta projektu do wydruku / PDF (dla klienta lub do oferty): zrzut sceny + parametry + zestawienie bez cen.
import { quantities } from '../engine/quantities';
import { solve } from '../engine/solve';
import { STATUS_LABEL, cm } from '../engine/validate';
import { SHAPE_LABEL, WOODS, STEEL_PRESETS, railingSpec, structureSpec } from '../engine/catalog';
import type { Config } from '../engine/types';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function openPrintView(c: Config, image: string | null, link: string): boolean {
  const s = solve(c);
  const q = quantities(c, s);
  const fp = s.layout.footprint;
  const rows: Array<[string, string]> = [
    ['Kształt', SHAPE_LABEL[c.stairs.shape]],
    ['Kondygnacja', `${cm(c.room.height)} cm`],
    ['Pomieszczenie', `${cm(c.room.width)} × ${cm(c.room.depth)} cm`],
    ['Stopnie', `${s.calc.risers} × ${cm(s.calc.rise)} cm`],
    ['Krok / 2h + s / nachylenie', `${cm(s.calc.going)} cm / ${cm(s.calc.blondel)} cm / ${s.calc.angleDeg.toFixed(1).replace('.', ',')}°`],
    ...(s.layout.spiral ? [['Średnica', `${cm(s.layout.spiral.radius * 2)} cm`] as [string, string]] : [['Szerokość biegu', `${cm(c.stairs.width)} cm`] as [string, string]]),
    ['Rzut całkowity', `${cm(fp.maxX - fp.minX)} × ${cm(fp.maxZ - fp.minZ)} cm`],
    ['Otwór w stropie', `${cm(s.opening.length)} × ${cm(s.opening.width)} cm`],
    ['Wyjście na piętro', s.exitDirLabel],
    ['Konstrukcja', s.layout.spiral ? 'Kolumna centralna' : structureSpec(c.structure.type).label],
    ['Stopnice', WOODS.find((w) => w.key === c.treads.wood)!.label],
    ['Stal', STEEL_PRESETS.find((p) => p.key === c.steel.preset)?.label ?? c.steel.color],
    ['Balustrada', `${railingSpec(c.railing.type).label}, ${cm(c.railing.height)} cm`],
    ['Status', STATUS_LABEL[s.status]],
  ];
  const issues = s.messages.filter((m) => m.level !== 'info');
  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>Stair Studio — karta projektu</title>
<style>
  body{font:13px/1.45 Inter,system-ui,sans-serif;color:#141311;margin:28px;}
  h1{font-size:18px;letter-spacing:.2em;margin:0 0 4px} .muted{color:#77726a}
  img{width:100%;border:1px solid #e6e1d9;border-radius:10px;margin:14px 0}
  table{width:100%;border-collapse:collapse;margin:8px 0 18px} td{padding:5px 6px;border-bottom:1px solid #eee;vertical-align:top}
  td:last-child{text-align:right} h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#77726a;margin:18px 0 4px}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:24px} .note{font-size:11px;color:#77726a;margin-top:20px}
  @media print{body{margin:12mm}.noprint{display:none}}
</style></head><body>
<button class="noprint" onclick="print()" style="float:right;padding:6px 12px">Drukuj / zapisz PDF</button>
<img src="${location.origin}/konfigurator/brand/design3d-schody-logo.svg" alt="design3d schody" style="height:28px;width:auto;margin:0 0 6px;border:0;border-radius:0"><div class="muted">design3d.pl · karta projektu · ${esc(new Date().toLocaleDateString('pl-PL'))}</div>
${image ? `<img src="${esc(image)}" alt="Wizualizacja schodów">` : ''}
<div class="cols"><div><h2>Parametry</h2><table>${rows.map(([k, v]) => `<tr><td class="muted">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
${issues.length ? `<h2>Uwagi</h2><ul>${issues.map((m) => `<li><b>${esc(m.title)}</b> ${esc(m.cause)}</li>`).join('')}</ul>` : ''}</div>
<div><h2>Zestawienie ilościowe (bez cen)</h2><table>${q.map((it) => `<tr><td>${esc(it.name)}</td><td>${esc(String(it.qty).replace('.', ','))} ${esc(it.unit)}</td></tr>`).join('')}</table></div></div>
<p class="muted">Link do konfiguracji: <a href="${esc(link)}">${esc(link.length > 90 ? link.slice(0, 90) + '…' : link)}</a></p>
<p class="note">Wizualizacja koncepcyjna. Wyniki nie stanowią projektu konstrukcyjnego ani potwierdzenia zgodności z przepisami — wymagają weryfikacji przez konstruktora.</p>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
