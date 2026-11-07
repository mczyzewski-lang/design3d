// Test end-to-end na lokalnych fixture'ach HTML: import CSV -> kolejka -> crawler -> kontakty -> analiza -> deduplikacja -> eksport.
// Nie korzysta z zewnętrznych stron.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { setupTestEnv } from './helpers/env.ts';
import { startFixtureServer, type FixtureServer } from './helpers/fixtureServer.ts';
import { all, get, run } from '../src/db/index.ts';
import { overrideConfig } from '../src/config.ts';
import { createProject, getProject } from '../src/projects/projects.ts';
import { startProject, pauseProject, resumeProject } from '../src/projects/lifecycle.ts';
import { importCsv } from '../src/discovery/csvImport.ts';
import { startWorkers, stopWorkers, drain } from '../src/queue/worker.ts';
import { recoverStale } from '../src/queue/queue.ts';
import { exportRows, toCsv, toXlsx } from '../src/export/export.ts';
import { objectCompany, eraseCompany } from '../src/privacy/privacy.ts';
import { renderingAvailable, closeBrowser } from '../src/crawler/render.ts';
import { createApp } from '../src/app.ts';

let fx: FixtureServer;
let projectId: number;

const companyByDomain = (domain: string) => {
  const d = get(`SELECT company_id FROM domains WHERE domain = ?`, domain);
  if (!d) return undefined;
  let c = get(`SELECT * FROM companies WHERE id = ?`, d.company_id)!;
  while (c.merged_into_id) c = get(`SELECT * FROM companies WHERE id = ?`, c.merged_into_id)!;
  return c;
};
const emailsOf = (companyId: number) => all(`SELECT * FROM contacts WHERE company_id = ? AND kind = 'email'`, companyId);

before(async () => {
  fx = await startFixtureServer({
    results: (q) => {
      if (q.includes('Wiśniewski')) return [{ url: 'http://tylko-formularz.test:{{PORT}}/', title: 'Schody Wiśniewski – Tylko Formularz', description: '' }];
      return [
        { url: 'https://www.facebook.com/schodyjakies', title: 'Schody na Facebooku', description: '' },
        { url: 'https://www.panoramafirm.pl/schody', title: 'Schody – Panorama Firm', description: '' },
        { url: 'http://budex-remonty.test:{{PORT}}/uslugi', title: 'BUDEX', description: 'schody betonowe' },
        { url: 'http://hurtownia-schodow.test:{{PORT}}/', title: 'Hurtownia schodów', description: '' },
      ];
    },
  });
  setupTestEnv({ braveApiKey: 'test-key', braveBaseUrl: `http://search.test:${fx.port}/res/v1/web/search`, braveCostPerQuery: 0.005 });
  startWorkers();
});

after(async () => {
  await stopWorkers();
  await closeBrowser();
  await fx.close();
});

test('pełny przebieg: import CSV, skanowanie, e-maile ze źródłami', async () => {
  projectId = createProject({ name: 'Producenci schodów — Polska', maxPagesPerCompany: 8 });
  const sites = [
    'schody-kowalski.test', 'stalowe-schody.test', 'budex-remonty.test', 'hurtownia-schodow.test', 'tylko-formularz.test',
    'bez-kontaktu.test', 'js-schody.test', 'stara-domena.test', 'kowalski-poznan.test', 'zakazane.test', 'chroniona.test',
    'konfigurator-schody.test',
  ];
  const csv = ['nazwa;strona;miasto', ...sites.map((s) => `;http://${s}:${fx.port}/;`), `Duplikat Kowalski;http://www.schody-kowalski.test:${fx.port}/;Poznań`, 'Facebook;https://facebook.com/schody;', 'Firma bez strony;;Kraków'].join('\n');
  const summary = importCsv(projectId, csv);
  assert.equal(summary.rows, 15);
  assert.equal(summary.created, 13, 'www. tej samej domeny nie tworzy nowej firmy');
  assert.equal(summary.existing, 1);
  assert.equal(summary.skipped, 1, 'facebook.com to nie strona firmy');
  assert.equal(summary.withoutWebsite, 1);
  startProject(projectId);
  await drain(120_000);

  // 1–4: strona Kontakt, prawdziwy e-mail, dokładny URL źródła
  const k = companyByDomain('schody-kowalski.test')!;
  assert.equal(k.scan_status, 'done');
  assert.equal(k.primary_email, 'oferta@schody-kowalski.test', 'adres do zamówień/wycen ma pierwszeństwo przed biuro@');
  assert.equal(k.primary_email_source, fx.url('schody-kowalski.test', '/kontakt'));
  const kEmails = Object.fromEntries(emailsOf(k.id).map((e) => [e.value, e]));
  assert.equal(kEmails['oferta@schody-kowalski.test'].method, 'obfuscated');
  assert.equal(kEmails['oferta@schody-kowalski.test'].category, 'sales');
  assert.equal(kEmails['biuro@schody-kowalski.test'].method, 'mailto');
  assert.equal(kEmails['praca@schody-kowalski.test'].category, 'recruitment');
  assert.equal(kEmails['reklamacje@schody-kowalski.test'].category, 'complaints');
  assert.equal(kEmails['iod@schody-kowalski.test'].category, 'privacy');
  assert.equal(kEmails['hello@webagencja.test'].category, 'agency', 'e-mail twórcy strony nie jest kontaktem firmy');
  assert.ok(kEmails['praca@schody-kowalski.test'].source_url.endsWith(`:${fx.port}/`), 'praca@ znaleziony na stronie głównej');
  for (const e of Object.values(kEmails) as any[]) assert.ok(e.verified_at && e.source_url.startsWith('http://'), 'każdy e-mail ma URL i datę weryfikacji');
  assert.ok(Object.keys(kEmails).every((e) => !/^(jan|imie)/.test(e)), 'brak zgadywanych adresów');
  assert.equal(k.nip, '7781479112');
  assert.equal(k.city, 'Poznań');
  assert.equal(k.voivodeship, 'wielkopolskie');
  assert.equal(k.phone, '+48 61 852 33 44');
  assert.ok(k.lead_score >= 75, `score producenta: ${k.lead_score}`);
  assert.ok(['manufacturer', 'manufacturer_installer'].includes(k.category));

  // Cloudflare cfemail + JSON-LD + robots.txt Disallow
  const st = companyByDomain('stalowe-schody.test')!;
  assert.equal(st.primary_email, 'kontakt@stalowe-schody.test');
  assert.equal(emailsOf(st.id)[0].method, 'cfemail');
  assert.equal(st.name, 'Stalowe Schody Nowak');
  assert.equal(st.city, 'Katowice');
  assert.equal(st.voivodeship, 'śląskie');
  assert.ok(!fx.requests.some((r) => r.host === 'stalowe-schody.test' && r.path.startsWith('/admin')), 'Disallow: /admin respektowany');
});

test('kategoryzacja: producent vs firma budowlana vs hurtownia; konfigurator obniża score', () => {
  assert.equal(companyByDomain('budex-remonty.test')!.category, 'construction');
  assert.equal(companyByDomain('hurtownia-schodow.test')!.category, 'wholesale');
  const conf = companyByDomain('konfigurator-schody.test')!;
  assert.equal(conf.has_configurator, 1);
  assert.ok(conf.lead_score < companyByDomain('schody-kowalski.test')!.lead_score - 20);
  assert.ok(companyByDomain('budex-remonty.test')!.lead_score < 50);
});

test('deduplikacja: przekierowanie domeny i ten sam NIP łączą rekordy', async () => {
  const k = companyByDomain('schody-kowalski.test')!;
  assert.equal(companyByDomain('stara-domena.test')!.id, k.id, 'stara-domena.test przekierowuje na schody-kowalski.test');
  assert.equal(companyByDomain('kowalski-poznan.test')!.id, k.id, 'kowalski-poznan.test ma ten sam NIP');
  const domains = all(`SELECT domain, redirects_to FROM domains WHERE company_id = ?`, k.id).map((d) => d.domain).sort();
  assert.deepEqual(domains, ['kowalski-poznan.test', 'schody-kowalski.test', 'stara-domena.test']);
  assert.ok(emailsOf(k.id).some((e) => e.value === 'poznan@kowalski-poznan.test'), 'kontakty oddziału zachowane po scaleniu');
  assert.equal(get(`SELECT primary_email FROM companies WHERE id = ?`, k.id)!.primary_email, 'oferta@schody-kowalski.test');
  const locs = all(`SELECT city FROM company_locations WHERE company_id = ?`, k.id).map((l) => l.city);
  assert.ok(locs.includes('Poznań'));
  const visible = get(`SELECT COUNT(*) AS n FROM companies WHERE merged_into_id IS NULL AND id IN (SELECT company_id FROM project_companies WHERE project_id = ?)`, projectId)!.n;
  assert.equal(visible, 11, '13 rekordów -> 11 unikalnych firm');
  const { stats } = await import('../src/projects/projects.ts');
  const st = stats(projectId);
  assert.equal(st.discovered_companies, 13);
  assert.equal(st.unique_companies, 11);
});

test('brak e-maila: „Tylko formularz” i brak kontaktu', () => {
  const f = companyByDomain('tylko-formularz.test')!;
  assert.equal(f.contact_status, 'form_only');
  assert.equal(f.primary_email, null);
  assert.equal(f.contact_form_url, fx.url('tylko-formularz.test', '/kontakt-z-nami/'));
  const n = companyByDomain('bez-kontaktu.test')!;
  assert.equal(n.contact_status, 'none');
  assert.equal(n.scan_status, 'done');
});

test('robots.txt, ochrona anty-botowa i identyfikacja User-Agenta', () => {
  assert.equal(companyByDomain('zakazane.test')!.scan_status, 'robots_disallowed');
  assert.deepEqual([...new Set(fx.requests.filter((r) => r.host === 'zakazane.test').map((r) => r.path))], ['/robots.txt'], 'poza robots.txt nic nie pobrano');
  const ch = companyByDomain('chroniona.test')!;
  assert.equal(ch.scan_status, 'blocked');
  assert.equal(fx.requests.filter((r) => r.host === 'chroniona.test' && r.path === '/').length, 1, 'brak prób obchodzenia blokady');
  assert.ok(fx.requests.filter((r) => r.host !== 'search.test').every((r) => r.ua.includes('Design3dLeadBot') || r.ua.includes('HeadlessChrome') || r.ua.includes('Design3d')));
});

test('strona renderowana przez JavaScript (Playwright tylko gdy potrzebny)', (t) => {
  const c = companyByDomain('js-schody.test')!;
  if (!renderingAvailable()) {
    t.skip('Playwright niedostępny w tym środowisku');
    return;
  }
  assert.equal(c.primary_email, 'biuro@js-schody.test');
  assert.equal(emailsOf(c.id)[0].method, 'rendered');
  const rendered = all(`SELECT url FROM pages WHERE rendered = 1`).map((p) => p.url);
  assert.ok(rendered.every((u) => u.includes('js-schody.test')), `renderowano tylko stronę JS: ${rendered.join(', ')}`);
});

test('eksport CSV/XLSX zawiera prawdziwe zapisane rekordy', async () => {
  const rows = exportRows({ projectId });
  assert.equal(rows.length, 11);
  const csv = toCsv(rows);
  assert.ok(csv.includes('oferta@schody-kowalski.test'));
  assert.ok(csv.includes(fx.url('schody-kowalski.test', '/kontakt')));
  assert.ok(csv.includes('brak potwierdzonej zgody'), 'domyślnie brak zgody marketingowej');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await toXlsx(rows)) as any);
  const ws = wb.getWorksheet('Firmy')!;
  assert.equal(ws.rowCount, 12);
  const emailsInXlsx = ws.getColumn(5).values.filter(Boolean).map(String);
  assert.ok(emailsInXlsx.includes('kontakt@stalowe-schody.test'));
});

test('wstrzymanie i wznowienie skanowania bez utraty wyników', async () => {
  const pid = createProject({ name: 'Pauza', maxPagesPerCompany: 6 });
  importCsv(pid, `strona\nhttp://wolna.test:${fx.port}/`);
  startProject(pid);
  const job = () => get(`SELECT * FROM jobs WHERE project_id = ? AND type = 'scan_company'`, pid)!;
  // poczekaj, aż crawler pobierze co najmniej 2 podstrony
  for (let i = 0; i < 100 && fx.requests.filter((r) => r.host === 'wolna.test' && r.path !== '/robots.txt').length < 2; i++) await new Promise((r) => setTimeout(r, 50));
  pauseProject(pid);
  for (let i = 0; i < 100 && job().status === 'running'; i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(job().status, 'queued', 'zadanie wraca do kolejki po pauzie');
  assert.equal(getProject(pid)!.status, 'paused');
  const savedPages = get(`SELECT COUNT(*) AS n FROM pages WHERE domain = 'wolna.test' AND status_code = 200`)!.n;
  assert.ok(savedPages >= 1, 'pobrane strony zapisane przed pauzą');
  const fetchedBefore = new Set(fx.requests.filter((r) => r.host === 'wolna.test').map((r) => r.path));
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(job().status, 'queued', 'wstrzymany projekt nie jest przetwarzany');

  resumeProject(pid);
  await drain(60_000);
  const c = companyByDomain('wolna.test')!;
  assert.equal(job().status, 'done');
  assert.equal(c.primary_email, 'kontakt@wolna.test');
  // strony pobrane przed pauzą nie zostały pobrane ponownie (cache)
  for (const p of fetchedBefore) if (p !== '/robots.txt') assert.equal(fx.requests.filter((r) => r.host === 'wolna.test' && r.path === p).length, 1, `ponownie pobrano ${p}`);
});

test('discovery przez API wyszukiwarki: limit budżetu, filtrowanie katalogów', async () => {
  // bez budżetu — brak płatnych zapytań
  const p0 = createProject({ name: 'Bez budżetu', discoveryProvider: 'brave', budgetLimitUsd: 0, keywords: ['producent schodów'], cityKeywords: [], cities: [] });
  const s0 = startProject(p0);
  assert.equal(s0.queries, 0);
  assert.ok(s0.warnings.some((w) => w.includes('budżetu')));

  const pid = createProject({ name: 'Brave', discoveryProvider: 'brave', budgetLimitUsd: 0.012, keywords: ['producent schodów', 'schody na wymiar'], cityKeywords: ['schody drewniane'], cities: ['Poznań', 'Kraków'] });
  const s = startProject(pid);
  assert.equal(s.queries, 4);
  await drain(60_000);
  assert.equal(fx.searchQueries.length, 2, 'budżet $0.012 przy $0.005/zapytanie = 2 zapytania');
  const p = getProject(pid)!;
  assert.ok(Math.abs(p.api_cost_usd - 0.01) < 1e-9);
  assert.equal(get(`SELECT COUNT(*) AS n FROM discovery_queries WHERE project_id = ? AND status = 'skipped'`, pid)!.n, 2);
  assert.ok(!get(`SELECT 1 FROM domains WHERE domain IN ('facebook.com','panoramafirm.pl')`), 'katalogi i social media pominięte');
  const linked = all(`SELECT d.domain FROM project_companies pc JOIN domains d ON d.company_id = pc.company_id WHERE pc.project_id = ?`, pid).map((r) => r.domain).sort();
  assert.deepEqual(linked, ['budex-remonty.test', 'hurtownia-schodow.test'], 'istniejące firmy podpięte do projektu bez duplikatów');
  assert.ok(get(`SELECT 1 FROM sources WHERE kind = 'search_result' AND query = 'producent schodów'`));
});

test('ustalanie oficjalnej strony dla firmy z samą nazwą', async () => {
  const pid = createProject({ name: 'Po nazwie', discoveryProvider: 'brave', budgetLimitUsd: 1 });
  const r = importCsv(pid, 'nazwa;miasto\nTylko Formularz Wiśniewski;Rzeszów');
  assert.equal(r.queuedResolves, 1);
  run(`UPDATE search_projects SET status = 'running' WHERE id = ?`, pid);
  await drain(60_000);
  const c = companyByDomain('tylko-formularz.test')!;
  assert.ok(all(`SELECT 1 FROM project_companies WHERE project_id = ? AND company_id = ?`, pid, c.id).length === 1, 'firma z nazwy połączona z istniejącą domeną');
});

test('RODO: sprzeciw i usunięcie blokują ponowne zbieranie', () => {
  const b = companyByDomain('budex-remonty.test')!;
  objectCompany(b.id, 'test');
  const after1 = get(`SELECT * FROM companies WHERE id = ?`, b.id)!;
  assert.equal(after1.objection_status, 'objected');
  assert.equal(emailsOf(b.id).length, 0);
  assert.equal(exportRows({}).some((r) => r.id === b.id), false, 'firma ze sprzeciwem nie trafia do eksportu');
  const h = companyByDomain('hurtownia-schodow.test')!;
  eraseCompany(h.id);
  assert.equal(get(`SELECT 1 FROM companies WHERE id = ?`, h.id), undefined);
  const pid = createProject({ name: 'Reimport' });
  const r = importCsv(pid, `strona\nhttp://hurtownia-schodow.test:${fx.port}/\nhttp://budex-remonty.test:${fx.port}/`);
  assert.equal(r.created, 0);
  assert.equal(r.skipped, 2, 'domeny po usunięciu i po sprzeciwie są na liście wykluczeń');
  assert.equal(get(`SELECT COUNT(*) AS n FROM privacy_log`)!.n, 2);
});

test('odzyskiwanie zadań przerwanych restartem', () => {
  const id = run(`INSERT INTO jobs (queue, type, status, locked_at, attempts) VALUES ('crawl', 'scan_company', 'running', '2000-01-01T00:00:00Z', 1)`).lastInsertRowid;
  assert.ok(recoverStale(60_000) >= 1);
  assert.equal(get(`SELECT status FROM jobs WHERE id = ?`, id)!.status, 'queued');
  run(`DELETE FROM jobs WHERE id = ?`, id);
});

test('API panelu wymaga logowania i zwraca dane', async () => {
  overrideConfig({ adminPassword: 'sekret' });
  const server = createApp().listen(0);
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}/api/admin/lead-discovery`;
  try {
    assert.equal((await fetch(`${base}/stats`)).status, 401);
    const auth = { authorization: 'Basic ' + Buffer.from('admin:sekret').toString('base64') };
    const list = await (await fetch(`${base}/companies?projectId=${projectId}&sort=score&minScore=75`, { headers: auth })).json();
    assert.ok(list.rows.some((r: any) => r.primary_email === 'oferta@schody-kowalski.test'));
    const detail = await (await fetch(`${base}/companies/${list.rows[0].id}`, { headers: auth })).json();
    assert.ok(detail.contacts.length > 0 && detail.pages.length > 0);
    const bytes = Buffer.from(await (await fetch(`${base}/export.csv?projectId=${projectId}`, { headers: auth })).arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM dla Excela');
    assert.ok(bytes.toString('utf8').includes('Źródło e-maila (URL)'));
    const page = await fetch(`http://127.0.0.1:${port}/admin/`, { headers: auth });
    assert.equal(page.status, 200);
  } finally {
    server.close();
    overrideConfig({ adminPassword: '' });
  }
});

test('analiza AI: osobna kolejka, structured output, koszt w ramach budżetu', async () => {
  overrideConfig({ anthropicApiKey: 'test-key', anthropicBaseUrl: `http://127.0.0.1:${fx.port}`, anthropicModel: 'claude-opus-5-5' });
  const pid = createProject({ name: 'AI', aiEnabled: true, budgetLimitUsd: 0.5 });
  const c = companyByDomain('stalowe-schody.test')!;
  run(`INSERT INTO project_companies (project_id, company_id, discovered_via) VALUES (?, ?, 'csv')`, pid, c.id);
  run(`UPDATE search_projects SET status = 'running' WHERE id = ?`, pid);
  const { enqueue } = await import('../src/queue/queue.ts');
  enqueue({ queue: 'analysis', type: 'analyze_company', projectId: pid, companyId: c.id });
  await drain(30_000);
  const req = fx.aiRequests.at(-1)!;
  assert.equal(req.body.model, 'claude-opus-5-5');
  assert.equal(req.body.output_config.format.type, 'json_schema');
  assert.equal(req.body.fallbacks, 'default');
  assert.ok(String(req.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01'));
  assert.ok(String(req.body.messages[0].content).includes('kontakt') || String(req.body.messages[0].content).includes('Stalowe'));
  const after1 = get(`SELECT * FROM companies WHERE id = ?`, c.id)!;
  assert.equal(after1.analysis_status, 'ai');
  assert.equal(after1.category, 'manufacturer');
  const a = JSON.parse(after1.analysis_json);
  assert.ok(!a.source_urls.includes('https://zmyslony.example/'), 'AI nie może podać źródła spoza przeskanowanych podstron');
  const cost = (3000 * 4 + 400 * 20) / 1e6;
  assert.ok(Math.abs(getProject(pid)!.api_cost_usd - cost) < 1e-9);
  // brak budżetu -> brak wywołania
  const before = fx.aiRequests.length;
  const p2 = createProject({ name: 'AI bez budżetu', aiEnabled: true, budgetLimitUsd: 0 });
  run(`UPDATE search_projects SET status = 'running' WHERE id = ?`, p2);
  enqueue({ queue: 'analysis', type: 'analyze_company', projectId: p2, companyId: c.id });
  await drain(30_000);
  assert.equal(fx.aiRequests.length, before, 'bez ustawionego budżetu nie ma płatnych wywołań');
  overrideConfig({ anthropicApiKey: '' });
});
