// Trwała kolejka zadań w SQLite. Stan przeżywa restart procesu.
// Wstrzymanie projektu = jego zadania nie są pobierane; uruchomione zadania kończą się na najbliższym punkcie kontrolnym.

import { all, get, run, nowIso, json, parseJson, type Row } from '../db/index.ts';

export type QueueName = 'discovery' | 'crawl' | 'analysis';
export type JobType = 'discover_query' | 'resolve_website' | 'scan_company' | 'analyze_company';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'paused' | 'cancelled';

export interface Job {
  id: number;
  queue: QueueName;
  type: JobType;
  project_id: number | null;
  company_id: number | null;
  payload: Record<string, any>;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  run_after: string;
  progress: Record<string, any> | null;
  last_error: string | null;
}

function toJob(r: Row): Job {
  return { ...(r as any), payload: parseJson(r.payload, {}), progress: parseJson(r.progress, null) };
}

export function enqueue(opts: {
  queue: QueueName;
  type: JobType;
  projectId?: number | null;
  companyId?: number | null;
  payload?: Record<string, any>;
  priority?: number;
  maxAttempts?: number;
  runAfter?: Date;
  /** nie twórz duplikatu, jeśli istnieje aktywne zadanie tego typu dla tej firmy/zapytania */
  unique?: boolean;
}): number | null {
  if (opts.unique !== false && opts.companyId) {
    const existing = get(
      `SELECT id FROM jobs WHERE type = ? AND company_id = ? AND status IN ('queued','running','paused') LIMIT 1`,
      opts.type, opts.companyId,
    );
    if (existing) return null;
  }
  const r = run(
    `INSERT INTO jobs (queue, type, project_id, company_id, payload, priority, max_attempts, run_after)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    opts.queue, opts.type, opts.projectId ?? null, opts.companyId ?? null, json(opts.payload ?? {}),
    opts.priority ?? 0, opts.maxAttempts ?? 4, (opts.runAfter ?? new Date()).toISOString(),
  );
  return r.lastInsertRowid;
}

/** Atomowo pobiera następne zadanie (pomija zadania wstrzymanych projektów). */
export function claim(queue: QueueName, workerId: string): Job | null {
  const now = nowIso();
  const row = get(
    `UPDATE jobs SET status = 'running', locked_at = ?, locked_by = ?, attempts = attempts + 1, updated_at = ?
     WHERE id = (
       SELECT j.id FROM jobs j LEFT JOIN search_projects p ON p.id = j.project_id
       WHERE j.queue = ? AND j.status = 'queued' AND j.run_after <= ?
         AND (j.project_id IS NULL OR p.status = 'running')
       ORDER BY j.priority DESC, j.id ASC LIMIT 1
     ) RETURNING *`,
    now, workerId, now, queue, now,
  );
  return row ? toJob(row) : null;
}

export function complete(id: number, progress?: Record<string, any>): void {
  run(
    `UPDATE jobs SET status = 'done', finished_at = ?, updated_at = ?, locked_at = NULL, locked_by = NULL,
       progress = COALESCE(?, progress), last_error = NULL WHERE id = ? AND status IN ('running','paused')`,
    nowIso(), nowIso(), progress ? json(progress) : null, id,
  );
}

export function backoffMs(attempts: number): number {
  return Math.min(6 * 3600_000, 30_000 * 2 ** Math.max(0, attempts - 1)) * (0.8 + Math.random() * 0.4);
}

/** Błąd: ponowienie z exponential backoff albo oznaczenie jako nieudane. */
export function fail(job: Job, error: string, opts: { retryInMs?: number; permanent?: boolean } = {}): 'retry' | 'failed' {
  const cur = get(`SELECT status, attempts, max_attempts FROM jobs WHERE id = ?`, job.id);
  if (!cur) return 'failed';
  if (cur.status !== 'running') return 'failed'; // wstrzymane/anulowane w trakcie
  const canRetry = !opts.permanent && cur.attempts < cur.max_attempts;
  if (canRetry) {
    const delay = opts.retryInMs ?? backoffMs(cur.attempts);
    run(
      `UPDATE jobs SET status = 'queued', run_after = ?, last_error = ?, locked_at = NULL, locked_by = NULL, updated_at = ? WHERE id = ?`,
      new Date(Date.now() + delay).toISOString(), error.slice(0, 1000), nowIso(), job.id,
    );
    return 'retry';
  }
  run(
    `UPDATE jobs SET status = 'failed', last_error = ?, finished_at = ?, locked_at = NULL, locked_by = NULL, updated_at = ? WHERE id = ?`,
    error.slice(0, 1000), nowIso(), nowIso(), job.id,
  );
  return 'failed';
}

/** Zadanie przerwane przez pauzę — wraca do kolejki bez zużycia próby. */
export function requeueAfterPause(job: Job, progress?: Record<string, any>): void {
  run(
    `UPDATE jobs SET status = CASE WHEN status = 'paused' THEN 'paused' ELSE 'queued' END,
       attempts = MAX(0, attempts - 1), locked_at = NULL, locked_by = NULL, updated_at = ?,
       progress = COALESCE(?, progress) WHERE id = ?`,
    nowIso(), progress ? json(progress) : null, job.id,
  );
}

export function saveProgress(id: number, progress: Record<string, any>): void {
  run(`UPDATE jobs SET progress = ?, updated_at = ? WHERE id = ?`, json(progress), nowIso(), id);
}

export function jobStatus(id: number): JobStatus | null {
  return (get(`SELECT status FROM jobs WHERE id = ?`, id)?.status as JobStatus) ?? null;
}

/** Czy uruchomione zadanie powinno się zatrzymać (pauza zadania lub projektu). */
export function shouldStop(job: Job): boolean {
  const r = get(
    `SELECT j.status AS js, p.status AS ps FROM jobs j LEFT JOIN search_projects p ON p.id = j.project_id WHERE j.id = ?`,
    job.id,
  );
  if (!r) return true;
  if (r.js !== 'running') return true;
  if (job.project_id && r.ps !== 'running') return true;
  return false;
}

export function pauseJob(id: number): boolean {
  return run(`UPDATE jobs SET status = 'paused', updated_at = ? WHERE id = ? AND status IN ('queued','running')`, nowIso(), id).changes > 0;
}
export function resumeJob(id: number): boolean {
  return run(
    `UPDATE jobs SET status = 'queued', run_after = ?, updated_at = ? WHERE id = ? AND status = 'paused' AND locked_at IS NULL`,
    nowIso(), nowIso(), id,
  ).changes > 0;
}
export function cancelJob(id: number): boolean {
  return run(`UPDATE jobs SET status = 'cancelled', finished_at = ?, updated_at = ? WHERE id = ? AND status IN ('queued','paused','running')`, nowIso(), nowIso(), id).changes > 0;
}
export function retryJob(id: number): boolean {
  return run(
    `UPDATE jobs SET status = 'queued', attempts = 0, run_after = ?, last_error = NULL, finished_at = NULL, updated_at = ? WHERE id = ? AND status IN ('failed','cancelled','done')`,
    nowIso(), nowIso(), id,
  ).changes > 0;
}

/** Po restarcie: zadania „running” bez żywego workera wracają do kolejki. */
export function recoverStale(maxAgeMs = 0): number {
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
  return run(
    `UPDATE jobs SET status = 'queued', locked_at = NULL, locked_by = NULL, attempts = MAX(0, attempts - 1), updated_at = ?
     WHERE status = 'running' AND (locked_at IS NULL OR locked_at <= ?)`,
    nowIso(), cutoff,
  ).changes;
}

export function queueCounts(projectId?: number): Row[] {
  return projectId
    ? all(`SELECT queue, status, COUNT(*) AS n FROM jobs WHERE project_id = ? GROUP BY queue, status`, projectId)
    : all(`SELECT queue, status, COUNT(*) AS n FROM jobs GROUP BY queue, status`);
}
