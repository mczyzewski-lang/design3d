// Harmonogram: ponowna weryfikacja kontaktów, retencja danych, zamykanie ukończonych projektów.

import { all, get, run, nowIso } from '../db/index.ts';
import { config } from '../config.ts';
import { enqueue } from './queue.ts';
import { setProjectStatus } from '../projects/projects.ts';
import { eraseCompany } from '../privacy/privacy.ts';

let timer: NodeJS.Timeout | null = null;
let lastRetention = 0;

export function completeFinishedProjects(): void {
  for (const p of all(`SELECT id FROM search_projects WHERE status = 'running'`)) {
    const open = get(`SELECT COUNT(*) AS n FROM jobs WHERE project_id = ? AND status IN ('queued','running','paused')`, p.id)!.n;
    if (open === 0) setProjectStatus(p.id, 'completed');
  }
}

/** Kontakty starsze niż REVERIFY_DAYS trafiają ponownie do kolejki (z wymuszeniem pobrania). */
export function scheduleReverification(limit = 200): number {
  const due = all(
    `SELECT id FROM companies WHERE merged_into_id IS NULL AND objection_status = 'none' AND scan_status = 'done'
       AND next_reverify_at IS NOT NULL AND next_reverify_at <= ? ORDER BY next_reverify_at LIMIT ?`,
    nowIso(), limit,
  );
  let n = 0;
  for (const c of due) {
    if (enqueue({ queue: 'crawl', type: 'scan_company', companyId: c.id, payload: { force: true, reverify: true }, priority: -10 })) n++;
    run(`UPDATE companies SET next_reverify_at = ? WHERE id = ?`, new Date(Date.now() + config.reverifyDays * 86400_000).toISOString(), c.id);
  }
  return n;
}

/** RODO: usuwa dane firm niezweryfikowanych od RETENTION_DAYS. */
export function applyRetention(): number {
  const cutoff = new Date(Date.now() - config.retentionDays * 86400_000).toISOString();
  const old = all(`SELECT id FROM companies WHERE merged_into_id IS NULL AND COALESCE(last_scanned_at, created_at) < ?`, cutoff);
  for (const c of old) eraseCompany(c.id, 'retention_purge', false);
  // logi błędów i zużycia starsze niż rok
  run(`DELETE FROM error_log WHERE created_at < ?`, new Date(Date.now() - 365 * 86400_000).toISOString());
  return old.length;
}

export function tick(): void {
  try {
    completeFinishedProjects();
    scheduleReverification();
    if (Date.now() - lastRetention > 24 * 3600_000) {
      lastRetention = Date.now();
      const n = applyRetention();
      if (n) console.log(`[retencja] Usunięto ${n} przeterminowanych rekordów`);
    }
  } catch (e) {
    console.error('[scheduler]', e);
  }
}

export function startScheduler(intervalMs = 30_000): void {
  if (timer) return;
  timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
