// Start / pauza / wznowienie / zakończenie projektu.

import { all, get, run, nowIso, parseJson } from '../db/index.ts';
import { enqueue } from '../queue/queue.ts';
import { generateQueries, getProject, setProjectStatus } from './projects.ts';
import { getProvider } from '../discovery/providers.ts';

export interface StartSummary {
  queries: number;
  scansQueued: number;
  warnings: string[];
}

export function startProject(id: number): StartSummary {
  const p = getProject(id);
  if (!p) throw new Error('Projekt nie istnieje');
  const warnings: string[] = [];
  let queries = 0;
  const provider = getProvider(p.discovery_provider);
  if (p.discovery_provider !== 'none') {
    if (!provider?.configured()) warnings.push(`Dostawca "${p.discovery_provider}" nie ma klucza API w zmiennych środowiskowych — wyszukiwanie pominięte. Możesz zaimportować CSV.`);
    else if (p.budget_limit_usd <= 0) warnings.push('Nie ustawiono limitu budżetu API — płatne wyszukiwanie nie zostanie uruchomione.');
    else {
      const kw = parseJson<any>(p.keywords, {});
      const list = generateQueries(kw.keywords ?? [], kw.cityKeywords ?? [], parseJson(p.cities, []));
      const maxQueries = Math.floor(p.budget_limit_usd / Math.max(provider.costPerQuery(), 1e-6));
      if (list.length > maxQueries) warnings.push(`Budżet pozwala na ok. ${maxQueries} z ${list.length} zapytań — pozostałe zostaną pominięte po wyczerpaniu limitu.`);
      list.forEach((q, i) => {
        const ins = run(`INSERT OR IGNORE INTO discovery_queries (project_id, query, page, provider) VALUES (?, ?, 0, ?)`, id, q, provider.key);
        if (ins.changes) {
          enqueue({ queue: 'discovery', type: 'discover_query', projectId: id, payload: { queryId: ins.lastInsertRowid }, priority: -Math.floor(i / 20) });
          queries++;
        }
      });
    }
  }
  // firmy przypisane do projektu, które nie mają jeszcze skanu
  let scansQueued = 0;
  for (const c of all(
    `SELECT c.id, c.website_url FROM companies c JOIN project_companies pc ON pc.company_id = c.id
     WHERE pc.project_id = ? AND c.merged_into_id IS NULL AND c.scan_status IN ('pending','error') AND c.primary_domain IS NOT NULL`,
    id,
  )) {
    if (enqueue({ queue: 'crawl', type: 'scan_company', projectId: id, companyId: c.id, payload: { url: c.website_url } })) scansQueued++;
  }
  setProjectStatus(id, 'running');
  return { queries, scansQueued, warnings };
}

export function pauseProject(id: number): void {
  setProjectStatus(id, 'paused');
}

export function resumeProject(id: number): void {
  // zadania wstrzymane ręcznie pozostają wstrzymane; pozostałe wracają do pracy
  setProjectStatus(id, 'running');
}

/** Zakończenie: anuluje oczekujące zadania. Zebrane wyniki pozostają. */
export function stopProject(id: number): number {
  const n = run(`UPDATE jobs SET status = 'cancelled', finished_at = ?, updated_at = ? WHERE project_id = ? AND status IN ('queued','paused')`, nowIso(), nowIso(), id).changes;
  setProjectStatus(id, 'stopped');
  return n;
}

export function ensureRunningForImport(id: number): void {
  const p = get(`SELECT status FROM search_projects WHERE id = ?`, id);
  if (p && ['completed', 'stopped'].includes(p.status)) setProjectStatus(id, 'running'); // szkic czeka na „Rozpocznij”
}
