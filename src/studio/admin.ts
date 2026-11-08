// Analityka Stair Studio dla panelu administracyjnego (/api/admin/studio, za adminAuth).
// Liczby z tabel projektów, firm, zgłoszeń i anonimowych zdarzeń — bez danych o ruchu z zewnętrznych narzędzi.

import express from 'express';
import { all, get, run } from '../db/index.ts';
import { SEARCH_RADIUS_KM, ensureStudioSchema, nearbyContractors } from './routes.ts';
import { geocodePostal } from './geo/postal.ts';

const DAY = 86400_000;

/** Kanał pozyskania: „share_link” z doprecyzowaniem e-mail/SMS/link, pozostałe źródła bez zmian. */
const channel = (source: string | null, via: string | null) =>
  source === 'share_link' ? `link udostępnienia (${via === 'email' ? 'e-mail' : via === 'sms' ? 'SMS' : 'skopiowany link'})` : source || 'bezpośrednio / nieznane';

export function studioAdminRouter(): express.Router {
  ensureStudioSchema();
  const r = express.Router();
  r.use(express.json({ limit: '20kb' }));
  r.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  r.get('/stats', (req, res) => {
    const days = Math.min(365, Math.max(7, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * DAY).toISOString();
    const count = (sql: string, ...p: Array<string | number>) => (get(sql, ...p)?.n as number) ?? 0;

    const totals = {
      projects: count(`SELECT COUNT(*) n FROM studio_projects`),
      versions: count(`SELECT COUNT(*) n FROM studio_versions`),
      shared: count(`SELECT COUNT(DISTINCT project_id) n FROM studio_shares`),
      contractors: count(`SELECT COUNT(*) n FROM studio_contractors`),
      leadsOptIn: count(`SELECT COUNT(*) n FROM studio_contractors WHERE leads_opt_in = 1`),
      comments: count(`SELECT COUNT(*) n FROM studio_comments`),
      quoteRequests: count(`SELECT COUNT(*) n FROM studio_quote_requests`),
      phones: count(`SELECT COUNT(*) n FROM studio_phones`),
      projectsWithPhone: count(`SELECT COUNT(*) n FROM studio_projects WHERE owner_phone IS NOT NULL`),
      fenceWaitInvestors: count(`SELECT COUNT(*) n FROM studio_waitlist WHERE product = 'ogrodzenia' AND kind = 'investor'`),
      fenceWaitContractors: count(`SELECT COUNT(*) n FROM studio_waitlist WHERE product = 'ogrodzenia' AND kind = 'contractor'`),
    };
    const period = {
      projects: count(`SELECT COUNT(*) n FROM studio_projects WHERE created_at >= ?`, since),
      contractors: count(`SELECT COUNT(*) n FROM studio_contractors WHERE created_at >= ?`, since),
      shareViews: count(`SELECT COUNT(*) n FROM studio_events WHERE type = 'share_view' AND detail = 'none' AND created_at >= ?`, since),
      landingVisits: count(`SELECT COUNT(*) n FROM studio_events WHERE type = 'visit' AND page = 'landing' AND created_at >= ?`, since),
      configuratorVisits: count(`SELECT COUNT(*) n FROM studio_events WHERE type = 'visit' AND page = 'configurator' AND created_at >= ?`, since),
      fenceVisits: count(`SELECT COUNT(*) n FROM studio_events WHERE type = 'visit' AND page = 'ogrodzenia' AND created_at >= ?`, since),
      quoteRequests: count(`SELECT COUNT(*) n FROM studio_quote_requests WHERE created_at >= ?`, since),
      comments: count(`SELECT COUNT(*) n FROM studio_comments WHERE created_at >= ?`, since),
    };
    const shareRegs = count(`SELECT COUNT(*) n FROM studio_contractors WHERE source = 'share_link' AND created_at >= ?`, since);

    // seria dzienna
    const series: Array<{ day: string; projects: number; contractors: number; shareViews: number; visits: number }> = [];
    const byDay = (sql: string) => new Map(all(sql, since).map((x) => [x.d as string, x.n as number]));
    const pd = byDay(`SELECT substr(created_at, 1, 10) d, COUNT(*) n FROM studio_projects WHERE created_at >= ? GROUP BY d`);
    const cd = byDay(`SELECT substr(created_at, 1, 10) d, COUNT(*) n FROM studio_contractors WHERE created_at >= ? GROUP BY d`);
    const sd = byDay(`SELECT substr(created_at, 1, 10) d, COUNT(*) n FROM studio_events WHERE type = 'share_view' AND detail = 'none' AND created_at >= ? GROUP BY d`);
    const vd = byDay(`SELECT substr(created_at, 1, 10) d, COUNT(*) n FROM studio_events WHERE type = 'visit' AND created_at >= ? GROUP BY d`);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
      series.push({ day: d, projects: pd.get(d) ?? 0, contractors: cd.get(d) ?? 0, shareViews: sd.get(d) ?? 0, visits: vd.get(d) ?? 0 });
    }

    const projectSources = all(`SELECT COALESCE(source, '') s, COUNT(*) n FROM studio_projects WHERE created_at >= ? GROUP BY s ORDER BY n DESC`, since)
      .map((x) => ({ label: x.s || 'bezpośrednio / nieznane', n: x.n }));
    const contractorSources = all(`SELECT source, via, COUNT(*) n FROM studio_contractors WHERE created_at >= ? GROUP BY source, via ORDER BY n DESC`, since)
      .map((x) => ({ label: channel(x.source, x.via), n: x.n }));
    const shareViewsVia = all(`SELECT COALESCE(via, 'link') v, COUNT(*) n FROM studio_events WHERE type = 'share_view' AND detail = 'none' AND created_at >= ? GROUP BY v ORDER BY n DESC`, since)
      .map((x) => ({ label: x.v === 'email' ? 'e-mail' : x.v === 'sms' ? 'SMS' : 'skopiowany link', n: x.n }));
    const landingShapes = all(`SELECT COALESCE(detail, '?') s, COUNT(*) n FROM studio_events WHERE type = 'landing_shape' AND created_at >= ? GROUP BY s ORDER BY n DESC`, since)
      .map((x) => ({ label: x.s, n: x.n }));

    // układy i konstrukcje w bieżących wersjach projektów
    const shapes = new Map<string, number>();
    const structures = new Map<string, number>();
    for (const v of all(`SELECT v.config FROM studio_projects p JOIN studio_versions v ON v.project_id = p.id AND v.version = p.current_version WHERE p.created_at >= ?`, since)) {
      try {
        const c = JSON.parse(v.config as string);
        const sh = { I: 'proste (I)', L: 'L 90°', U: 'U 180°', S: 'kręcone' }[c?.stairs?.shape as string] ?? '?';
        shapes.set(sh, (shapes.get(sh) ?? 0) + 1);
        const st = c?.stairs?.shape === 'S' ? 'kolumna (kręcone)' : String(c?.structure?.type ?? '?');
        structures.set(st, (structures.get(st) ?? 0) + 1);
      } catch { /* pomijamy uszkodzone */ }
    }
    const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, n }));

    res.json({
      days, totals, period,
      funnel: { shareViews: period.shareViews, registrations: shareRegs, rate: period.shareViews ? shareRegs / period.shareViews : null },
      series, projectSources, contractorSources, shareViewsVia, landingShapes,
      shapes: top(shapes), structures: top(structures),
      recentProjects: all(
        `SELECT p.id, p.name, p.source, p.created_at, p.updated_at, p.current_version,
           (SELECT COUNT(*) FROM studio_versions v WHERE v.project_id = p.id) versions,
           (SELECT COUNT(*) FROM studio_shares s WHERE s.project_id = p.id) shared,
           (SELECT COUNT(*) FROM studio_access a WHERE a.project_id = p.id) contractors,
           (SELECT COUNT(*) FROM studio_comments c WHERE c.project_id = p.id) comments,
           (SELECT COUNT(*) FROM studio_events e WHERE e.project_id = p.id AND e.type = 'share_view' AND e.detail = 'none') views
         FROM studio_projects p ORDER BY p.created_at DESC LIMIT 50`,
      ),
      recentContractors: all(
        `SELECT c.id, c.first_name, c.last_name, c.company_name, c.listed, c.email, c.phone, c.source, c.via, c.created_at, c.leads_opt_in, c.postal_code, c.radius_km,
           p.name project_name, (SELECT COUNT(*) FROM studio_access a WHERE a.contractor_id = c.id) projects
         FROM studio_contractors c LEFT JOIN studio_projects p ON p.id = c.ref_project_id ORDER BY c.created_at DESC LIMIT 50`,
      ).map((c) => ({ ...c, channel: channel(c.source, c.via) })),
      quoteRequests: all(
        `SELECT q.id, q.project_id, p.name project_name, q.name, q.email, q.phone, q.postal_code, q.radius_km, q.status, q.created_at,
           (SELECT token FROM studio_shares s WHERE s.project_id = q.project_id ORDER BY s.created_at LIMIT 1) share_token
         FROM studio_quote_requests q JOIN studio_projects p ON p.id = q.project_id ORDER BY q.created_at DESC LIMIT 50`,
      ).map((q) => {
        // wykonawcy z kontaktem: wybrani przez inwestora + pozostali w promieniu (także niewidoczni w wyszukiwarce)
        const contact = (id: number) => get(`SELECT first_name, last_name, company_name, email, phone, postal_code, radius_km FROM studio_contractors WHERE id = ?`, id);
        const selected = all(`SELECT contractor_id, distance_km FROM studio_quote_request_contractors WHERE request_id = ? ORDER BY distance_km`, q.id)
          .map((x) => ({ ...contact(x.contractor_id as number), distanceKm: x.distance_km }));
        const g = geocodePostal(q.postal_code);
        const sel = new Set(all(`SELECT contractor_id FROM studio_quote_request_contractors WHERE request_id = ?`, q.id).map((x) => x.contractor_id));
        const matches = g ? nearbyContractors(g, Math.max(Number(q.radius_km), SEARCH_RADIUS_KM), true)
          .filter((c) => !sel.has(c.id)).slice(0, 20).map((c) => ({ ...contact(c.id), distanceKm: c.distanceKm })) : [];
        return { ...q, place: g?.place ?? null, selected, matches };
      }),
    });
  });

  r.patch('/quote-requests/:id', (req, res) => {
    const status = String(req.body?.status ?? '');
    if (!['new', 'sent', 'closed'].includes(status)) return res.status(400).json({ error: 'Nieprawidłowy status' });
    const u = run(`UPDATE studio_quote_requests SET status = ? WHERE id = ?`, status, Number(req.params.id));
    if (!u.changes) return res.status(404).json({ error: 'Brak zgłoszenia' });
    res.json({ ok: true });
  });

  return r;
}
