// design3d.pl — panel Lead Discovery (vanilla JS, bez kroku budowania).
// Dane pochodzą z obcych stron: WSZYSTKO wstawiamy przez esc(), linki tylko http(s).

const API = '/api/admin/lead-discovery';
const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
let META = null;
let pollTimer = null;
let currentRoute = '';

// ---------------- narzędzia ----------------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => { try { const x = new URL(u); return ['http:', 'https:'].includes(x.protocol) ? x.toString() : null; } catch { return null; } };
const link = (u, text, cls = '') => { const s = safeUrl(u); return s ? `<a class="${cls}" href="${esc(s)}" target="_blank" rel="noopener noreferrer nofollow">${esc(text ?? u)}</a>` : esc(text ?? u ?? ''); };
const fmtDate = (d) => (d ? new Date(d).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const fmtNum = (n) => Number(n ?? 0).toLocaleString('pl-PL');
const money = (n) => `$${Number(n ?? 0).toFixed(n >= 1 ? 2 : 4)}`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
/** Link do dokładnego miejsca na stronie (Text Fragment — podświetla adres w przeglądarkach Chromium). */
const emailSourceUrl = (src, email) => { const s = safeUrl(src); return s ? `${s.split('#')[0]}#:~:text=${encodeURIComponent(email)}` : null; };

async function api(path, opts = {}) {
  const res = await fetch(API + path, { headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) }, ...opts });
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body;
}
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b ?? {}) });

function toast(msg, ms = 3500) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}

const SCAN_STATUS = {
  pending: ['W kolejce', ''], scanning: ['Skanowanie', 'accent'], done: ['Zeskanowano', 'ok'], no_website: ['Brak strony', 'warn'],
  blocked: ['Zablokowane (CAPTCHA/ochrona)', 'bad'], error: ['Błąd', 'bad'], robots_disallowed: ['robots.txt zabrania', 'warn'],
};
const CONTACT_STATUS = { email: ['E-mail', 'ok'], form_only: ['Tylko formularz', 'warn'], none: ['Brak kontaktu', 'bad'], unknown: ['—', ''] };
const PROJECT_STATUS = { draft: 'Szkic', running: 'W trakcie', paused: 'Wstrzymany', completed: 'Zakończony', stopped: 'Zatrzymany' };
const JOB_STATUS = { queued: ['W kolejce', ''], running: ['W toku', 'accent'], done: ['Gotowe', 'ok'], failed: ['Nieudane', 'bad'], paused: ['Wstrzymane', 'warn'], cancelled: ['Anulowane', ''] };
const JOB_TYPE = { scan_company: 'Skan strony', analyze_company: 'Analiza AI', discover_query: 'Wyszukiwanie', resolve_website: 'Ustalanie strony' };
const METHOD = { mailto: 'link mailto', text: 'tekst strony', footer: 'stopka', obfuscated: 'zamaskowany (np. [at])', cfemail: 'zakodowany (Cloudflare)', jsonld: 'dane strukturalne', rendered: 'po renderowaniu JS', tel: 'link tel:', form: 'formularz', jsonld_phone: 'dane strukturalne' };

const badge = (map, key) => { const [t, c] = map[key] ?? [key ?? '—', '']; return `<span class="badge ${c}">${esc(t)}</span>`; };
const scoreBadge = (s) => (s === null || s === undefined ? '<span class="muted">—</span>' : `<span class="score ${s >= 75 ? 'hi' : s >= 50 ? 'mid' : ''}">${esc(s)}</span>`);
const catLabel = (c) => (c ? esc(META?.categories?.[c] ?? c) : '<span class="muted">—</span>');
const scope = () => $('#scope').value;

// ---------------- routing ----------------
const routes = [
  [/^#\/dashboard$/, renderDashboard, 'Pulpit'],
  [/^#\/projects$/, renderProjects, 'Projekty wyszukiwania'],
  [/^#\/projects\/new$/, renderNewProject, 'Nowy projekt wyszukiwania'],
  [/^#\/projects\/(\d+)$/, renderProject, 'Projekt'],
  [/^#\/companies(\?.*)?$/, renderCompanies, 'Firmy'],
  [/^#\/jobs$/, renderJobs, 'Zadania i błędy'],
  [/^#\/privacy$/, renderPrivacy, 'Prywatność / RODO'],
];

async function router() {
  clearInterval(pollTimer);
  const hash = location.hash || '#/dashboard';
  currentRoute = hash;
  for (const [re, fn, title] of routes) {
    const m = hash.match(re);
    if (m) {
      $('#page-title').textContent = title;
      document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', hash.startsWith(a.getAttribute('href').split('?')[0]) && a.getAttribute('href') !== '#/'));
      try {
        await fn(...m.slice(1));
      } catch (e) {
        view.innerHTML = `<div class="card notice">Błąd: ${esc(e.message)}</div>`;
      }
      return;
    }
  }
  location.hash = '#/dashboard';
}
function poll(fn, ms = 3000) {
  clearInterval(pollTimer);
  const route = currentRoute;
  pollTimer = setInterval(() => { if (currentRoute === route && !document.hidden) fn().catch(() => {}); }, ms);
}

// ---------------- pulpit ----------------
function kpi(label, value, sub = '', cls = '') {
  return `<div class="kpi ${cls}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}

function statsBlock(s) {
  const pendingJobs = (s.jobs ?? []).filter((j) => ['queued', 'running'].includes(j.status)).reduce((a, j) => a + j.n, 0);
  return `
    <div class="grid kpis">
      ${kpi('Odkryte firmy', fmtNum(s.discovered_companies))}
      ${kpi('Unikalne firmy', fmtNum(s.unique_companies), 'po deduplikacji')}
      ${kpi('Z działającą stroną', fmtNum(s.with_website), `${pct(s.with_website, s.unique_companies)}%`)}
      ${kpi('Ze znalezionym e-mailem', fmtNum(s.with_email), `${pct(s.with_email, s.scanned)}% zeskanowanych · tylko formularz: ${fmtNum(s.form_only)}`, 'accent')}
      ${kpi('Zakwalifikowani producenci', fmtNum(s.manufacturers))}
      ${kpi('Lead Score > 75', fmtNum(s.score_over_75), '', 'accent')}
      ${kpi('Mają już konfigurator', fmtNum(s.with_configurator))}
      ${kpi('Zeskanowane podstrony', fmtNum(s.pages_scanned), `adresy e-mail: ${fmtNum(s.emails_found)}`)}
      ${kpi('Błędy / do weryfikacji', `${fmtNum(s.scan_errors)} / ${fmtNum(s.needs_review)}`, `<a href="#/companies?needsReview=1">pokaż</a>`, s.scan_errors ? 'bad' : '')}
      ${kpi('Koszt API', money(s.api_cost_usd), s.budget_limit_usd !== null && s.budget_limit_usd !== undefined ? `limit: ${money(s.budget_limit_usd)}` : 'suma wszystkich projektów', 'warn')}
    </div>
    <div class="card">
      <div class="row"><strong>Postęp skanowania</strong><span class="spacer"></span><span class="muted">${esc(s.scan_progress)}% · w kolejce/w toku: ${fmtNum(pendingJobs)} · zapytania: ${fmtNum(s.queries_done)}/${fmtNum(s.queries_total)}</span></div>
      <div class="progress" style="margin-top:10px"><span style="width:${Math.min(100, s.scan_progress)}%"></span></div>
    </div>`;
}

async function renderDashboard() {
  const load = async () => {
    const pid = scope();
    const [s, errors, running] = await Promise.all([
      api(`/stats${pid ? `?projectId=${pid}` : ''}`),
      api(`/errors${pid ? `?projectId=${pid}` : ''}`),
      api(`/jobs?status=running&limit=20${pid ? `&projectId=${pid}` : ''}`),
    ]);
    view.innerHTML = `
      ${statsBlock(s)}
      <div class="grid two">
        <div class="card"><h2>Teraz w toku</h2>${jobsTable(running, false) || '<div class="empty">Brak aktywnych zadań</div>'}</div>
        <div class="card"><h2>Ostatnie błędy</h2>${errorsTable(errors.slice(0, 12)) || '<div class="empty">Brak błędów</div>'}</div>
      </div>
      <div class="card row"><span>Najlepsze leady:</span><a class="btn" href="#/companies?sort=score&minScore=75">Lead Score ≥ 75</a><a class="btn" href="#/companies?category=manufacturer,manufacturer_installer">Producenci</a><a class="btn" href="#/companies?contact=form_only">Tylko formularz</a></div>`;
  };
  await load();
  poll(load);
}

// ---------------- projekty ----------------
async function renderProjects() {
  const load = async () => {
    const list = await api('/projects');
    view.innerHTML = list.length
      ? `<div class="card table-wrap"><table><thead><tr><th>Projekt</th><th>Status</th><th class="num">Firmy</th><th class="num">Z e-mailem</th><th class="num">Score>75</th><th>Postęp</th><th class="num">Koszt / limit</th><th></th></tr></thead><tbody>
        ${list.map((p) => `<tr class="clickable" data-href="#/projects/${p.id}">
          <td><strong>${esc(p.name)}</strong><div class="muted small">max ${fmtNum(p.max_companies)} firm · ${esc(p.discovery_provider === 'none' ? 'tylko import CSV' : p.discovery_provider)}${p.ai_enabled ? ' · AI' : ''}</div></td>
          <td><span class="dot ${esc(p.status)}"></span>${esc(PROJECT_STATUS[p.status] ?? p.status)}</td>
          <td class="num">${fmtNum(p.stats.unique_companies)}</td><td class="num">${fmtNum(p.stats.with_email)}</td><td class="num">${fmtNum(p.stats.score_over_75)}</td>
          <td style="min-width:140px"><div class="progress"><span style="width:${p.stats.scan_progress}%"></span></div></td>
          <td class="num">${money(p.api_cost_usd)} / ${money(p.budget_limit_usd)}</td><td><a href="#/projects/${p.id}">Otwórz →</a></td></tr>`).join('')}
        </tbody></table></div>`
      : `<div class="card empty">Brak projektów. <a href="#/projects/new">Utwórz pierwszy projekt wyszukiwania</a>.</div>`;
    bindRowLinks();
  };
  await load();
  poll(load, 5000);
}

function bindRowLinks() {
  view.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a,button')) location.hash = tr.dataset.href; }));
}

async function renderNewProject() {
  const t = META.templates[0];
  const providers = META.providers;
  view.innerHTML = `
    <form class="card" id="pform">
      <h2>Nowy projekt wyszukiwania</h2>
      <div class="form">
        <label class="field"><span>Szablon branży</span><select name="template">${META.templates.map((x) => `<option value="${esc(x.key)}">${esc(x.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Nazwa projektu</span><input name="name" required value="${esc(t.name)}"></label>
        <label class="field"><span>Branża</span><input name="industry" value="${esc(t.industry)}"></label>
        <label class="field"><span>Kraj</span><select name="country"><option value="PL">Polska</option></select></label>
        <label class="field"><span>Region (województwo)</span><select name="region"><option value="">Cała Polska</option>${META.voivodeships.map((v) => `<option>${esc(v)}</option>`).join('')}</select></label>
        <label class="field"><span>Maksymalna liczba firm</span><input name="maxCompanies" type="number" min="1" max="10000" value="3000"></label>
        <label class="field"><span>Maks. podstron na firmę</span><input name="maxPagesPerCompany" type="number" min="1" max="30" value="8"><small>Kontakt, O nas, oferta/wycena, galeria; więcej tylko gdy brak e-maila.</small></label>
        <label class="field"><span>Źródło odkrywania domen</span><select name="discoveryProvider">
          <option value="none">Tylko import CSV (bez płatnego API)</option>
          ${providers.map((p) => `<option value="${esc(p.key)}" ${p.configured ? '' : 'disabled'}>${esc(p.label)} ${p.configured ? `(~${money(p.costPerQuery)}/zapytanie)` : '— brak klucza API w .env'}</option>`).join('')}
        </select></label>
        <label class="field"><span>Limit budżetu API (USD)</span><input name="budgetLimitUsd" type="number" min="0" step="0.01" value="0"><small>0 = żadnych płatnych zapytań. Wymagane świadome ustawienie.</small></label>
        <label class="field"><span>Analiza AI (Claude)</span><span class="check"><input type="checkbox" name="aiEnabled" ${META.ai.configured ? '' : 'disabled'}> ${META.ai.configured ? `włącz (${esc(META.ai.model)}, w ramach budżetu)` : 'brak ANTHROPIC_API_KEY — działa analiza heurystyczna'}</span></label>
        <label class="field full"><span>Frazy (jedna w linii)</span><textarea name="keywords" rows="6">${esc(t.keywords.join('\n'))}</textarea></label>
        <label class="field"><span>Frazy łączone z miastami</span><textarea name="cityKeywords" rows="5">${esc(t.cityKeywords.join('\n'))}</textarea></label>
        <label class="field"><span>Miasta</span><textarea name="cities" rows="5">${esc(t.cities.join('\n'))}</textarea></label>
        <div class="field"><span>Liczba zapytań</span><div id="qcount" class="muted"></div></div>
      </div>
      <div class="row" style="margin-top:16px"><button class="btn" type="submit" data-start="0">Utwórz</button><button class="btn primary" type="submit" data-start="1">Utwórz i rozpocznij</button></div>
    </form>`;
  const form = $('#pform');
  const lines = (n) => form.elements[n].value.split('\n').map((s) => s.trim()).filter(Boolean);
  const update = () => {
    const n = new Set([...lines('keywords'), ...lines('cities').flatMap((c) => lines('cityKeywords').map((k) => `${k} ${c}`))]).size;
    const prov = providers.find((p) => p.key === form.elements.discoveryProvider.value);
    $('#qcount').innerHTML = `${fmtNum(n)} zapytań${prov ? ` · szacunkowo ${money(n * prov.costPerQuery)} (1. strona wyników)` : ' · bez wyszukiwarki: zaimportuj CSV po utworzeniu projektu'}`;
  };
  form.addEventListener('input', update);
  update();
  let start = false;
  form.querySelectorAll('button[type=submit]').forEach((b) => b.addEventListener('click', () => (start = b.dataset.start === '1')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      name: form.elements.name.value, industry: form.elements.industry.value, country: form.elements.country.value,
      region: form.elements.region.value || null, maxCompanies: Number(form.elements.maxCompanies.value),
      maxPagesPerCompany: Number(form.elements.maxPagesPerCompany.value), discoveryProvider: form.elements.discoveryProvider.value,
      budgetLimitUsd: Number(form.elements.budgetLimitUsd.value), aiEnabled: form.elements.aiEnabled.checked,
      keywords: lines('keywords'), cityKeywords: lines('cityKeywords'), cities: lines('cities'),
    };
    try {
      const p = await post('/projects', body);
      if (start) {
        const r = await post(`/projects/${p.id}/start`);
        r.warnings.forEach((w) => toast(w, 7000));
      }
      await loadProjectsIntoScope();
      location.hash = `#/projects/${p.id}`;
    } catch (err) { toast(err.message); }
  });
}

async function renderProject(id) {
  const load = async () => {
    const p = await api(`/projects/${id}`);
    const s = p.stats;
    const actions = {
      draft: `<button class="btn primary" data-act="start">▶ Rozpocznij</button>`,
      running: `<button class="btn" data-act="pause">⏸ Wstrzymaj</button><button class="btn danger" data-act="stop">■ Zakończ</button>`,
      paused: `<button class="btn primary" data-act="resume">▶ Wznów</button><button class="btn danger" data-act="stop">■ Zakończ</button>`,
      completed: `<button class="btn" data-act="start">↻ Uruchom ponownie (nowe zapytania/skany)</button>`,
      stopped: `<button class="btn" data-act="start">↻ Uruchom ponownie</button>`,
    }[p.status] ?? '';
    view.innerHTML = `
      <div class="card row">
        <div><h2 style="margin:0">${esc(p.name)}</h2><div class="muted small"><span class="dot ${esc(p.status)}"></span>${esc(PROJECT_STATUS[p.status])} · utworzono ${fmtDate(p.created_at)} · max ${fmtNum(p.max_companies)} firm · ${fmtNum(p.max_pages_per_company)} podstron/firmę · ${esc(p.discovery_provider === 'none' ? 'bez wyszukiwarki' : p.discovery_provider)} · zaplanowane zapytania: ${fmtNum(p.plannedQueries)}</div></div>
        <span class="spacer"></span>${actions}
        <a class="btn" href="#/companies?projectId=${p.id}&sort=score">Firmy projektu →</a>
      </div>
      ${statsBlock(s)}
      <div class="grid two">
        <div class="card">
          <h2>Import CSV</h2>
          <p class="muted small">Kolumny (nagłówek dowolny z listy): <span class="mono">nazwa/firma</span>, <span class="mono">strona/www/url/domena</span>, <span class="mono">miasto</span>, <span class="mono">nip</span>. Separator , lub ;. Wiersze z samą nazwą wymagają skonfigurowanej wyszukiwarki, aby ustalić stronę.</p>
          <div class="row"><input type="file" id="csvfile" accept=".csv,text/csv,text/plain"><button class="btn primary" id="csvgo">Importuj i skanuj</button></div>
          <textarea id="csvtext" placeholder="nazwa;strona;miasto&#10;Schody Kowalski;schody-kowalski.pl;Poznań" style="margin-top:10px"></textarea>
          <div id="csvres" class="small"></div>
        </div>
        <div class="card"><h2>Aktywne zadania</h2>${jobsTable(p.activeJobs, false) || '<div class="empty">Brak</div>'}</div>
      </div>
      <div class="grid two">
        <div class="card table-wrap"><h2>Zapytania wyszukiwania</h2>${p.queries.length ? `<table><thead><tr><th>Zapytanie</th><th>Str.</th><th>Status</th><th class="num">Wyniki</th><th class="num">Nowe</th></tr></thead><tbody>${p.queries.map((q) => `<tr><td>${esc(q.query)}</td><td>${q.page + 1}</td><td>${esc(q.status)}${q.error ? `<div class="muted small">${esc(q.error)}</div>` : ''}</td><td class="num">${q.results_count ?? '—'}</td><td class="num">${q.new_companies ?? '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Brak zapytań (projekt bez wyszukiwarki lub jeszcze nie uruchomiony)</div>'}</div>
        <div class="card"><h2>Błędy</h2>${errorsTable(p.recentErrors) || '<div class="empty">Brak błędów</div>'}</div>
      </div>`;
    view.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.act === 'stop' && !confirm('Zakończyć projekt? Oczekujące zadania zostaną anulowane, zebrane wyniki pozostaną.')) return;
      try {
        const r = await post(`/projects/${id}/${b.dataset.act}`);
        (r.warnings ?? []).forEach((w) => toast(w, 7000));
        if (r.queries !== undefined) toast(`Zapytania: ${r.queries}, skany w kolejce: ${r.scansQueued}`);
        load();
      } catch (e) { toast(e.message); }
    }));
    $('#csvfile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) $('#csvtext').value = await f.text(); });
    $('#csvgo').addEventListener('click', async () => {
      const text = $('#csvtext').value.trim();
      if (!text) return toast('Wklej lub wybierz plik CSV');
      try {
        const r = await api(`/projects/${id}/import`, { method: 'POST', headers: { 'content-type': 'text/csv' }, body: text });
        $('#csvres').innerHTML = `Wiersze: ${r.rows} · nowe firmy: ${r.created} · istniejące: ${r.existing} · bez strony: ${r.withoutWebsite} · skany w kolejce: ${r.queuedScans} · pominięte: ${r.skipped}${r.errors.length ? `<ul>${r.errors.slice(0, 20).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${p.status === 'draft' ? '<div class="notice" style="margin-top:8px">Kliknij „Rozpocznij”, aby uruchomić skanowanie.</div>' : ''}`;
        $('#csvtext').value = '';
      } catch (e) { toast(e.message); }
    });
  };
  await load();
  poll(async () => { if (!$('#csvtext')?.value && document.activeElement?.id !== 'csvtext') await load(); }, 4000);
}

// ---------------- firmy ----------------
function parseQuery() {
  const q = location.hash.split('?')[1] ?? '';
  return Object.fromEntries(new URLSearchParams(q));
}
function setQuery(obj) {
  const q = new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null));
  history.replaceState(null, '', `#/companies${q.toString() ? '?' + q : ''}`);
  currentRoute = location.hash;
}

async function renderCompanies() {
  const q = { sort: 'score', dir: 'desc', page: '1', ...parseQuery() };
  if (scope() && !q.projectId) q.projectId = scope();
  view.innerHTML = `
    <div class="card">
      <div class="filters">
        <input type="search" id="f-search" placeholder="Szukaj: nazwa, domena, e-mail, miasto, NIP" value="${esc(q.search ?? '')}">
        <select id="f-category"><option value="">Kategoria: wszystkie</option><option value="manufacturer,manufacturer_installer">Producenci (wszyscy)</option>${Object.entries(META.categories).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('')}</select>
        <select id="f-contact"><option value="">Kontakt: wszystkie</option><option value="email">Z e-mailem</option><option value="form_only">Tylko formularz</option><option value="none">Brak kontaktu</option></select>
        <select id="f-scanStatus"><option value="">Status: wszystkie</option>${Object.entries(SCAN_STATUS).map(([k, [v]]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('')}</select>
        <select id="f-voivodeship"><option value="">Województwo</option>${META.voivodeships.map((v) => `<option>${esc(v)}</option>`).join('')}</select>
        <select id="f-hasConfigurator"><option value="">Konfigurator: dowolnie</option><option value="0">Bez konfiguratora 3D</option><option value="1">Ma konfigurator 3D</option></select>
        <label class="check small">Score ≥ <input id="f-minScore" type="number" min="0" max="100" style="width:70px" value="${esc(q.minScore ?? '')}"></label>
        <label class="check small"><input type="checkbox" id="f-needsReview" ${q.needsReview === '1' ? 'checked' : ''}> do weryfikacji</label>
        <span class="spacer"></span>
        <a class="btn" id="exp-csv">⬇ CSV</a><a class="btn" id="exp-xlsx">⬇ XLSX</a>
      </div>
    </div>
    <div class="card table-wrap" id="ctable"></div>`;
  for (const k of ['category', 'contact', 'scanStatus', 'voivodeship', 'hasConfigurator']) $(`#f-${k}`).value = q[k] ?? '';

  const readFilters = () => ({
    ...q,
    search: $('#f-search').value.trim(), category: $('#f-category').value, contact: $('#f-contact').value, scanStatus: $('#f-scanStatus').value,
    voivodeship: $('#f-voivodeship').value, hasConfigurator: $('#f-hasConfigurator').value, minScore: $('#f-minScore').value,
    needsReview: $('#f-needsReview').checked ? '1' : '',
  });
  const load = async () => {
    const f = readFilters();
    Object.assign(q, f);
    setQuery(q);
    const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v));
    const exportParams = new URLSearchParams([...params].filter(([k]) => !['page', 'pageSize'].includes(k)));
    $('#exp-csv').href = `${API}/export.csv?${exportParams}`;
    $('#exp-xlsx').href = `${API}/export.xlsx?${exportParams}`;
    const data = await api(`/companies?${params}&pageSize=50`);
    const th = (key, label, cls = '') => `<th class="sortable ${cls}" data-sort="${key}">${esc(label)}${q.sort === key ? (q.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    $('#ctable').innerHTML = data.rows.length
      ? `<table><thead><tr>${th('name', 'Firma')}<th>Strona</th><th>E-mail</th>${th('city', 'Miejscowość')}${th('category', 'Kategoria')}${th('score', 'Score', 'num')}${th('status', 'Status')}</tr></thead><tbody>
        ${data.rows.map((c) => `<tr class="clickable" data-id="${c.id}">
          <td><strong>${esc(c.name ?? c.primary_domain ?? '(bez nazwy)')}</strong>${c.has_configurator ? ' <span class="badge warn">ma konfigurator</span>' : ''}${c.needs_review ? ' <span class="badge">do weryfikacji</span>' : ''}</td>
          <td class="ellipsis">${c.website_url ? link(c.website_url, c.primary_domain) : '<span class="muted">—</span>'}</td>
          <td>${c.primary_email ? `${esc(c.primary_email)}${c.email_count > 1 ? ` <span class="muted small">+${c.email_count - 1}</span>` : ''}` : c.contact_status === 'form_only' ? badge(CONTACT_STATUS, 'form_only') : '<span class="muted">—</span>'}</td>
          <td>${esc(c.city ?? '')}${c.voivodeship ? `<div class="muted small">${esc(c.voivodeship)}</div>` : ''}</td>
          <td>${catLabel(c.category)}</td><td class="num">${scoreBadge(c.lead_score)}</td><td>${badge(SCAN_STATUS, c.scan_status)}</td></tr>`).join('')}
        </tbody></table>
        <div class="pager"><span class="muted">${fmtNum(data.total)} firm · strona ${data.page}/${pages}</span>
          <button class="btn small" id="prev" ${data.page <= 1 ? 'disabled' : ''}>←</button><button class="btn small" id="next" ${data.page >= pages ? 'disabled' : ''}>→</button></div>`
      : '<div class="empty">Brak firm dla wybranych filtrów</div>';
    $('#ctable').querySelectorAll('th[data-sort]').forEach((h) => h.addEventListener('click', () => {
      q.dir = q.sort === h.dataset.sort && q.dir === 'desc' ? 'asc' : 'desc';
      q.sort = h.dataset.sort;
      q.page = '1';
      load();
    }));
    $('#ctable').querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) openCompany(tr.dataset.id); }));
    $('#prev')?.addEventListener('click', () => { q.page = String(Number(q.page) - 1); load(); });
    $('#next')?.addEventListener('click', () => { q.page = String(Number(q.page) + 1); load(); });
  };
  let deb;
  view.querySelectorAll('.filters input, .filters select').forEach((el) => el.addEventListener(el.type === 'search' || el.type === 'number' ? 'input' : 'change', () => {
    clearTimeout(deb);
    q.page = '1';
    deb = setTimeout(load, 250);
  }));
  await load();
  if (q.open) openCompany(q.open);
}

async function openCompany(id) {
  const d = await api(`/companies/${id}`);
  const emails = d.contacts.filter((c) => c.kind === 'email');
  const phones = d.contacts.filter((c) => c.kind === 'phone');
  const forms = d.contacts.filter((c) => c.kind === 'form');
  const primary = emails.find((e) => e.is_primary);
  const a = d.analysis;
  const yes = (v) => (v ? 'tak' : 'nie');
  $('#drawer-body').innerHTML = `
    <div class="row"><div><h2 style="margin:0">${esc(d.name ?? d.primary_domain ?? 'Firma')}</h2><div class="muted">${d.website_url ? link(d.website_url) : 'brak strony'} · ${esc(d.city ?? '')} ${d.voivodeship ? '(' + esc(d.voivodeship) + ')' : ''}</div></div><span class="spacer"></span><button class="btn" data-close>✕ Zamknij</button></div>
    ${d.objection_status === 'objected' ? `<div class="notice">Firma zgłosiła sprzeciw (${fmtDate(d.objection_at)}). Dane kontaktowe usunięto, skanowanie zablokowane.</div>` : ''}
    <div class="card">
      <div class="row">
        <div><div class="muted small">Główny e-mail do kontaktu handlowego</div>
          <div class="primary-email">${primary ? esc(primary.value) : d.contact_status === 'form_only' ? 'Tylko formularz' : 'Nie znaleziono'}</div>
          ${primary ? `<div class="small muted">${esc(META.emailCategories[primary.category] ?? primary.category)} · ${esc(METHOD[primary.method] ?? primary.method)} · pewność ${Math.round(primary.confidence * 100)}% · zweryfikowano ${fmtDate(primary.verified_at)}</div>` : ''}
        </div><span class="spacer"></span>
        ${primary && emailSourceUrl(primary.source_url, primary.value) ? `<a class="btn primary" href="${esc(emailSourceUrl(primary.source_url, primary.value))}" target="_blank" rel="noopener noreferrer nofollow">↗ Otwórz źródło e-maila</a>` : ''}
        ${!primary && forms[0] ? link(forms[0].value, '↗ Otwórz formularz', 'btn') : ''}
      </div>
      ${primary ? `<div class="small" style="margin-top:8px">Źródło: ${link(primary.source_url)}</div>` : ''}
    </div>
    <div class="grid two">
      <div class="card"><h2>Ocena</h2><dl class="kv">
        <dt>Lead Score</dt><dd>${scoreBadge(d.lead_score)}</dd>
        <dt>Kategoria</dt><dd>${catLabel(d.category)} ${a ? `<span class="muted small">(${esc(a.source === 'ai' ? 'AI' : 'heurystyka')}, pewność ${Math.round((a.confidence ?? 0) * 100)}%)</span>` : ''}</dd>
        <dt>Rodzaje schodów</dt><dd>${esc((d.specialization ?? []).join(', ') || '—')}</dd>
        ${a ? `<dt>Na zamówienie</dt><dd>${yes(a.custom_made)}</dd><dt>Konfigurator</dt><dd>${esc({ none: 'brak', basic: 'prosty', advanced_3d: 'zaawansowany 3D' }[a.configurator_quality])}</dd>
        <dt>Galeria realizacji</dt><dd>${yes(a.has_gallery)}</dd><dt>Wycena online</dt><dd>${yes(a.online_quote)}</dd><dt>Własne wizualizacje</dt><dd>${yes(a.has_own_visualizations)}</dd>
        <dt>Potencjał konfiguratora 3D</dt><dd>${esc({ low: 'niski', medium: 'średni', high: 'wysoki' }[a.configurator_3d_potential])}</dd>` : ''}
      </dl>
      ${d.ai_summary ? `<h3>Podsumowanie</h3><p>${esc(d.ai_summary)}</p>` : ''}
      ${a?.source_urls?.length ? `<h3>Źródła oceny</h3><ul class="small">${a.source_urls.map((u) => `<li>${link(u)}</li>`).join('')}</ul>` : ''}
      ${a?.score_breakdown ? `<h3>Składowe score</h3><table class="small"><tbody>${a.score_breakdown.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v > 0 ? '+' : ''}${esc(v)}</td></tr>`).join('')}</tbody></table>` : ''}
      </div>
      <div class="card"><h2>Dane firmy</h2><dl class="kv">
        <dt>NIP</dt><dd>${esc(d.nip ?? '—')}</dd><dt>Telefon</dt><dd>${esc(d.phone ?? '—')}</dd>
        <dt>Status skanowania</dt><dd>${badge(SCAN_STATUS, d.scan_status)} ${d.scan_error ? `<div class="small muted">${esc(d.scan_error)}</div>` : ''}</dd>
        <dt>Ostatni skan</dt><dd>${fmtDate(d.last_scanned_at)}</dd><dt>Ponowna weryfikacja</dt><dd>${fmtDate(d.next_reverify_at)}</dd>
        <dt>Zgoda marketingowa</dt><dd>${d.marketing_consent === 'confirmed' ? '<span class="badge ok">potwierdzona</span>' : '<span class="badge">brak potwierdzonej zgody</span>'}</dd>
        <dt>Sprzeciw</dt><dd>${d.objection_status === 'objected' ? '<span class="badge bad">TAK</span>' : 'nie'}</dd>
        <dt>Domeny</dt><dd>${d.domains.map((x) => `${esc(x.domain)}${x.is_primary ? ' <span class="badge accent">główna</span>' : ''}${x.redirects_to ? ` → ${esc(x.redirects_to)}` : ''}${x.alive === 0 ? ' <span class="badge bad">nie działa</span>' : ''}`).join('<br>') || '—'}</dd>
        <dt>Oddziały / adresy</dt><dd>${d.locations.map((l) => `${esc(l.postal_code ?? '')} ${esc(l.city)}${l.voivodeship ? ` <span class="muted small">(${esc(l.voivodeship)})</span>` : ''}`).join('<br>') || '—'}</dd>
        <dt>Projekty</dt><dd>${d.projects.map((p) => `<a href="#/projects/${p.id}">${esc(p.name)}</a>`).join(', ') || '—'}</dd>
        ${d.merged.length ? `<dt>Scalone rekordy</dt><dd>${d.merged.map((m) => esc(m.primary_domain ?? m.name ?? '#' + m.id)).join(', ')}</dd>` : ''}
      </dl></div>
    </div>
    <div class="card table-wrap"><h2>Wszystkie znalezione adresy e-mail (${emails.length})</h2>
      ${emails.length ? `<table><thead><tr><th>E-mail</th><th>Kategoria</th><th>Sposób</th><th class="num">Pewność</th><th>Weryfikacja</th><th>Źródło</th></tr></thead><tbody>
      ${emails.map((e) => `<tr><td><strong>${esc(e.value)}</strong>${e.is_primary ? ' <span class="badge ok">główny</span>' : ''}${e.status === 'stale' ? ' <span class="badge warn">nieaktualny</span>' : ''}${e.is_personal ? ' <span class="badge">dane osobowe</span>' : ''}${e.context ? `<div class="muted small ellipsis" title="${esc(e.context)}">${esc(e.context)}</div>` : ''}</td>
        <td>${esc(META.emailCategories[e.category] ?? e.category)}</td><td>${esc(METHOD[e.method] ?? e.method)}</td><td class="num">${Math.round(e.confidence * 100)}%</td><td class="small">${fmtDate(e.verified_at)}</td>
        <td class="small">${emailSourceUrl(e.source_url, e.value) ? `<a href="${esc(emailSourceUrl(e.source_url, e.value))}" target="_blank" rel="noopener noreferrer nofollow">↗ Otwórz źródło</a>` : ''}${e.sightings.length > 1 ? `<div class="muted">także: ${e.sightings.filter((s) => s.url !== e.source_url).slice(0, 4).map((s) => link(s.url, new URL(s.url).pathname)).join(', ')}</div>` : ''}</td></tr>`).join('')}
      </tbody></table>` : `<div class="empty">Na stronie nie opublikowano adresu e-mail${forms[0] ? ` — jest formularz: ${link(forms[0].value)}` : ''}.</div>`}
      ${phones.length ? `<h3>Telefony</h3>${phones.map((p) => `${esc(p.value)} <span class="muted small">(${link(p.source_url, 'źródło')})</span>`).join('<br>')}` : ''}
      ${forms.length ? `<h3>Formularz kontaktowy</h3>${forms.map((f) => link(f.value)).join('<br>')}` : ''}
    </div>
    <div class="card table-wrap"><h2>Przeskanowane podstrony (${d.pages.length})</h2>
      <table class="small"><thead><tr><th>URL</th><th>Typ</th><th>HTTP</th><th>JS</th><th>Data</th></tr></thead><tbody>
      ${d.pages.map((p) => `<tr><td class="ellipsis">${link(p.final_url ?? p.url)}${p.error ? `<div class="muted">${esc(p.error)}</div>` : ''}</td><td>${esc(p.page_type)}</td><td>${esc(p.status_code ?? '')}</td><td>${p.rendered ? 'tak' : ''}</td><td>${fmtDate(p.fetched_at)}</td></tr>`).join('')}
      </tbody></table>
      <h3>Źródła danych</h3><ul class="small">${d.sources.map((s) => `<li>${esc(s.kind)}${s.provider ? ' · ' + esc(s.provider) : ''}${s.query ? ` · „${esc(s.query)}”` : ''} ${s.url ? link(s.url, s.title || s.url) : esc(s.title ?? '')} <span class="muted">${fmtDate(s.created_at)}</span></li>`).join('')}</ul>
    </div>
    <div class="card row">
      <button class="btn" data-a="rescan">↻ Skanuj ponownie</button>
      <button class="btn" data-a="heur">Przelicz ocenę</button>
      <button class="btn" data-a="ai" ${META.ai.configured ? '' : 'disabled title="Brak ANTHROPIC_API_KEY"'}>Analiza AI</button>
      <button class="btn" data-a="consent">${d.marketing_consent === 'confirmed' ? 'Cofnij zgodę marketingową' : 'Odnotuj zgodę marketingową'}</button>
      <span class="spacer"></span>
      <button class="btn danger" data-a="objection" ${d.objection_status === 'objected' ? 'disabled' : ''}>Oznacz sprzeciw</button>
      <button class="btn danger" data-a="erase">Usuń dane firmy</button>
    </div>`;
  $('#drawer').hidden = false;
  $('#drawer-body').querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async () => {
    try {
      const act = b.dataset.a;
      if (act === 'rescan') { await post(`/companies/${d.id}/rescan`); toast('Dodano do kolejki skanowania'); }
      if (act === 'heur') { await post(`/companies/${d.id}/reanalyze`); toast('Przeliczono'); openCompany(d.id); }
      if (act === 'ai') { await post(`/companies/${d.id}/reanalyze`, { ai: true }); toast('Dodano do kolejki analizy AI (w ramach budżetu projektu)'); }
      if (act === 'consent') {
        const confirmed = d.marketing_consent !== 'confirmed';
        const note = prompt(confirmed ? 'Opisz podstawę zgody (kiedy, w jakiej formie):' : 'Powód cofnięcia:');
        if (note === null) return;
        await post(`/companies/${d.id}/consent`, { status: confirmed ? 'confirmed' : 'not_confirmed', note });
        openCompany(d.id);
      }
      if (act === 'objection') {
        if (!confirm('Oznaczyć sprzeciw? Dane kontaktowe zostaną usunięte, a firma nie będzie ponownie skanowana.')) return;
        await post(`/companies/${d.id}/objection`, { note: prompt('Notatka (opcjonalnie):') ?? '' });
        openCompany(d.id);
      }
      if (act === 'erase') {
        if (!confirm('Trwale usunąć wszystkie dane tej firmy? Identyfikatory trafią na listę wykluczeń, by nie zebrać ich ponownie.')) return;
        await api(`/companies/${d.id}`, { method: 'DELETE' });
        closeDrawer();
        toast('Dane usunięte');
        router();
      }
    } catch (e) { toast(e.message); }
  }));
}
function closeDrawer() { $('#drawer').hidden = true; }
document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeDrawer(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

// ---------------- zadania ----------------
function jobsTable(jobs, withActions = true) {
  if (!jobs?.length) return '';
  return `<div class="table-wrap"><table class="small"><thead><tr><th>#</th><th>Typ</th><th>Firma</th><th>Status</th><th>Postęp / błąd</th>${withActions ? '<th></th>' : ''}</tr></thead><tbody>
  ${jobs.map((j) => {
    let prog = {};
    try { prog = typeof j.progress === 'string' ? JSON.parse(j.progress) : j.progress ?? {}; } catch {}
    const progText = prog?.phase ? `${esc(prog.phase)} · ${prog.visited?.length ?? 0} podstron · e-maile: ${prog.emails ?? 0}` : prog?.primaryEmail ? `e-mail: ${esc(prog.primaryEmail)}` : prog?.skipped ? `pominięto: ${esc(prog.skipped)}` : prog?.results !== undefined ? `wyniki: ${prog.results}, nowe: ${prog.created}` : '';
    const acts = { queued: ['pause', 'cancel'], running: ['pause', 'cancel'], paused: ['resume', 'cancel'], failed: ['retry'], cancelled: ['retry'], done: [] }[j.status] ?? [];
    const label = { pause: '⏸', resume: '▶', cancel: '✕', retry: '↻' };
    return `<tr><td>${j.id}</td><td>${esc(JOB_TYPE[j.type] ?? j.type)}</td><td>${j.company_id ? `<a href="#/companies?open=${j.company_id}">${esc(j.company_name ?? j.primary_domain ?? '#' + j.company_id)}</a>` : '—'}</td>
      <td>${badge(JOB_STATUS, j.status)}${j.attempts > 1 ? ` <span class="muted">próba ${j.attempts}</span>` : ''}</td>
      <td>${progText}${j.last_error ? `<div class="muted ellipsis" title="${esc(j.last_error)}">${esc(j.last_error)}</div>` : ''}</td>
      ${withActions ? `<td class="row">${acts.map((a) => `<button class="btn small" data-job="${j.id}" data-jact="${a}" title="${a}">${label[a]}</button>`).join('')}</td>` : ''}</tr>`;
  }).join('')}</tbody></table></div>`;
}
function errorsTable(errs) {
  if (!errs?.length) return '';
  return `<div class="table-wrap"><table class="small"><thead><tr><th>Czas</th><th>Obszar</th><th>Firma</th><th>Komunikat</th></tr></thead><tbody>
  ${errs.map((e) => `<tr><td>${fmtDate(e.created_at)}</td><td>${esc(e.scope)}</td><td>${e.company_id ? `<a href="#/companies?open=${e.company_id}">${esc(e.company_name ?? e.primary_domain ?? '#' + e.company_id)}</a>` : '—'}</td><td>${esc(e.message)}${e.url ? `<div>${link(e.url)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

async function renderJobs() {
  const state = { status: '', queue: '' };
  const load = async () => {
    const pid = scope();
    const qs = new URLSearchParams(Object.entries({ ...state, projectId: pid }).filter(([, v]) => v));
    const [jobs, errors] = await Promise.all([api(`/jobs?${qs}&limit=200`), api(`/errors${pid ? `?projectId=${pid}` : ''}`)]);
    $('#jobs').innerHTML = jobsTable(jobs) || '<div class="empty">Brak zadań</div>';
    $('#errs').innerHTML = errorsTable(errors) || '<div class="empty">Brak błędów</div>';
    $('#jobs').querySelectorAll('[data-jact]').forEach((b) => b.addEventListener('click', async () => {
      await post(`/jobs/${b.dataset.job}/${b.dataset.jact}`);
      load();
    }));
  };
  view.innerHTML = `
    <div class="card filters">
      <select id="j-status"><option value="">Status: wszystkie</option>${Object.entries(JOB_STATUS).map(([k, [v]]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
      <select id="j-queue"><option value="">Kolejka: wszystkie</option><option value="discovery">Wyszukiwanie</option><option value="crawl">Skanowanie</option><option value="analysis">Analiza AI</option></select>
      <span class="muted small">Wstrzymane zadanie zachowuje zebrane wyniki (strony i kontakty są zapisywane na bieżąco) i po wznowieniu korzysta z cache.</span>
    </div>
    <div class="card"><h2>Zadania</h2><div id="jobs"></div></div>
    <div class="card"><h2>Monitoring błędów</h2><div id="errs"></div></div>`;
  $('#j-status').addEventListener('change', (e) => { state.status = e.target.value; load(); });
  $('#j-queue').addEventListener('change', (e) => { state.queue = e.target.value; load(); });
  await load();
  poll(load, 4000);
}

// ---------------- RODO ----------------
async function renderPrivacy() {
  const [sum, clause, log] = await Promise.all([api('/privacy/summary'), api('/privacy/clause'), api('/privacy/log')]);
  view.innerHTML = `
    <div class="card notice info">Moduł służy do researchu firm i budowy bazy kontaktów — nie wysyła wiadomości. Znalezienie publicznego adresu nie oznacza zgody na marketing; domyślny status każdej firmy to „brak potwierdzonej zgody”.</div>
    <div class="grid kpis">
      ${kpi('Firmy ze sprzeciwem', fmtNum(sum.objected))}
      ${kpi('Adresy indywidualne (dane osobowe)', fmtNum(sum.personalContacts))}
      ${kpi('Retencja', `${sum.retentionDays} dni`, 'od ostatniej weryfikacji')}
      ${kpi('Lista wykluczeń', fmtNum(sum.suppressions.reduce((a, s) => a + s.n, 0)), 'hashe domen, e-maili i NIP')}
    </div>
    <div class="grid two">
      <div class="card"><div class="row"><h2 style="margin:0">Klauzula informacyjna (art. 14 RODO)</h2><span class="spacer"></span><button class="btn small" id="copy">Kopiuj</button></div><p class="muted small">Do przekazania firmie najpóźniej przy pierwszym kontakcie.</p><pre class="clause" id="clause">${esc(clause)}</pre></div>
      <div class="card"><h2>Zasady zbierania danych</h2><ul>
        <li>Tylko dane opublikowane przez firmę na jej oficjalnej stronie: nazwa, e-mail, telefon, miejscowość, NIP, treść ofertowa.</li>
        <li>Dla każdego adresu zapisujemy dokładny URL i datę pozyskania oraz weryfikacji.</li>
        <li>Adresy nie są generowane ani zgadywane (np. imie.nazwisko@).</li>
        <li>Crawler przestrzega robots.txt (User-Agent: <span class="mono">${esc(META.userAgent)}</span>), limitów zapytań i nie omija CAPTCHA ani zabezpieczeń.</li>
        <li>Sprzeciw: usuwa dane kontaktowe i blokuje ponowne zbieranie. Usunięcie: kasuje rekord; zostaje wyłącznie hash identyfikatora.</li>
        <li>Kontakty są ponownie weryfikowane co ${esc(META.reverifyDays)} dni; nieaktualne są oznaczane.</li>
      </ul></div>
    </div>
    <div class="card table-wrap"><h2>Rejestr czynności</h2>${log.length ? `<table class="small"><thead><tr><th>Czas</th><th>Czynność</th><th>Firma</th><th>Szczegóły</th></tr></thead><tbody>${log.map((l) => `<tr><td>${fmtDate(l.created_at)}</td><td>${esc(l.action)}</td><td>${esc(l.company_id ?? '—')}</td><td class="mono">${esc(l.details ?? '')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Brak wpisów</div>'}</div>`;
  $('#copy').addEventListener('click', async () => { await navigator.clipboard.writeText(clause); toast('Skopiowano'); });
}

// ---------------- start ----------------
async function loadProjectsIntoScope() {
  const list = await api('/projects');
  const sel = $('#scope');
  const cur = sel.value;
  sel.innerHTML = `<option value="">Wszystkie</option>${list.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}`;
  sel.value = cur;
}

async function init() {
  META = await api('/meta');
  $('#sysinfo').innerHTML = `
    <div>Wyszukiwarki: ${META.providers.map((p) => `${esc(p.key)} ${p.configured ? '✓' : '✕'}`).join(', ')}</div>
    <div>Analiza AI: ${META.ai.configured ? '✓' : '✕ (heurystyka)'}</div>
    <div>Renderowanie JS: ${META.rendering ? '✓ Playwright' : '✕'}</div>`;
  try { $('#scope').value = localStorage.getItem('ld-scope') ?? ''; } catch {}
  await loadProjectsIntoScope();
  try { $('#scope').value = localStorage.getItem('ld-scope') ?? ''; } catch {}
  $('#scope').addEventListener('change', () => { try { localStorage.setItem('ld-scope', scope()); } catch {} router(); });
  window.addEventListener('hashchange', router);
  router();
}
init().catch((e) => { view.innerHTML = `<div class="card notice">Nie udało się załadować panelu: ${esc(e.message)}</div>`; });
