// Panel analityki Stair Studio: projekty, wykonawcy, źródła (landing / link / e-mail / SMS), zgłoszenia „Znajdź wykonawcę”.
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => new Intl.NumberFormat('pl-PL').format(n ?? 0);
const date = (s) => (s ? new Date(s).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const SOURCE = { landing: 'landing (strona główna)', direct: 'bezpośrednio', contractor_copy: 'kopia wykonawcy', google: 'Google', facebook: 'Facebook', instagram: 'Instagram' };
const srcLabel = (s) => SOURCE[s] ?? (s?.startsWith('landing:') ? `landing ← ${s.slice(8)}` : s?.startsWith('utm:') ? `kampania: ${s.slice(4)}` : s?.startsWith('ref:') ? `odesłanie: ${s.slice(4)}` : s || 'bezpośrednio / nieznane');
const STRUCT = { centralBeam: 'belka centralna', sideStringers: 'dwa policzki', zigzag: 'policzki zygzakowe', bentPlate: 'gięta blacha', weldedFrame: 'rama spawana', woodStringers: 'policzki drewniane', concrete: 'płyta żelbetowa' };

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}
const kpi = (label, value, sub = '', cls = '') => `<div class="kpi ${cls}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;

function breakdown(title, rows, map = (x) => x) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  const body = rows.length
    ? rows.map((r) => `<div class="b-row"><span class="ellipsis" title="${esc(map(r.label))}">${esc(map(r.label))}</span><div class="b-bar"><span style="width:${(r.n / max) * 100}%"></span></div><span class="num">${fmt(r.n)}</span></div>`).join('')
    : '<div class="muted small">Brak danych w tym okresie.</div>';
  return `<div class="card"><h2>${esc(title)}</h2><div class="breakdown">${body}</div></div>`;
}

function chart(series) {
  const W = 760, H = 190, pad = 22, n = series.length;
  const max = Math.max(1, ...series.map((d) => Math.max(d.projects + d.contractors, d.shareViews, d.visits)));
  const bw = (W - pad * 2) / n;
  const y = (v) => H - pad - (v / max) * (H - pad * 2);
  let bars = '';
  series.forEach((d, i) => {
    const x = pad + i * bw + bw * 0.15, w = Math.max(1, bw * 0.7);
    if (d.projects) bars += `<rect class="bar-p" x="${x}" y="${y(d.projects)}" width="${w}" height="${H - pad - y(d.projects)}"><title>${d.day}: projekty ${d.projects}</title></rect>`;
    if (d.contractors) bars += `<rect class="bar-c" x="${x}" y="${y(d.projects + d.contractors)}" width="${w}" height="${H - pad - y(d.contractors)}"><title>${d.day}: wykonawcy ${d.contractors}</title></rect>`;
  });
  const line = series.map((d, i) => `${i ? 'L' : 'M'}${pad + i * bw + bw / 2},${y(d.visits)}`).join(' ');
  const step = Math.ceil(n / 8);
  const labels = series.map((d, i) => (i % step === 0 ? `<text x="${pad + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${d.day.slice(5)}</text>` : '')).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Wykres dzienny">
    <line class="axis" x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}"/>${bars}<path class="line-v" d="${line}"/>${labels}
    <text x="${pad}" y="12">max ${fmt(max)}</text></svg>`;
}

function contractorList(list, empty) {
  if (!list.length) return `<span class="badge warn">${esc(empty)}</span>`;
  return `<div class="matches">${list.map((m) => `<span class="small"><b>${esc(m.company_name || `${m.first_name} ${m.last_name}`)}</b> · ${esc(m.distanceKm)} km · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a> · <a href="tel:${esc(m.phone)}">${esc(m.phone)}</a></span>`).join('')}</div>`;
}

function render(s) {
  const t = s.totals, p = s.period, f = s.funnel;
  $('#view').innerHTML = `
    <div class="grid kpis">
      ${kpi('Utworzone projekty', fmt(p.projects), `w okresie · łącznie ${fmt(t.projects)}`, 'accent')}
      ${kpi('Dołączeni wykonawcy', fmt(p.contractors), `w okresie · łącznie ${fmt(t.contractors)}`, 'accent')}
      ${kpi('Wejścia na landing', fmt(p.landingVisits), 'sesje w okresie')}
      ${kpi('Wejścia do konfiguratora', fmt(p.configuratorVisits), 'sesje w okresie')}
      ${kpi('Otwarcia linków udostępnienia', fmt(p.shareViews), 'przez osoby bez dostępu')}
      ${kpi('Zgłoszenia „Znajdź wykonawcę”', fmt(p.quoteRequests), `łącznie ${fmt(t.quoteRequests)}`, p.quoteRequests ? 'warn' : '')}
      ${kpi('Udostępnione projekty', fmt(t.shared), `${pct(t.shared, t.projects)} wszystkich projektów`)}
      ${kpi('Zgoda na zapytania z okolicy', fmt(t.leadsOptIn), `${pct(t.leadsOptIn, t.contractors)} wykonawców`)}
      ${kpi('Wersje / komentarze', `${fmt(t.versions)} / ${fmt(t.comments)}`, `komentarze w okresie: ${fmt(p.comments)}`)}
    </div>

    <div class="card">
      <div class="row"><h2 style="margin:0">Dzień po dniu</h2><span class="spacer"></span>
        <div class="legend"><span><i style="background:var(--accent)"></i>projekty</span><span><i style="background:var(--ok)"></i>wykonawcy</span><span><i style="background:var(--warn)"></i>wejścia (landing + konfigurator)</span></div></div>
      ${chart(s.series)}
    </div>

    <div class="card">
      <h2>Lejek udostępnienia → wykonawca</h2>
      <div class="funnel">
        <div class="f-step"><span class="muted small">Otwarcia linku (bez dostępu)</span><b>${fmt(f.shareViews)}</b></div>
        <div class="f-arrow">→</div>
        <div class="f-step"><span class="muted small">Rejestracje z linku</span><b>${fmt(f.registrations)}</b></div>
        <div class="f-arrow">=</div>
        <div class="f-step"><span class="muted small">Konwersja</span><b>${f.rate === null ? '—' : `${Math.round(f.rate * 100)}%`}</b></div>
      </div>
    </div>

    <div class="three">
      ${breakdown('Skąd przyszli wykonawcy', s.contractorSources, srcLabel)}
      ${breakdown('Skąd przyszli twórcy projektów', s.projectSources, srcLabel)}
      ${breakdown('Kanał otwartych linków', s.shareViewsVia)}
      ${breakdown('Układ wybrany na landingu', s.landingShapes, (x) => ({ i: 'proste', l: 'L 90°', u: 'U 180°', s: 'kręcone', 'l-winders': 'L zabiegowe', any: '„nie wiem jeszcze”' }[String(x).toLowerCase()] ?? x))}
      ${breakdown('Układy w projektach', s.shapes)}
      ${breakdown('Konstrukcje w projektach', s.structures, (x) => STRUCT[x] ?? x)}
    </div>

    <div class="card">
      <h2>Zgłoszenia „Znajdź wykonawcę” <span class="muted small">— wybrani przez inwestora i pozostali wykonawcy w promieniu (odległość od kodu pocztowego)</span></h2>
      ${s.quoteRequests.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Data</th><th>Projekt</th><th>Inwestor</th><th>Kod / promień</th><th>Wybrani przez inwestora</th><th>Inni w promieniu</th><th>Status</th></tr></thead>
        <tbody>${s.quoteRequests.map((q) => `<tr>
          <td class="small">${date(q.created_at)}</td>
          <td>${q.share_token ? `<a href="/konfigurator/p/${esc(q.share_token)}" target="_blank" rel="noopener">${esc(q.project_name)}</a>` : esc(q.project_name)}</td>
          <td>${esc(q.name)}<div class="small muted">${q.email ? `<a href="mailto:${esc(q.email)}">${esc(q.email)}</a>` : ''} ${q.phone ? `<a href="tel:${esc(q.phone)}">${esc(q.phone)}</a>` : ''}</div></td>
          <td><span class="mono">${esc(q.postal_code)}</span> · ${esc(q.radius_km)} km<div class="small muted">${esc(q.place ?? '')}</div></td>
          <td>${contractorList(q.selected, 'nikt nie wybrany')}</td>
          <td>${contractorList(q.matches, 'brak w promieniu')}</td>
          <td><select data-qid="${q.id}">${['new', 'sent', 'closed'].map((st) => `<option value="${st}" ${q.status === st ? 'selected' : ''}>${{ new: 'nowe', sent: 'przekazane', closed: 'zamknięte' }[st]}</option>`).join('')}</select></td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="empty">Brak zgłoszeń.</div>'}
    </div>

    <div class="card">
      <h2>Ostatnio dołączeni wykonawcy</h2>
      ${s.recentContractors.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Data</th><th>Wykonawca</th><th>Kontakt</th><th>Skąd</th><th>Przez projekt</th><th>Zapytania z okolicy</th><th class="num">Projekty</th></tr></thead>
        <tbody>${s.recentContractors.map((c) => `<tr>
          <td class="small">${date(c.created_at)}</td>
          <td>${esc(c.first_name)} ${esc(c.last_name)}${c.company_name ? `<div class="small muted">${esc(c.company_name)}</div>` : ''}</td>
          <td class="small"><a href="mailto:${esc(c.email)}">${esc(c.email)}</a><br><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></td>
          <td><span class="badge ${c.source === 'share_link' ? 'accent' : c.source?.startsWith('landing') ? 'ok' : ''}">${esc(c.source === 'share_link' ? c.channel : srcLabel(c.source))}</span></td>
          <td class="small">${esc(c.project_name ?? '—')}</td>
          <td>${c.leads_opt_in ? `<span class="badge ok">tak</span>${c.listed ? ' <span class="badge accent" title="widoczny w wyszukiwarce">w wyszukiwarce</span>' : ''} <span class="mono">${esc(c.postal_code)}</span> · ${esc(c.radius_km)} km` : '<span class="muted small">nie</span>'}</td>
          <td class="num">${fmt(c.projects)}</td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="empty">Jeszcze nikt nie dołączył.</div>'}
    </div>

    <div class="card">
      <h2>Ostatnie projekty</h2>
      ${s.recentProjects.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Utworzony</th><th>Nazwa</th><th>Źródło</th><th class="num">Wersje</th><th>Udostępniony</th><th class="num">Otwarcia linku</th><th class="num">Wykonawcy</th><th class="num">Komentarze</th></tr></thead>
        <tbody>${s.recentProjects.map((p) => `<tr>
          <td class="small">${date(p.created_at)}</td>
          <td class="ellipsis" title="${esc(p.name)}">${esc(p.name)}</td>
          <td class="small">${esc(srcLabel(p.source))}</td>
          <td class="num">${fmt(p.versions)}</td>
          <td>${p.shared ? '<span class="badge ok">tak</span>' : '<span class="muted small">nie</span>'}</td>
          <td class="num">${fmt(p.views)}</td>
          <td class="num">${fmt(p.contractors)}</td>
          <td class="num">${fmt(p.comments)}</td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="empty">Brak projektów.</div>'}
    </div>
    <p class="muted small">Wejścia liczone anonimowo (jedno na sesję karty, bez IP i ciasteczek śledzących). Źródło to pierwsze wejście danej przeglądarki: landing, wyszukiwarka/social z adresu odsyłającego, parametr utm_source lub ref.</p>`;

  document.querySelectorAll('select[data-qid]').forEach((sel) => sel.addEventListener('change', async () => {
    const r = await fetch(`/api/admin/studio/quote-requests/${sel.dataset.qid}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: sel.value }) });
    toast(r.ok ? 'Zapisano status zgłoszenia' : 'Nie udało się zapisać statusu');
  }));
}

async function load() {
  try {
    const r = await fetch(`/api/admin/studio/stats?days=${$('#days').value}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    render(await r.json());
  } catch (e) {
    $('#view').innerHTML = `<div class="notice">Nie udało się wczytać danych (${esc(e.message)}).</div>`;
  }
}
$('#days').addEventListener('change', load);
$('#refresh').addEventListener('click', load);
load();
