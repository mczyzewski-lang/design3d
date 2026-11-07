// Obsługa poszczególnych typów zadań.

import { get, run, nowIso } from '../db/index.ts';
import { config } from '../config.ts';
import { complete, enqueue, fail, requeueAfterPause, saveProgress, shouldStop, type Job } from './queue.ts';
import { scanCompany, PausedError } from '../crawler/scanCompany.ts';
import { BlockedError, FetchError, RetryLaterError } from '../crawler/http.ts';
import { RobotsDisallowedError } from '../crawler/robots.ts';
import { getProject, canSpend, recordUsage, logError, projectCompanyCount, setProjectStatus } from '../projects/projects.ts';
import { analyzeWithAi, aiConfigured, buildAiInput, estimateCostUsd, isPermanentAiError, isRetryableAiError } from '../analysis/ai.ts';
import { applyAnalysis, loadPagesForCompany } from '../analysis/service.ts';
import { getProvider, ProviderError } from '../discovery/providers.ts';
import { isLikelyCompanySite, pickOfficialSite } from '../discovery/officialSite.ts';
import { attachDomain, findOrCreateByDomain, getCompany, resolveCompanyId } from '../companies/repo.ts';
import { registrableDomain } from '../util/domain.ts';

export type Handler = (job: Job) => Promise<void>;

function setScanStatus(companyId: number, status: string, error: string | null, review = false): void {
  run(
    `UPDATE companies SET scan_status = ?, scan_error = ?, last_scanned_at = ?, needs_review = CASE WHEN ? THEN 1 ELSE needs_review END, updated_at = ? WHERE id = ?`,
    status, error, nowIso(), review, nowIso(), resolveCompanyId(companyId),
  );
}

// ---------------- skanowanie ----------------
const scanHandler: Handler = async (job) => {
  const companyId = job.company_id!;
  const project = job.project_id ? getProject(job.project_id) : null;
  const maxPages = Number(job.payload.maxPages ?? project?.max_pages_per_company ?? 8);
  try {
    const r = await scanCompany(companyId, {
      maxPages,
      force: !!job.payload.force,
      startUrl: job.payload.url ?? null,
      projectId: job.project_id,
      shouldStop: () => shouldStop(job),
      onProgress: (p) => saveProgress(job.id, { ...p, visited: p.visited.slice(-30) }),
    });
    complete(job.id, { status: r.status, pagesVisited: r.pagesVisited, pagesFetched: r.pagesFetched, emails: r.emails, primaryEmail: r.primaryEmail, contactStatus: r.contactStatus, rendered: r.rendered });
    if (r.status === 'done' && project?.ai_enabled && aiConfigured()) {
      enqueue({ queue: 'analysis', type: 'analyze_company', projectId: job.project_id, companyId: r.companyId });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof PausedError) {
      requeueAfterPause(job);
      run(`UPDATE companies SET scan_status = 'pending', updated_at = ? WHERE id = ? AND scan_status = 'scanning'`, nowIso(), resolveCompanyId(companyId));
      return;
    }
    const url = (e as any)?.url ?? null;
    if (e instanceof BlockedError) {
      setScanStatus(companyId, 'blocked', msg, true);
      fail(job, msg, { permanent: true });
      logError({ jobId: job.id, projectId: job.project_id, companyId, scope: 'crawl', message: msg, url });
      return;
    }
    if (e instanceof RobotsDisallowedError) {
      setScanStatus(companyId, 'robots_disallowed', msg);
      fail(job, msg, { permanent: true });
      return;
    }
    const permanent = e instanceof FetchError && !!e.status && [404, 410, 401, 403].includes(e.status);
    const outcome = fail(job, msg, { permanent, retryInMs: e instanceof RetryLaterError ? e.delayMs : undefined });
    logError({ jobId: job.id, projectId: job.project_id, companyId, scope: 'crawl', message: `${outcome === 'retry' ? '[ponowienie] ' : ''}${msg}`, url });
    if (outcome === 'failed') {
      setScanStatus(companyId, 'error', msg, true);
      run(`UPDATE domains SET alive = 0, last_fetched_at = ? WHERE company_id = ? AND alive IS NULL`, nowIso(), resolveCompanyId(companyId));
    } else {
      run(`UPDATE companies SET scan_status = 'pending', scan_error = ?, updated_at = ? WHERE id = ?`, msg, nowIso(), resolveCompanyId(companyId));
    }
  }
};

// ---------------- analiza AI ----------------
const analyzeHandler: Handler = async (job) => {
  const companyId = resolveCompanyId(job.company_id!);
  const company = getCompany(companyId);
  if (!company || company.objection_status === 'objected') return complete(job.id, { skipped: 'brak firmy lub sprzeciw' });
  const pages = loadPagesForCompany(companyId);
  if (!pages.length) return complete(job.id, { skipped: 'brak zeskanowanych stron' });
  if (!aiConfigured()) return complete(job.id, { skipped: 'brak ANTHROPIC_API_KEY' });
  const estimate = estimateCostUsd(buildAiInput(company.name, pages).length);
  if (!job.project_id || !canSpend(job.project_id, estimate)) {
    return complete(job.id, { skipped: `budżet nie pozwala (szac. $${estimate.toFixed(4)})` });
  }
  try {
    const r = await analyzeWithAi(company.name, pages);
    recordUsage({ projectId: job.project_id, provider: 'anthropic', costUsd: r.costUsd, inputTokens: r.inputTokens, outputTokens: r.outputTokens });
    const score = applyAnalysis(companyId, r.analysis, 'ai', { model: r.model });
    complete(job.id, { score, costUsd: r.costUsd, category: r.analysis.category });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const outcome = fail(job, msg, { permanent: isPermanentAiError(e) || (!isRetryableAiError(e) && job.attempts >= 2) });
    logError({ jobId: job.id, projectId: job.project_id, companyId, scope: 'analysis', message: msg });
    if (outcome === 'failed') run(`UPDATE companies SET needs_review = 1 WHERE id = ?`, companyId);
  }
};

// ---------------- discovery ----------------
const discoverHandler: Handler = async (job) => {
  const project = getProject(job.project_id!);
  const qrow = get(`SELECT * FROM discovery_queries WHERE id = ?`, job.payload.queryId);
  if (!project || !qrow) return complete(job.id, { skipped: 'brak projektu/zapytania' });
  const provider = getProvider(project.discovery_provider);
  const markQuery = (status: string, extra: { results?: number; created?: number; cost?: number; error?: string } = {}) =>
    run(
      `UPDATE discovery_queries SET status = ?, results_count = ?, new_companies = ?, cost_usd = ?, error = ?, executed_at = ? WHERE id = ?`,
      status, extra.results ?? null, extra.created ?? null, extra.cost ?? 0, extra.error ?? null, nowIso(), qrow.id,
    );
  if (!provider || !provider.configured()) {
    markQuery('skipped', { error: 'Dostawca wyszukiwania nie jest skonfigurowany' });
    return complete(job.id, { skipped: 'provider' });
  }
  if (projectCompanyCount(project.id) >= project.max_companies) {
    markQuery('skipped', { error: 'Osiągnięto maksymalną liczbę firm' });
    return complete(job.id, { skipped: 'max_companies' });
  }
  const cost = provider.costPerQuery();
  if (!canSpend(project.id, cost)) {
    markQuery('skipped', { error: 'Limit budżetu API wyczerpany lub nieustawiony' });
    return complete(job.id, { skipped: 'budget' });
  }
  try {
    const results = await provider.search(qrow.query, qrow.page);
    recordUsage({ projectId: project.id, provider: provider.key, costUsd: cost });
    let created = 0;
    let candidates = 0;
    for (const r of results) {
      if (!isLikelyCompanySite(r.url)) continue;
      const domain = registrableDomain(r.url);
      if (!domain) continue;
      candidates++;
      if (projectCompanyCount(project.id) >= project.max_companies) break;
      const origin = new URL(r.url).origin + '/';
      const res = findOrCreateByDomain({
        domain, url: origin, name: null, projectId: project.id, via: 'search',
        source: { kind: 'search_result', provider: provider.key, url: r.url, title: r.title, snippet: r.snippet, query: qrow.query },
      });
      if (!res) continue;
      if (res.created) created++;
      if (res.created || res.linked) enqueue({ queue: 'crawl', type: 'scan_company', projectId: project.id, companyId: res.companyId, payload: { url: origin } });
    }
    markQuery('done', { results: results.length, created, cost });
    // kolejna strona wyników, jeśli zapytanie wciąż przynosi nowe firmy
    if (results.length >= 8 && candidates > 0 && created / candidates >= 0.3 && qrow.page < 4) {
      const ins = run(
        `INSERT OR IGNORE INTO discovery_queries (project_id, query, page, provider) VALUES (?, ?, ?, ?)`,
        project.id, qrow.query, qrow.page + 1, provider.key,
      );
      if (ins.changes) enqueue({ queue: 'discovery', type: 'discover_query', projectId: project.id, payload: { queryId: ins.lastInsertRowid }, priority: -qrow.page - 1 });
    }
    complete(job.id, { results: results.length, created });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const permanent = e instanceof ProviderError && [400, 401, 403].includes(e.status);
    const outcome = fail(job, msg, { permanent });
    logError({ jobId: job.id, projectId: project.id, scope: 'discovery', message: msg });
    if (outcome === 'failed') markQuery('error', { error: msg });
    if (e instanceof ProviderError && [401, 403].includes(e.status)) {
      setProjectStatus(project.id, 'paused');
      logError({ projectId: project.id, scope: 'discovery', message: 'Projekt wstrzymany: klucz API odrzucony przez dostawcę' });
    }
  }
};

// ---------------- ustalanie strony dla firmy z samą nazwą ----------------
const resolveHandler: Handler = async (job) => {
  const project = getProject(job.project_id!);
  const companyId = resolveCompanyId(job.company_id!);
  const company = getCompany(companyId);
  const provider = getProvider(project?.discovery_provider);
  if (!project || !company || !provider?.configured()) return complete(job.id, { skipped: 'brak dostawcy' });
  if (company.primary_domain) return complete(job.id, { skipped: 'strona już znana' });
  const cost = provider.costPerQuery();
  if (!canSpend(project.id, cost)) return complete(job.id, { skipped: 'budżet' });
  const q = `${company.name}${company.city ? ' ' + company.city : ''}`;
  try {
    const results = await provider.search(q, 0);
    recordUsage({ projectId: project.id, provider: provider.key, costUsd: cost });
    const site = pickOfficialSite(company.name, results);
    if (!site) {
      run(`UPDATE companies SET scan_status = 'no_website', scan_error = 'Nie znaleziono oficjalnej strony', needs_review = 1 WHERE id = ?`, companyId);
      return complete(job.id, { found: null });
    }
    const domain = registrableDomain(site)!;
    const id = attachDomain(companyId, domain, site);
    run(`UPDATE domains SET is_primary = 1 WHERE domain = ?`, domain);
    run(`UPDATE companies SET website_url = COALESCE(website_url, ?), primary_domain = COALESCE(primary_domain, ?), scan_status = 'pending', scan_error = NULL WHERE id = ?`, site, domain, id);
    enqueue({ queue: 'crawl', type: 'scan_company', projectId: project.id, companyId: id, payload: { url: site } });
    complete(job.id, { found: site });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fail(job, msg);
    logError({ jobId: job.id, projectId: project.id, companyId, scope: 'discovery', message: msg });
  }
};

export const HANDLERS: Record<string, Handler> = {
  scan_company: scanHandler,
  analyze_company: analyzeHandler,
  discover_query: discoverHandler,
  resolve_website: resolveHandler,
};

export const QUEUE_CONCURRENCY = () => ({
  crawl: config.crawlConcurrency,
  analysis: config.aiConcurrency,
  discovery: 1,
});
