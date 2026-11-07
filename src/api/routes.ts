// REST API panelu Lead Discovery.

import express, { type Request, type Response, type NextFunction } from 'express';
import { all, get } from '../db/index.ts';
import { config } from '../config.ts';
import { createProject, getProject, projectView, stats, TEMPLATES, updateProject, generateQueries } from '../projects/projects.ts';
import { startProject, pauseProject, resumeProject, stopProject, ensureRunningForImport } from '../projects/lifecycle.ts';
import { importCsv } from '../discovery/csvImport.ts';
import { listCompanies, companyDetail, type CompanyFilter } from '../companies/query.ts';
import { exportRows, toCsv, toXlsx } from '../export/export.ts';
import { cancelJob, enqueue, pauseJob, resumeJob, retryJob } from '../queue/queue.ts';
import { eraseCompany, informationClause, objectCompany, privacyLog, setMarketingConsent } from '../privacy/privacy.ts';
import { getCompany, resolveCompanyId } from '../companies/repo.ts';
import { PROVIDERS } from '../discovery/providers.ts';
import { aiConfigured } from '../analysis/ai.ts';
import { renderingAvailable } from '../crawler/render.ts';
import { runHeuristic } from '../analysis/service.ts';
import { CATEGORY_LABELS } from '../analysis/types.ts';
import { CATEGORY_LABELS as EMAIL_CATEGORY_LABELS } from '../crawler/emails.ts';
import { VOIVODESHIPS } from '../util/polish.ts';

const wrap = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => {
  try {
    const r = fn(req, res);
    if (r instanceof Promise) r.catch(next);
  } catch (e) {
    next(e);
  }
};

const int = (v: unknown): number | undefined => (v === undefined || v === '' ? undefined : Number(v));

function filterFrom(q: Record<string, any>): CompanyFilter {
  return {
    search: q.search || undefined,
    projectId: int(q.projectId),
    category: q.category || undefined,
    contact: q.contact || undefined,
    scanStatus: q.scanStatus || undefined,
    minScore: int(q.minScore),
    maxScore: int(q.maxScore),
    voivodeship: q.voivodeship || undefined,
    hasConfigurator: q.hasConfigurator || undefined,
    needsReview: q.needsReview || undefined,
    includeObjected: q.includeObjected === '1',
    sort: q.sort || undefined,
    dir: q.dir === 'asc' ? 'asc' : 'desc',
    page: int(q.page),
    pageSize: int(q.pageSize),
  };
}

export function apiRouter(): express.Router {
  const r = express.Router();
  r.use(express.json({ limit: '2mb' }));
  r.use(express.text({ type: ['text/csv', 'text/plain'], limit: '20mb' }));

  r.get('/meta', (_req, res) => {
    res.json({
      providers: Object.values(PROVIDERS).map((p) => ({ key: p.key, label: p.label, configured: p.configured(), costPerQuery: p.costPerQuery() })),
      ai: { configured: aiConfigured(), model: config.anthropicModel },
      rendering: renderingAvailable(),
      templates: TEMPLATES,
      categories: CATEGORY_LABELS,
      emailCategories: EMAIL_CATEGORY_LABELS,
      voivodeships: VOIVODESHIPS,
      userAgent: config.userAgent,
      retentionDays: config.retentionDays,
      reverifyDays: config.reverifyDays,
    });
  });

  r.get('/stats', (req, res) => res.json(stats(int(req.query.projectId))));

  // ---- projekty ----
  r.get('/projects', (_req, res) => {
    const rows = all(`SELECT * FROM search_projects ORDER BY id DESC`).map((p) => ({ ...projectView(p), stats: stats(p.id) }));
    res.json(rows);
  });
  r.post('/projects', wrap((req, res) => {
    const b = req.body ?? {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'Podaj nazwę projektu' });
    const id = createProject(b);
    res.status(201).json(projectView(getProject(id)!));
  }));
  r.get('/projects/:id', (req, res) => {
    const p = getProject(Number(req.params.id));
    if (!p) return res.status(404).json({ error: 'Nie znaleziono' });
    const v = projectView(p);
    res.json({
      ...v,
      stats: stats(p.id),
      plannedQueries: generateQueries(v.keywords, v.cityKeywords, v.cities).length,
      queries: all(`SELECT * FROM discovery_queries WHERE project_id = ? ORDER BY id DESC LIMIT 50`, p.id),
      recentErrors: all(`SELECT * FROM error_log WHERE project_id = ? ORDER BY id DESC LIMIT 30`, p.id),
      activeJobs: all(
        `SELECT j.id, j.type, j.status, j.progress, j.attempts, j.last_error, c.name AS company_name, c.primary_domain
         FROM jobs j LEFT JOIN companies c ON c.id = j.company_id WHERE j.project_id = ? AND j.status = 'running' ORDER BY j.id LIMIT 30`,
        p.id,
      ),
    });
  });
  r.patch('/projects/:id', wrap((req, res) => {
    updateProject(Number(req.params.id), req.body ?? {});
    res.json(projectView(getProject(Number(req.params.id))!));
  }));
  r.post('/projects/:id/start', wrap((req, res) => res.json(startProject(Number(req.params.id)))));
  r.post('/projects/:id/pause', wrap((req, res) => {
    pauseProject(Number(req.params.id));
    res.json({ ok: true });
  }));
  r.post('/projects/:id/resume', wrap((req, res) => {
    resumeProject(Number(req.params.id));
    res.json({ ok: true });
  }));
  r.post('/projects/:id/stop', wrap((req, res) => res.json({ cancelled: stopProject(Number(req.params.id)) })));
  r.post('/projects/:id/import', wrap((req, res) => {
    const id = Number(req.params.id);
    const text = typeof req.body === 'string' ? req.body : req.body?.csv;
    if (!text) return res.status(400).json({ error: 'Brak treści CSV' });
    const summary = importCsv(id, text);
    ensureRunningForImport(id);
    res.json(summary);
  }));

  // ---- firmy ----
  r.get('/companies', (req, res) => res.json(listCompanies(filterFrom(req.query))));
  r.get('/companies/:id', (req, res) => {
    const id = resolveCompanyId(Number(req.params.id));
    const d = companyDetail(id);
    if (!d) return res.status(404).json({ error: 'Nie znaleziono' });
    res.json(d);
  });
  r.post('/companies/:id/rescan', wrap((req, res) => {
    const c = getCompany(Number(req.params.id));
    if (!c) return res.status(404).json({ error: 'Nie znaleziono' });
    if (c.objection_status === 'objected') return res.status(409).json({ error: 'Firma zgłosiła sprzeciw — skanowanie zablokowane' });
    const pc = get(`SELECT project_id FROM project_companies WHERE company_id = ? ORDER BY created_at DESC LIMIT 1`, c.id);
    const project = pc ? getProject(pc.project_id) : null;
    const id = enqueue({
      queue: 'crawl', type: 'scan_company', companyId: c.id, priority: 10,
      projectId: project && project.status === 'running' ? project.id : null,
      payload: { force: req.body?.force !== false, maxPages: project?.max_pages_per_company ?? 8 },
    });
    res.json({ jobId: id });
  }));
  r.post('/companies/:id/reanalyze', wrap((req, res) => {
    const c = getCompany(Number(req.params.id));
    if (!c) return res.status(404).json({ error: 'Nie znaleziono' });
    if (req.body?.ai) {
      const pc = get(`SELECT project_id FROM project_companies WHERE company_id = ? ORDER BY created_at DESC LIMIT 1`, c.id);
      return res.json({ jobId: enqueue({ queue: 'analysis', type: 'analyze_company', companyId: c.id, projectId: pc?.project_id ?? null, priority: 10 }) });
    }
    res.json({ analysis: runHeuristic(c.id) });
  }));
  r.post('/companies/:id/objection', wrap((req, res) => {
    objectCompany(Number(req.params.id), String(req.body?.note ?? ''));
    res.json({ ok: true });
  }));
  r.post('/companies/:id/consent', wrap((req, res) => {
    const status = req.body?.status === 'confirmed' ? 'confirmed' : 'not_confirmed';
    setMarketingConsent(Number(req.params.id), status, String(req.body?.note ?? ''));
    res.json({ ok: true });
  }));
  r.delete('/companies/:id', wrap((req, res) => {
    eraseCompany(Number(req.params.id), 'erasure', true);
    res.json({ ok: true });
  }));

  // ---- zadania ----
  r.get('/jobs', (req, res) => {
    const w: string[] = [];
    const p: any[] = [];
    if (req.query.status) {
      w.push('j.status = ?');
      p.push(req.query.status);
    }
    if (req.query.queue) {
      w.push('j.queue = ?');
      p.push(req.query.queue);
    }
    if (req.query.projectId) {
      w.push('j.project_id = ?');
      p.push(Number(req.query.projectId));
    }
    const limit = Math.min(500, Number(req.query.limit ?? 100));
    res.json(all(
      `SELECT j.*, c.name AS company_name, c.primary_domain FROM jobs j LEFT JOIN companies c ON c.id = j.company_id
       ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY j.updated_at DESC LIMIT ?`,
      ...p, limit,
    ));
  });
  for (const [action, fn] of [['pause', pauseJob], ['resume', resumeJob], ['cancel', cancelJob], ['retry', retryJob]] as const) {
    r.post(`/jobs/:id/${action}`, (req, res) => res.json({ ok: fn(Number(req.params.id)) }));
  }
  r.get('/errors', (req, res) => {
    res.json(all(
      `SELECT e.*, c.name AS company_name, c.primary_domain FROM error_log e LEFT JOIN companies c ON c.id = e.company_id
       ${req.query.projectId ? 'WHERE e.project_id = ' + Number(req.query.projectId) : ''} ORDER BY e.id DESC LIMIT 200`,
    ));
  });

  // ---- eksport ----
  r.get('/export.csv', (req, res) => {
    const rows = exportRows({ ...filterFrom(req.query), page: undefined, pageSize: undefined });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lead-discovery-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(toCsv(rows));
  });
  r.get('/export.xlsx', wrap(async (req, res) => {
    const rows = exportRows({ ...filterFrom(req.query), page: undefined, pageSize: undefined });
    const buf = await toXlsx(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="lead-discovery-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buf);
  }));

  // ---- RODO ----
  r.get('/privacy/clause', (_req, res) => res.type('text/plain; charset=utf-8').send(informationClause()));
  r.get('/privacy/log', (_req, res) => res.json(privacyLog()));
  r.get('/privacy/summary', (_req, res) => res.json({
    suppressions: all(`SELECT kind, reason, COUNT(*) AS n FROM suppressions GROUP BY kind, reason`),
    objected: get(`SELECT COUNT(*) AS n FROM companies WHERE objection_status = 'objected'`)!.n,
    personalContacts: get(`SELECT COUNT(*) AS n FROM contacts WHERE is_personal = 1`)!.n,
    retentionDays: config.retentionDays,
  }));

  r.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api]', err);
    res.status(500).json({ error: err.message });
  });
  return r;
}
