// Pule workerów per kolejka (osobna kolejka dla crawl, discovery i analizy AI).

import crypto from 'node:crypto';
import { claim, fail, recoverStale, type QueueName } from './queue.ts';
import { HANDLERS, QUEUE_CONCURRENCY } from './handlers.ts';
import { logError } from '../projects/projects.ts';
import { get } from '../db/index.ts';

const instance = crypto.randomBytes(3).toString('hex');
let running = false;
const loops: Promise<void>[] = [];
let active = 0;

async function loop(queue: QueueName, slot: number): Promise<void> {
  const id = `${instance}:${queue}:${slot}`;
  while (running) {
    const job = claim(queue, id);
    if (!job) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    active++;
    try {
      const h = HANDLERS[job.type];
      if (!h) fail(job, `Nieznany typ zadania ${job.type}`, { permanent: true });
      else await h(job);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fail(job, msg);
      logError({ jobId: job.id, projectId: job.project_id, companyId: job.company_id, scope: 'system', message: msg });
    } finally {
      active--;
    }
  }
}

export function startWorkers(): void {
  if (running) return;
  running = true;
  const n = recoverStale();
  if (n) console.log(`[queue] Przywrócono ${n} przerwanych zadań`);
  for (const [queue, conc] of Object.entries(QUEUE_CONCURRENCY())) {
    for (let i = 0; i < conc; i++) loops.push(loop(queue as QueueName, i));
  }
}

export async function stopWorkers(): Promise<void> {
  running = false;
  await Promise.all(loops.splice(0));
}

export function workersRunning(): boolean {
  return running;
}

/** Testy/CLI: czekaj aż kolejki się opróżnią (lub upłynie limit czasu). */
export async function drain(timeoutMs = 60_000, opts: { includeDelayed?: boolean } = {}): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // includeDelayed: czekaj także na zadania zaplanowane do ponowienia (backoff)
    const horizon = opts.includeDelayed ? '9999-12-31' : new Date().toISOString();
    const pending = get(
      `SELECT COUNT(*) AS n FROM jobs j LEFT JOIN search_projects p ON p.id = j.project_id
       WHERE (j.status = 'running') OR (j.status = 'queued' AND j.run_after <= ? AND (j.project_id IS NULL OR p.status = 'running'))`,
      horizon,
    )!.n;
    if (pending === 0 && active === 0) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('drain: przekroczono limit czasu');
}
