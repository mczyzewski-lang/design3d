// Projekty wyszukiwania, szablony branż, budżet API i statystyki.

import { all, get, run, tx, json, nowIso, parseJson, type Row } from '../db/index.ts';
import { CITIES } from '../util/polish.ts';

export interface IndustryTemplate {
  key: string;
  name: string;
  industry: string;
  keywords: string[];
  cityKeywords: string[];
  cities: string[];
}

export const TEMPLATES: IndustryTemplate[] = [
  {
    key: 'stairs-pl',
    name: 'Producenci schodów — Polska',
    industry: 'stairs',
    keywords: [
      'producent schodów drewnianych',
      'producent schodów stalowych',
      'schody na wymiar',
      'schody samonośne producent',
      'schody dywanowe producent',
      'schody zabiegowe',
      'schody betonowe oblicowanie drewnem producent',
      'schody wspornikowe producent',
      'producent schodów',
      'stolarnia schody',
    ],
    // frazy łączone z miastami
    cityKeywords: ['schody drewniane', 'schody na zamówienie', 'producent schodów', 'schody na wymiar'],
    cities: CITIES.slice(0, 60).map(([c]) => c),
  },
];

export interface ProjectInput {
  name: string;
  industry?: string;
  keywords?: string[];
  cityKeywords?: string[];
  cities?: string[];
  country?: string;
  region?: string | null;
  maxCompanies?: number;
  maxPagesPerCompany?: number;
  discoveryProvider?: 'none' | 'brave' | 'google';
  budgetLimitUsd?: number;
  aiEnabled?: boolean;
}

/** Kombinacje fraz i miast (bez duplikatów). */
export function generateQueries(keywords: string[], cityKeywords: string[], cities: string[]): string[] {
  const out = new Set<string>();
  for (const k of keywords) out.add(k.trim().toLowerCase());
  for (const city of cities) for (const k of cityKeywords) out.add(`${k.trim().toLowerCase()} ${city}`);
  return [...out].filter(Boolean);
}

export function createProject(input: ProjectInput): number {
  const tpl = TEMPLATES[0];
  const keywords = input.keywords?.length ? input.keywords : tpl.keywords;
  const payload = {
    keywords,
    cityKeywords: input.cityKeywords ?? tpl.cityKeywords,
  };
  const r = run(
    `INSERT INTO search_projects (name, industry, keywords, cities, country, region, max_companies, max_pages_per_company,
       discovery_provider, budget_limit_usd, ai_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.name.trim(), input.industry ?? 'stairs', json(payload), json(input.cities ?? tpl.cities), input.country ?? 'PL',
    input.region ?? null, clampInt(input.maxCompanies ?? 1000, 1, 10000), clampInt(input.maxPagesPerCompany ?? 8, 1, 30),
    input.discoveryProvider ?? 'none', Math.max(0, Number(input.budgetLimitUsd ?? 0)), !!input.aiEnabled,
  );
  return r.lastInsertRowid;
}

export function updateProject(id: number, input: Partial<ProjectInput>): void {
  const p = getProject(id);
  if (!p) throw new Error('Projekt nie istnieje');
  const kw = parseJson<any>(p.keywords, {});
  run(
    `UPDATE search_projects SET name = ?, keywords = ?, cities = ?, region = ?, max_companies = ?, max_pages_per_company = ?,
       discovery_provider = ?, budget_limit_usd = ?, ai_enabled = ?, updated_at = ? WHERE id = ?`,
    input.name ?? p.name,
    json({ keywords: input.keywords ?? kw.keywords ?? [], cityKeywords: input.cityKeywords ?? kw.cityKeywords ?? [] }),
    json(input.cities ?? parseJson(p.cities, [])), input.region === undefined ? p.region : input.region,
    clampInt(input.maxCompanies ?? p.max_companies, 1, 10000), clampInt(input.maxPagesPerCompany ?? p.max_pages_per_company, 1, 30),
    input.discoveryProvider ?? p.discovery_provider, Math.max(0, Number(input.budgetLimitUsd ?? p.budget_limit_usd)),
    input.aiEnabled === undefined ? p.ai_enabled : !!input.aiEnabled, nowIso(), id,
  );
}

const clampInt = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(Number(v) || a)));

export function getProject(id: number): Row | undefined {
  return get(`SELECT * FROM search_projects WHERE id = ?`, id);
}

export function projectView(p: Row): Row {
  const kw = parseJson<any>(p.keywords, {});
  return { ...p, keywords: kw.keywords ?? [], cityKeywords: kw.cityKeywords ?? [], cities: parseJson(p.cities, []), ai_enabled: !!p.ai_enabled };
}

export function setProjectStatus(id: number, status: string): void {
  const extra = status === 'running' ? `, started_at = COALESCE(started_at, '${nowIso()}'), finished_at = NULL` : ['completed', 'stopped'].includes(status) ? `, finished_at = '${nowIso()}'` : '';
  run(`UPDATE search_projects SET status = ?, updated_at = ?${extra} WHERE id = ?`, status, nowIso(), id);
}

export function projectCompanyCount(projectId: number): number {
  return get(
    `SELECT COUNT(*) AS n FROM project_companies pc JOIN companies c ON c.id = pc.company_id WHERE pc.project_id = ? AND c.merged_into_id IS NULL`,
    projectId,
  )!.n;
}

// ---------------- Budżet ----------------
export function remainingBudget(projectId: number): number {
  const p = getProject(projectId);
  if (!p) return 0;
  return Math.max(0, p.budget_limit_usd - p.api_cost_usd);
}

/** Rezerwuje koszt przed płatnym wywołaniem. Zwraca false, gdy budżet nie pozwala. */
export function canSpend(projectId: number, estimateUsd: number): boolean {
  const p = getProject(projectId);
  if (!p || p.budget_limit_usd <= 0) return false;
  return p.api_cost_usd + estimateUsd <= p.budget_limit_usd + 1e-9;
}

export function recordUsage(u: { projectId: number | null; provider: string; costUsd: number; units?: number; inputTokens?: number; outputTokens?: number }): void {
  tx(() => {
    run(
      `INSERT INTO api_usage (project_id, provider, units, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?)`,
      u.projectId, u.provider, u.units ?? 1, u.inputTokens ?? null, u.outputTokens ?? null, u.costUsd,
    );
    if (u.projectId) run(`UPDATE search_projects SET api_cost_usd = api_cost_usd + ?, updated_at = ? WHERE id = ?`, u.costUsd, nowIso(), u.projectId);
  });
}

export function logError(e: { jobId?: number | null; projectId?: number | null; companyId?: number | null; scope: string; message: string; url?: string | null }): void {
  run(
    `INSERT INTO error_log (job_id, project_id, company_id, scope, message, url) VALUES (?, ?, ?, ?, ?, ?)`,
    e.jobId ?? null, e.projectId ?? null, e.companyId ?? null, e.scope, e.message.slice(0, 1000), e.url ?? null,
  );
}

// ---------------- Statystyki ----------------
export function stats(projectId?: number): Row {
  const scope = projectId
    ? `FROM companies c JOIN project_companies pc ON pc.company_id = c.id AND pc.project_id = ${Number(projectId)} WHERE c.merged_into_id IS NULL`
    : `FROM companies c WHERE c.merged_into_id IS NULL`;
  const s = get(`SELECT
      COUNT(*) AS unique_companies,
      SUM(CASE WHEN c.scan_status = 'done' THEN 1 ELSE 0 END) AS scanned,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM domains d WHERE d.company_id = c.id AND d.alive = 1) THEN 1 ELSE 0 END) AS with_website,
      SUM(CASE WHEN c.contact_status = 'email' THEN 1 ELSE 0 END) AS with_email,
      SUM(CASE WHEN c.contact_status = 'form_only' THEN 1 ELSE 0 END) AS form_only,
      SUM(CASE WHEN c.category IN ('manufacturer','manufacturer_installer') THEN 1 ELSE 0 END) AS manufacturers,
      SUM(CASE WHEN c.lead_score > 75 THEN 1 ELSE 0 END) AS score_over_75,
      SUM(CASE WHEN c.has_configurator = 1 THEN 1 ELSE 0 END) AS with_configurator,
      SUM(CASE WHEN c.scan_status IN ('error','blocked') THEN 1 ELSE 0 END) AS scan_errors,
      SUM(CASE WHEN c.needs_review = 1 THEN 1 ELSE 0 END) AS needs_review,
      SUM(CASE WHEN c.scan_status IN ('pending','scanning') THEN 1 ELSE 0 END) AS pending
    ${scope}`)!;
  const discovered = projectId
    ? get(`SELECT COUNT(*) AS n FROM project_companies WHERE project_id = ?`, projectId)!.n
    : get(`SELECT COUNT(*) AS n FROM companies`)!.n;
  const pages = projectId
    ? get(`SELECT COUNT(*) AS n FROM pages WHERE domain IN (SELECT d.domain FROM domains d JOIN project_companies pc ON pc.company_id = d.company_id WHERE pc.project_id = ?)`, projectId)!.n
    : get(`SELECT COUNT(*) AS n FROM pages`)!.n;
  const emails = projectId
    ? get(`SELECT COUNT(*) AS n FROM contacts ct JOIN project_companies pc ON pc.company_id = ct.company_id WHERE pc.project_id = ? AND ct.kind = 'email' AND ct.status = 'active'`, projectId)!.n
    : get(`SELECT COUNT(*) AS n FROM contacts WHERE kind = 'email' AND status = 'active'`)!.n;
  const jobs = all(
    `SELECT queue, status, COUNT(*) AS n FROM jobs ${projectId ? 'WHERE project_id = ' + Number(projectId) : ''} GROUP BY queue, status`,
  );
  const errors = get(`SELECT COUNT(*) AS n FROM error_log ${projectId ? 'WHERE project_id = ' + Number(projectId) : ''}`)!.n;
  const cost = projectId
    ? get(`SELECT api_cost_usd AS c, budget_limit_usd AS b FROM search_projects WHERE id = ?`, projectId)
    : get(`SELECT SUM(cost_usd) AS c, NULL AS b FROM api_usage`);
  const queries = projectId
    ? get(`SELECT COUNT(*) AS total, SUM(CASE WHEN status != 'pending' THEN 1 ELSE 0 END) AS done FROM discovery_queries WHERE project_id = ?`, projectId)
    : get(`SELECT COUNT(*) AS total, SUM(CASE WHEN status != 'pending' THEN 1 ELSE 0 END) AS done FROM discovery_queries`);
  const crawl = jobs.filter((j) => j.queue === 'crawl');
  const crawlTotal = crawl.filter((j) => j.status !== 'cancelled').reduce((a, j) => a + j.n, 0);
  const crawlDone = crawl.filter((j) => ['done', 'failed'].includes(j.status)).reduce((a, j) => a + j.n, 0);
  return {
    discovered_companies: discovered,
    ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v ?? 0])),
    pages_scanned: pages,
    emails_found: emails,
    error_count: errors,
    api_cost_usd: Math.round((cost?.c ?? 0) * 10000) / 10000,
    budget_limit_usd: cost?.b ?? null,
    queries_total: queries?.total ?? 0,
    queries_done: queries?.done ?? 0,
    scan_progress: crawlTotal ? Math.round((crawlDone / crawlTotal) * 1000) / 10 : 0,
    jobs,
  };
}
