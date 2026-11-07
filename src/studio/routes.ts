// Stair Studio API: zapis projektów z wersjami, udostępnianie, rejestracja firm wykonawczych, komentarze 3D.
// Tożsamość bez kont: właściciel = przeglądarka z kluczem w ciasteczku (ss_owner), firma = sesja po rejestracji (ss_session).

import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, exec, get, run, tx, nowIso, type Row } from '../db/index.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
let schemaReady = false;
export function ensureStudioSchema(): void {
  if (schemaReady) return;
  exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  schemaReady = true;
}

export const CONSENT_TEXT =
  'Wyrażam zgodę na przetwarzanie moich danych (imię, nazwisko, e-mail, telefon) przez design3d.pl oraz ich przekazanie właścicielowi projektu w celu przygotowania wyceny schodów i kontaktu w tej sprawie. Zgodę mogę wycofać w każdej chwili.';

const OWNER_COOKIE = 'ss_owner';
const SESSION_COOKIE = 'ss_session';
const YEAR = 365 * 24 * 3600 * 1000;
const MAX_CONFIG = 200_000;

const token = (bytes = 18) => crypto.randomBytes(bytes).toString('base64url');
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function setCookie(req: Request, res: Response, name: string, value: string, maxAge = YEAR) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${Math.floor(maxAge / 1000)}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
}

/** Klucz właściciela tej przeglądarki (tworzony przy pierwszym zapisie). */
function ownerKey(req: Request, res: Response, create: boolean): string | null {
  let k = cookies(req)[OWNER_COOKIE];
  if (!k && create) {
    k = token(24);
    setCookie(req, res, OWNER_COOKIE, k);
  }
  return k ?? null;
}
function isOwner(req: Request, projectId: string): boolean {
  const k = cookies(req)[OWNER_COOKIE];
  return !!k && !!get(`SELECT 1 FROM studio_project_owners WHERE project_id = ? AND owner_key_hash = ?`, projectId, sha(k));
}
function contractorOf(req: Request): Row | null {
  const t = cookies(req)[SESSION_COOKIE];
  if (!t) return null;
  return get(
    `SELECT c.* FROM studio_sessions s JOIN studio_contractors c ON c.id = s.contractor_id WHERE s.token_hash = ? AND s.expires_at > ?`,
    sha(t), nowIso(),
  ) ?? null;
}

function parseConfig(v: unknown): string | null {
  if (!v || typeof v !== 'object') return null;
  const s = JSON.stringify(v);
  return s.length > MAX_CONFIG ? null : s;
}
const cleanName = (v: unknown, max = 120) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);

function projectView(id: string): Row | null {
  const p = get(`SELECT * FROM studio_projects WHERE id = ?`, id);
  if (!p) return null;
  const cur = get(`SELECT config, updated_at FROM studio_versions WHERE project_id = ? AND version = ?`, id, p.current_version)!;
  return {
    id: p.id, name: p.name, currentVersion: p.current_version, updatedAt: p.updated_at,
    config: JSON.parse(cur.config),
    versions: all(`SELECT version, label, created_at, updated_at FROM studio_versions WHERE project_id = ? ORDER BY version DESC`, id),
  };
}

function commentRows(projectId: string): Row[] {
  return all(
    `SELECT id, version, author_role, author_name, text, pos, resolved, created_at FROM studio_comments WHERE project_id = ? ORDER BY id`,
    projectId,
  ).map((c) => ({ ...c, pos: c.pos ? JSON.parse(c.pos) : null, resolved: !!c.resolved }));
}

function addComment(projectId: string, body: any, author: { role: 'owner' | 'contractor'; name: string; contractorId?: number }): Row | string {
  const text = String(body?.text ?? '').trim().slice(0, 2000);
  if (!text) return 'Treść komentarza jest pusta';
  let pos: string | null = null;
  const p = body?.pos;
  if (p && [p.x, p.y, p.z].every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n as number) < 100)) pos = JSON.stringify({ x: p.x, y: p.y, z: p.z });
  const proj = get(`SELECT current_version FROM studio_projects WHERE id = ?`, projectId)!;
  const id = run(
    `INSERT INTO studio_comments (project_id, version, author_role, contractor_id, author_name, text, pos) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    projectId, proj.current_version, author.role, author.contractorId ?? null, author.name, text, pos,
  ).lastInsertRowid;
  return commentRows(projectId).find((c) => c.id === id)!;
}

const wrap = (fn: (req: Request, res: Response) => unknown) => (req: Request, res: Response, next: NextFunction) => {
  try {
    const r = fn(req, res);
    if (r instanceof Promise) r.catch(next);
  } catch (e) {
    next(e);
  }
};

// prosty limit prób rejestracji (per IP)
const hits = new Map<string, number[]>();
function rateLimited(req: Request, max = 10, windowMs = 10 * 60_000): boolean {
  const ip = req.ip ?? 'x';
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > max;
}

export function studioRouter(): express.Router {
  ensureStudioSchema();
  const r = express.Router();
  r.use(express.json({ limit: '400kb' }));
  r.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // ---------- projekty (właściciel) ----------
  r.get('/me', (req, res) => {
    const c = contractorOf(req);
    res.json({ owner: !!cookies(req)[OWNER_COOKIE], contractor: c ? { name: `${c.first_name} ${c.last_name}`, email: c.email } : null });
  });

  r.post('/projects', wrap((req, res) => {
    const cfg = parseConfig(req.body?.config);
    if (!cfg) return res.status(400).json({ error: 'Brak lub zbyt duża konfiguracja' });
    const name = cleanName(req.body?.name) || 'Projekt schodów';
    const key = ownerKey(req, res, true)!;
    const id = token(9);
    tx(() => {
      run(`INSERT INTO studio_projects (id, name) VALUES (?, ?)`, id, name);
      run(`INSERT INTO studio_project_owners (project_id, owner_key_hash) VALUES (?, ?)`, id, sha(key));
      run(`INSERT INTO studio_versions (project_id, version, label, config) VALUES (?, 1, ?, ?)`, id, cleanName(req.body?.label, 80) || 'Wersja 1', cfg);
    });
    res.status(201).json(projectView(id));
  }));

  r.get('/projects', (req, res) => {
    const k = cookies(req)[OWNER_COOKIE];
    if (!k) return res.json([]);
    res.json(all(
      `SELECT p.id, p.name, p.current_version, p.updated_at FROM studio_projects p JOIN studio_project_owners o ON o.project_id = p.id
       WHERE o.owner_key_hash = ? ORDER BY p.updated_at DESC LIMIT 100`,
      sha(k),
    ));
  });

  const ownerOnly = (req: Request, res: Response): string | null => {
    const id = String(req.params.id);
    if (!get(`SELECT 1 FROM studio_projects WHERE id = ?`, id)) { res.status(404).json({ error: 'Projekt nie istnieje' }); return null; }
    if (!isOwner(req, id)) { res.status(403).json({ error: 'Tylko właściciel projektu' }); return null; }
    return id;
  };

  r.get('/projects/:id', (req, res) => {
    const id = ownerOnly(req, res);
    if (!id) return;
    const share = get(`SELECT token FROM studio_shares WHERE project_id = ? ORDER BY created_at LIMIT 1`, id);
    res.json({
      ...projectView(id), role: 'owner', shareToken: share?.token ?? null,
      contractors: all(
        `SELECT c.first_name, c.last_name, c.email, c.phone, a.first_at, a.last_at FROM studio_access a JOIN studio_contractors c ON c.id = a.contractor_id
         WHERE a.project_id = ? ORDER BY a.last_at DESC`, id,
      ),
    });
  });

  r.get('/projects/:id/versions/:v', (req, res) => {
    const id = ownerOnly(req, res);
    if (!id) return;
    const v = get(`SELECT version, label, config FROM studio_versions WHERE project_id = ? AND version = ?`, id, Number(req.params.v));
    if (!v) return res.status(404).json({ error: 'Brak wersji' });
    res.json({ ...v, config: JSON.parse(v.config) });
  });

  /** Zapisz: nadpisuje bieżącą wersję (lub wskazaną, gdy właściciel pracuje na starszej). */
  r.put('/projects/:id', wrap((req, res) => {
    const id = ownerOnly(req, res);
    if (!id) return;
    const cfg = parseConfig(req.body?.config);
    if (!cfg) return res.status(400).json({ error: 'Brak lub zbyt duża konfiguracja' });
    const p = get(`SELECT current_version FROM studio_projects WHERE id = ?`, id)!;
    const version = Number(req.body?.version) || p.current_version;
    const upd = run(`UPDATE studio_versions SET config = ?, updated_at = ? WHERE project_id = ? AND version = ?`, cfg, nowIso(), id, version);
    if (!upd.changes) return res.status(404).json({ error: 'Brak wersji' });
    const name = cleanName(req.body?.name);
    run(`UPDATE studio_projects SET name = COALESCE(NULLIF(?, ''), name), current_version = ?, updated_at = ? WHERE id = ?`, name, version, nowIso(), id);
    res.json(projectView(id));
  }));

  /** Zapisz jako nową wersję. */
  r.post('/projects/:id/versions', wrap((req, res) => {
    const id = ownerOnly(req, res);
    if (!id) return;
    const cfg = parseConfig(req.body?.config);
    if (!cfg) return res.status(400).json({ error: 'Brak lub zbyt duża konfiguracja' });
    const next = (get(`SELECT MAX(version) AS v FROM studio_versions WHERE project_id = ?`, id)!.v ?? 0) + 1;
    tx(() => {
      run(`INSERT INTO studio_versions (project_id, version, label, config) VALUES (?, ?, ?, ?)`, id, next, cleanName(req.body?.label, 80) || `Wersja ${next}`, cfg);
      run(`UPDATE studio_projects SET current_version = ?, updated_at = ? WHERE id = ?`, next, nowIso(), id);
    });
    res.status(201).json(projectView(id));
  }));

  r.post('/projects/:id/share', (req, res) => {
    const id = ownerOnly(req, res);
    if (!id) return;
    let s = get(`SELECT token FROM studio_shares WHERE project_id = ? ORDER BY created_at LIMIT 1`, id);
    if (!s) {
      s = { token: token(12) };
      run(`INSERT INTO studio_shares (token, project_id) VALUES (?, ?)`, s.token, id);
    }
    res.json({ token: s.token, path: `/konfigurator/p/${s.token}` });
  });

  /** Link właściciela: pozwala otworzyć projekt jako właściciel na innym urządzeniu (ważny 7 dni). */
  r.post('/projects/:id/owner-link', (req, res) => {
    const id = ownerOnly(req, res);
    if (!id) return;
    const t = token(24);
    run(`INSERT INTO studio_claims (token_hash, project_id, expires_at) VALUES (?, ?, ?)`, sha(t), id, new Date(Date.now() + 7 * 86400_000).toISOString());
    res.json({ path: `/konfigurator/?project=${id}#claim=${t}` });
  });

  r.post('/claim', (req, res) => {
    const id = String(req.body?.projectId ?? '');
    const t = String(req.body?.token ?? '');
    const c = get(`SELECT * FROM studio_claims WHERE token_hash = ? AND project_id = ? AND expires_at > ?`, sha(t), id, nowIso());
    if (!c) return res.status(403).json({ error: 'Link właściciela jest nieprawidłowy lub wygasł' });
    const key = ownerKey(req, res, true)!;
    run(`INSERT OR IGNORE INTO studio_project_owners (project_id, owner_key_hash) VALUES (?, ?)`, id, sha(key));
    res.json({ ok: true });
  });

  r.get('/projects/:id/comments', (req, res) => {
    const id = ownerOnly(req, res);
    if (!id) return;
    res.json(commentRows(id));
  });
  r.post('/projects/:id/comments', (req, res) => {
    const id = ownerOnly(req, res);
    if (!id) return;
    const c = addComment(id, req.body, { role: 'owner', name: 'Właściciel projektu' });
    if (typeof c === 'string') return res.status(400).json({ error: c });
    res.status(201).json(c);
  });
  r.patch('/projects/:id/comments/:cid', (req, res) => {
    const id = ownerOnly(req, res);
    if (!id) return;
    run(`UPDATE studio_comments SET resolved = ? WHERE id = ? AND project_id = ?`, !!req.body?.resolved, Number(req.params.cid), id);
    res.json(commentRows(id));
  });

  // ---------- udostępniony link ----------
  const shareOf = (req: Request, res: Response): Row | null => {
    const s = get(`SELECT * FROM studio_shares WHERE token = ?`, String(req.params.token));
    if (!s) { res.status(404).json({ error: 'Link jest nieprawidłowy lub projekt został usunięty' }); return null; }
    return s;
  };
  const accessFor = (req: Request, projectId: string): { role: 'owner' | 'contractor' | 'none'; contractor: Row | null } => {
    if (isOwner(req, projectId)) return { role: 'owner', contractor: null };
    const c = contractorOf(req);
    return c ? { role: 'contractor', contractor: c } : { role: 'none', contractor: null };
  };
  const touch = (projectId: string, contractorId: number) =>
    run(`INSERT INTO studio_access (project_id, contractor_id) VALUES (?, ?) ON CONFLICT(project_id, contractor_id) DO UPDATE SET last_at = excluded.last_at`, projectId, contractorId);

  /**
   * Bez dostępu zwraca konfigurację tylko do rozmytego podglądu w tle (bez komentarzy, wersji i danych kontaktowych).
   */
  r.get('/shares/:token', (req, res) => {
    const s = shareOf(req, res);
    if (!s) return;
    const view = projectView(s.project_id)!;
    const acc = accessFor(req, s.project_id);
    if (acc.contractor) touch(s.project_id, acc.contractor.id);
    res.json({
      projectId: acc.role === 'owner' ? s.project_id : undefined,
      name: view.name, config: view.config, currentVersion: view.currentVersion, role: acc.role,
      viewer: acc.contractor ? { name: `${acc.contractor.first_name} ${acc.contractor.last_name}` } : null,
      consentText: CONSENT_TEXT,
    });
  });

  /** Błyskawiczna rejestracja firmy wykonawczej. */
  r.post('/shares/:token/contractor', wrap((req, res) => {
    const s = shareOf(req, res);
    if (!s) return;
    if (rateLimited(req)) return res.status(429).json({ error: 'Zbyt wiele prób — spróbuj za kilka minut' });
    const b = req.body ?? {};
    const first = cleanName(b.firstName, 60);
    const last = cleanName(b.lastName, 80);
    const email = String(b.email ?? '').trim().toLowerCase().slice(0, 160);
    const phone = String(b.phone ?? '').replace(/[^\d+]/g, '').slice(0, 20);
    const errors: string[] = [];
    if (!first) errors.push('Podaj imię');
    if (!last) errors.push('Podaj nazwisko');
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) errors.push('Podaj poprawny e-mail');
    if (phone.replace(/\D/g, '').length < 9) errors.push('Podaj poprawny numer telefonu');
    if (b.consent !== true) errors.push('Zaznacz zgodę, aby zobaczyć projekt');
    if (errors.length) return res.status(400).json({ error: errors.join('. '), errors });
    const contractorId = tx(() => {
      const ex = get(`SELECT id FROM studio_contractors WHERE email = ?`, email);
      if (ex) {
        run(`UPDATE studio_contractors SET first_name = ?, last_name = ?, phone = ?, consent_text = ?, consent_at = ? WHERE id = ?`, first, last, phone, CONSENT_TEXT, nowIso(), ex.id);
        return ex.id as number;
      }
      return run(`INSERT INTO studio_contractors (first_name, last_name, email, phone, consent_text, consent_at) VALUES (?, ?, ?, ?, ?, ?)`, first, last, email, phone, CONSENT_TEXT, nowIso()).lastInsertRowid;
    });
    const t = token(24);
    run(`INSERT INTO studio_sessions (token_hash, contractor_id, expires_at) VALUES (?, ?, ?)`, sha(t), contractorId, new Date(Date.now() + 90 * 86400_000).toISOString());
    setCookie(req, res, SESSION_COOKIE, t, 90 * 86400_000);
    touch(s.project_id, contractorId);
    res.json({ role: 'contractor', viewer: { name: `${first} ${last}` } });
  }));

  r.get('/shares/:token/comments', (req, res) => {
    const s = shareOf(req, res);
    if (!s) return;
    if (accessFor(req, s.project_id).role === 'none') return res.status(401).json({ error: 'Wymagana rejestracja' });
    res.json(commentRows(s.project_id));
  });
  r.post('/shares/:token/comments', (req, res) => {
    const s = shareOf(req, res);
    if (!s) return;
    const acc = accessFor(req, s.project_id);
    if (acc.role === 'none') return res.status(401).json({ error: 'Wymagana rejestracja' });
    const c = addComment(s.project_id, req.body, acc.role === 'owner'
      ? { role: 'owner', name: 'Właściciel projektu' }
      : { role: 'contractor', name: `${acc.contractor!.first_name} ${acc.contractor!.last_name}`, contractorId: acc.contractor!.id });
    if (typeof c === 'string') return res.status(400).json({ error: c });
    res.status(201).json(c);
  });

  r.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[studio]', err);
    res.status(500).json({ error: 'Błąd serwera' });
  });
  return r;
}
