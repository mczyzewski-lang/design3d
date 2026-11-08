// Stair Studio API: zapis projektów z wersjami, udostępnianie, rejestracja firm wykonawczych, komentarze 3D.
// Tożsamość bez kont: właściciel = przeglądarka z kluczem w ciasteczku (ss_owner), firma = sesja po rejestracji (ss_session).

import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, exec, get, run, tx, nowIso, type Row } from '../db/index.ts';
import { distanceKm, geocodePostal } from './geo/postal.ts';
import { sendSms, smsConfigured } from './sms.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
let schemaReady = false;
export function ensureStudioSchema(): void {
  if (schemaReady) return;
  exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  // migracje kolumn dodanych po pierwszym wdrożeniu (CREATE TABLE IF NOT EXISTS ich nie doda)
  const migrate: Record<string, Array<[string, string]>> = {
    studio_contractors: [
      ['leads_opt_in', 'INTEGER NOT NULL DEFAULT 0'], ['postal_code', 'TEXT'], ['radius_km', 'INTEGER'],
      ['leads_consent_text', 'TEXT'], ['leads_consent_at', 'TEXT'],
      ['source', 'TEXT'], ['via', 'TEXT'], ['ref_project_id', 'TEXT'],
      ['company_name', 'TEXT'], ['listed', 'INTEGER NOT NULL DEFAULT 0'], ['notifications_seen_at', 'TEXT'],
    ],
    studio_projects: [['source', 'TEXT'], ['owner_phone', 'TEXT']],
    studio_otp: [['first_name', 'TEXT'], ['last_name', 'TEXT']],
    studio_phones: [['first_name', 'TEXT'], ['last_name', 'TEXT'], ['consent_text', 'TEXT'], ['consent_at', 'TEXT']],
  };
  for (const [table, list] of Object.entries(migrate)) {
    const cols = new Set(all(`PRAGMA table_info(${table})`).map((c) => c.name as string));
    for (const [n, def] of list) if (!cols.has(n)) exec(`ALTER TABLE ${table} ADD COLUMN ${n} ${def}`);
  }
  schemaReady = true;
}

export const CONSENT_TEXT =
  'Wyrażam zgodę na przetwarzanie moich danych (imię, nazwisko, e-mail, telefon) przez design3d.pl oraz ich przekazanie właścicielowi projektu w celu przygotowania wyceny schodów i kontaktu w tej sprawie. Zgodę mogę wycofać w każdej chwili.';

/** Dobrowolna, osobna zgoda na zapytania o wyceny z okolicy (marketing). */
export const LEADS_TEXT = 'Chcę bezpłatnie otrzymywać zapytania o wyceny schodów z mojej okolicy i wyrażam zgodę na pokazywanie nazwy mojej firmy (lub imienia i inicjału nazwiska), miejscowości i zasięgu w wyszukiwarce wykonawców design3d.pl.';
export const PHONE_CONSENT_TEXT =
  'Wyrażam zgodę na przetwarzanie moich danych (imię, nazwisko, numer telefonu) przez design3d.pl w celu zapisania projektu, kontaktu w sprawie wyceny oraz przekazania projektu i danych kontaktowych wykonawcom, którym go udostępnię lub których wybiorę. Zgodę mogę wycofać w każdej chwili.';
/** Promień wyszukiwania wykonawców przez inwestora (km). */
export const SEARCH_RADIUS_KM = 50;
const MAX_THUMB = 600_000; // bajtów po zdekodowaniu
export const QUOTE_CONSENT_TEXT =
  'Wyrażam zgodę na przekazanie mojego projektu schodów oraz danych kontaktowych wykonawcom z mojej okolicy przez design3d.pl w celu przygotowania wyceny. Zgodę mogę wycofać w każdej chwili.';

/** Źródło / kanał: krótka etykieta [a-z0-9._:-], np. „landing”, „google”, „utm:facebook”. */
export const cleanTag = (v: unknown, max = 60) => String(v ?? '').toLowerCase().replace(/[^a-z0-9._:-]/g, '').slice(0, max) || null;
const VIA = new Set(['link', 'email', 'sms']);
const cleanVia = (v: unknown) => (VIA.has(String(v)) ? String(v) : null);
const normPostal = (v: unknown): string => {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length === 5 ? `${d.slice(0, 2)}-${d.slice(2)}` : '';
};

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
/** „+48 600 100 200”, „600100200”, „0048…” → „+48600100200”; niepoprawny → null. */
export function normPhone(v: unknown): string | null {
  let d = String(v ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('00')) d = `+${d.slice(2)}`;
  if (/^\d{9}$/.test(d)) d = `+48${d}`;
  if (/^48\d{9}$/.test(d)) d = `+${d}`;
  return /^\+48\d{9}$/.test(d) ? d : null;
}
function phoneAccount(req: Request): Row | null {
  const p = phoneOf(req);
  return p ? (get(`SELECT phone, first_name, last_name FROM studio_phones WHERE phone = ?`, p) ?? null) : null;
}
function phoneOf(req: Request): string | null {
  const k = cookies(req)[OWNER_COOKIE];
  return k ? ((get(`SELECT phone FROM studio_owner_phones WHERE owner_key_hash = ?`, sha(k))?.phone as string) ?? null) : null;
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
/** „Jan Maria Kowalski” → imię „Jan”, nazwisko „Maria Kowalski” (jedno pole w formularzach; stare pola dalej działają). */
function personName(b: Record<string, unknown>): { first: string; last: string } {
  const full = cleanName(b.fullName, 140).replace(/\s+/g, ' ');
  if (full) {
    const i = full.indexOf(' ');
    return i < 0 ? { first: full.slice(0, 60), last: '' } : { first: full.slice(0, i).slice(0, 60), last: full.slice(i + 1).slice(0, 80) };
  }
  return { first: cleanName(b.firstName, 60), last: cleanName(b.lastName, 80) };
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
/** Tylko testy: wyczyść liczniki limitów (wszystkie żądania testowe mają ten sam adres IP). */
export function resetRateLimits(): void { hits.clear(); }
/** Limit prób per IP i per kategoria (osobne liczniki — zdarzenia nie zjadają puli rejestracji). */
function rateLimited(req: Request, max = 10, windowMs = 10 * 60_000, bucket = 'register'): boolean {
  const ip = `${bucket}:${req.ip ?? 'x'}`;
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > max;
}

const STATUS_LABEL_PL: Record<string, string> = { new: 'Nowa', in_progress: 'W przygotowaniu', sent: 'Wysłana', won: 'Wygrana', lost: 'Przegrana' };
const short = (t: string, n = 90) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const fmtZl = (v: string) => `${Number(v).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} zł`;

export interface HistoryItem { at: string; type: string; text: string }

/** Historia szansy sprzedaży (projektu) z perspektywy firmy — najnowsze pierwsze. */
export function projectHistory(contractorId: number, projectId: string): HistoryItem[] {
  const acc = get(`SELECT first_at FROM studio_access WHERE contractor_id = ? AND project_id = ?`, contractorId, projectId);
  if (!acc) return [];
  const out: HistoryItem[] = [{ at: acc.first_at as string, type: 'received', text: 'Projekt otrzymany do wyceny' }];
  for (const e of all(`SELECT type, detail, created_at FROM studio_crm_events WHERE contractor_id = ? AND project_id = ?`, contractorId, projectId)) {
    const text = e.type === 'viewed' ? 'Otworzyłeś projekt 3D' : e.type === 'status' ? `Etap: ${STATUS_LABEL_PL[e.detail as string] ?? e.detail}` : e.type === 'amount' ? `Kwota wyceny: ${fmtZl(e.detail as string)}` : String(e.type);
    out.push({ at: e.created_at as string, type: e.type as string, text });
  }
  for (const m of all(`SELECT author_role, contractor_id, text, created_at FROM studio_comments WHERE project_id = ?`, projectId)) {
    // wiadomości inwestora z całego projektu (także sprzed udostępnienia — to kontekst szansy)
    if (m.author_role === 'owner') out.push({ at: m.created_at as string, type: 'owner_message', text: `Inwestor: ${short(m.text as string)}` });
    else if (m.contractor_id === contractorId) out.push({ at: m.created_at as string, type: 'my_message', text: `Ty: ${short(m.text as string)}` });
  }
  for (const v of all(`SELECT created_at FROM studio_events WHERE type = 'owner_view' AND project_id = ? AND created_at >= ?`, projectId, acc.first_at)) {
    out.push({ at: v.created_at as string, type: 'owner_view', text: 'Inwestor otworzył projekt' });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** Powiadomienia firmy: zdarzenia od inwestorów i nowe wyceny (bez własnych działań). */
export function notificationsFor(c: Row): Array<HistoryItem & { projectId: string; token: string | null; title: string; unread: boolean }> {
  const seen = (c.notifications_seen_at as string) ?? '';
  const out = [];
  for (const p of all(`SELECT a.project_id, pr.name, (SELECT token FROM studio_shares s WHERE s.project_id = a.project_id ORDER BY s.created_at LIMIT 1) token
                       FROM studio_access a JOIN studio_projects pr ON pr.id = a.project_id WHERE a.contractor_id = ?`, c.id)) {
    const hist = projectHistory(c.id as number, p.project_id as string);
    const received = hist.find((h) => h.type === 'received')?.at ?? '';
    for (const h of hist) {
      if (!['received', 'owner_message', 'owner_view'].includes(h.type)) continue;
      if (h.at < received) continue; // starsze wiadomości są w historii, ale nie jako powiadomienie
      const title = h.type === 'received' ? 'Nowy projekt do wyceny' : h.type === 'owner_message' ? 'Nowa wiadomość od inwestora' : 'Inwestor otworzył projekt';
      out.push({ ...h, title, projectId: p.project_id as string, token: (p.token as string) ?? null, unread: h.at > seen, text: `${h.type === 'owner_message' ? h.text.replace(/^Inwestor: /, '') : `„${p.name}”`}` });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
}

/** Widoczni w wyszukiwarce wykonawcy w promieniu od punktu, najbliżsi pierwsi. */
export function nearbyContractors(origin: { lat: number; lon: number }, radiusKm: number, includeUnlisted = false): Array<{ id: number; name: string; place: string; distanceKm: number; radiusKm: number; servesArea: boolean }> {
  const rows = all(`SELECT id, first_name, last_name, company_name, postal_code, radius_km FROM studio_contractors WHERE leads_opt_in = 1 ${includeUnlisted ? '' : 'AND listed = 1'}`);
  const out = [];
  for (const c of rows) {
    const g = geocodePostal(c.postal_code);
    if (!g) continue;
    const d = Math.round(distanceKm(origin, g) * 10) / 10;
    if (d > radiusKm) continue;
    out.push({
      id: c.id as number,
      name: (c.company_name as string) || `${c.first_name} ${String(c.last_name).slice(0, 1)}.`,
      place: g.place, distanceKm: d, radiusKm: c.radius_km as number, servesArea: d <= (c.radius_km as number),
    });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

export function studioRouter(): express.Router {
  ensureStudioSchema();
  const r = express.Router();
  r.use(express.json({ limit: '1200kb' }));
  r.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // ---------- projekty (właściciel) ----------
  r.get('/me', (req, res) => {
    const c = contractorOf(req);
    res.json({
      owner: !!cookies(req)[OWNER_COOKIE], phone: phoneOf(req), smsTest: !smsConfigured(),
      person: (() => { const a = phoneAccount(req); return a?.first_name ? { firstName: a.first_name, lastName: a.last_name } : null; })(),
      contractor: c ? { name: `${c.first_name} ${c.last_name}`, email: c.email } : null,
      texts: { consent: CONSENT_TEXT, leads: LEADS_TEXT, quote: QUOTE_CONSENT_TEXT, phone: PHONE_CONSENT_TEXT },
    });
  });

  r.post('/projects', wrap((req, res) => {
    const cfg = parseConfig(req.body?.config);
    if (!cfg) return res.status(400).json({ error: 'Brak lub zbyt duża konfiguracja' });
    const name = cleanName(req.body?.name) || 'Projekt schodów';
    const key = ownerKey(req, res, true)!;
    const id = token(9);
    tx(() => {
      run(`INSERT INTO studio_projects (id, name, source, owner_phone) VALUES (?, ?, ?, ?)`, id, name, cleanTag(req.body?.source), phoneOf(req));
      run(`INSERT INTO studio_project_owners (project_id, owner_key_hash) VALUES (?, ?)`, id, sha(key));
      run(`INSERT INTO studio_versions (project_id, version, label, config) VALUES (?, 1, ?, ?)`, id, cleanName(req.body?.label, 80) || 'Wersja 1', cfg);
      // wycena utworzona przez zalogowanego wykonawcę trafia do jego panelu
      const firm = contractorOf(req);
      if (firm) {
        run(`INSERT OR IGNORE INTO studio_access (project_id, contractor_id) VALUES (?, ?)`, id, firm.id);
        run(`INSERT OR IGNORE INTO studio_contractor_quotes (contractor_id, project_id, status, viewed_at) VALUES (?, ?, 'in_progress', ?)`, firm.id, id, nowIso());
        if (!get(`SELECT 1 FROM studio_shares WHERE project_id = ?`, id)) run(`INSERT INTO studio_shares (token, project_id) VALUES (?, ?)`, token(12), id);
      }
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
    // „Inwestor otworzył projekt” — do aktywności firm z dostępem (najwyżej raz na godzinę, chyba że od tego czasu doszła nowa firma)
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const lastAccess = (get(`SELECT MAX(first_at) m FROM studio_access WHERE project_id = ?`, id)?.m as string | null) ?? '';
    if (!get(`SELECT 1 FROM studio_events WHERE type = 'owner_view' AND project_id = ? AND created_at > ?`, id, lastAccess > hourAgo ? lastAccess : hourAgo)) {
      run(`INSERT INTO studio_events (type, page, project_id) VALUES ('owner_view', 'configurator', ?)`, id);
    }
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

  // ---------- numer telefonu (kod SMS) ----------
  /** Krok 1 „Zapisz i udostępnij”: wyślij kod SMS na numer. */
  r.post('/phone/start', wrap(async (req, res) => {
    const phone = normPhone(req.body?.phone);
    const { first, last } = personName(req.body ?? {});
    const errors: string[] = [];
    if (!first || !last) errors.push('Podaj imię i nazwisko');
    if (!phone) errors.push('Podaj polski numer telefonu (9 cyfr)');
    if (req.body?.consent !== true) errors.push('Zaznacz zgodę na przetwarzanie danych');
    if (errors.length || !phone) return res.status(400).json({ error: errors.join('. '), errors });
    if (rateLimited(req, 6, 10 * 60_000, 'phone')) return res.status(429).json({ error: 'Zbyt wiele prób — spróbuj za kilka minut' });
    const recent = get(`SELECT COUNT(*) n FROM studio_otp WHERE phone = ? AND created_at > ?`, phone, new Date(Date.now() - 10 * 60_000).toISOString())!.n as number;
    if (recent >= 3) return res.status(429).json({ error: 'Wysłaliśmy już kilka kodów na ten numer — spróbuj za 10 minut' });
    const key = ownerKey(req, res, true)!;
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    run(`INSERT INTO studio_otp (phone, owner_key_hash, code_hash, expires_at, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?)`, phone, sha(key), sha(`${phone}:${code}`), new Date(Date.now() + 10 * 60_000).toISOString(), first, last);
    const sms = await sendSms(phone, `Kod Stair Studio: ${code}. Wpisz go, aby przypisać projekt schodów do numeru. design3d.pl`);
    if (!sms.sent && !sms.demo) return res.status(502).json({ error: 'Nie udało się wysłać SMS — spróbuj ponownie za chwilę' });
    // tryb testowy (brak bramki SMS): kod wraca w odpowiedzi, żeby dało się przejść dalej
    res.json({ ok: true, phone, test: sms.demo, ...(sms.demo ? { testCode: code } : {}) });
  }));

  /** Potwierdzenie kodu: numer staje się „kontem” — przypina przeglądarkę i projekty (także z innych urządzeń). */
  r.post('/phone/verify', wrap((req, res) => {
    const phone = normPhone(req.body?.phone);
    const code = String(req.body?.code ?? '').replace(/\D/g, '');
    const key = cookies(req)[OWNER_COOKIE];
    if (!phone || !key || code.length !== 6) return res.status(400).json({ error: 'Wpisz 6-cyfrowy kod z SMS' });
    const otp = get(`SELECT * FROM studio_otp WHERE phone = ? AND owner_key_hash = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1`, phone, sha(key));
    if (!otp || otp.expires_at < nowIso()) return res.status(400).json({ error: 'Kod wygasł — wyślij nowy' });
    if (otp.attempts >= 5) return res.status(429).json({ error: 'Zbyt wiele błędnych prób — wyślij nowy kod' });
    if (otp.code_hash !== sha(`${phone}:${code}`)) {
      run(`UPDATE studio_otp SET attempts = attempts + 1 WHERE id = ?`, otp.id);
      return res.status(400).json({ error: 'Nieprawidłowy kod' });
    }
    const k = sha(key);
    const claimed = tx(() => {
      run(`UPDATE studio_otp SET used_at = ? WHERE id = ?`, nowIso(), otp.id);
      run(`INSERT INTO studio_phones (phone, verified_at, method, first_name, last_name, consent_text, consent_at) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(phone) DO UPDATE SET verified_at = excluded.verified_at, first_name = excluded.first_name, last_name = excluded.last_name, consent_text = excluded.consent_text, consent_at = excluded.consent_at`,
        phone, nowIso(), smsConfigured() ? 'sms' : 'test', otp.first_name ?? null, otp.last_name ?? null, PHONE_CONSENT_TEXT, nowIso());
      run(`INSERT INTO studio_owner_phones (owner_key_hash, phone, verified_at) VALUES (?, ?, ?) ON CONFLICT(owner_key_hash) DO UPDATE SET phone = excluded.phone, verified_at = excluded.verified_at`, k, phone, nowIso());
      // projekty tej przeglądarki bez numeru → przypisz numer; projekty numeru z innych urządzeń → dostęp tutaj
      run(`UPDATE studio_projects SET owner_phone = ? WHERE owner_phone IS NULL AND id IN (SELECT project_id FROM studio_project_owners WHERE owner_key_hash = ?)`, phone, k);
      return run(`INSERT OR IGNORE INTO studio_project_owners (project_id, owner_key_hash) SELECT id, ? FROM studio_projects WHERE owner_phone = ?`, k, phone).changes;
    });
    res.json({ ok: true, phone, claimed });
  }));

  /** Podgląd projektu (zrzut sceny JPEG/PNG/WebP) — pokazywany w bramce udostępnionego linku. */
  r.put('/projects/:id/thumbnail', wrap((req, res) => {
    const id = ownerOnly(req, res);
    if (!id) return;
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.image ?? ''));
    if (!m) return res.status(400).json({ error: 'Nieprawidłowy obraz' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length < 100 || buf.length > MAX_THUMB) return res.status(400).json({ error: 'Obraz jest pusty lub za duży' });
    run(`INSERT INTO studio_thumbnails (project_id, mime, data, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at`, id, m[1], buf, nowIso());
    res.json({ ok: true });
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
    if (acc.role !== 'owner') {
      run(`INSERT INTO studio_events (type, page, via, project_id, detail) VALUES ('share_view', 'share', ?, ?, ?)`,
        cleanVia(req.query.via) ?? 'link', s.project_id, acc.role);
    }
    res.json({
      projectId: acc.role !== 'none' ? s.project_id : undefined, // firma z dostępem: do panelu wykonawcy
      name: view.name, config: view.config, currentVersion: view.currentVersion, role: acc.role,
      viewer: acc.contractor ? { name: `${acc.contractor.first_name} ${acc.contractor.last_name}` } : null,
      consentText: CONSENT_TEXT, leadsText: LEADS_TEXT,
      thumbnail: get(`SELECT updated_at FROM studio_thumbnails WHERE project_id = ?`, s.project_id)?.updated_at ?? null,
    });
  });

  /** Podgląd projektu dla każdego z linkiem (to samo, co rozmyte tło bramki — bez danych kontaktowych). */
  r.get('/shares/:token/thumbnail', (req, res) => {
    const s = get(`SELECT project_id FROM studio_shares WHERE token = ?`, String(req.params.token));
    const t = s && get(`SELECT mime, data FROM studio_thumbnails WHERE project_id = ?`, s.project_id);
    if (!t) return res.status(404).end();
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.type(t.mime as string).send(Buffer.from(t.data as Uint8Array));
  });

  /**
   * Rejestracja firmy wykonawczej: z udostępnionego linku (dostęp do projektu) albo z landingu
   * (tylko zgłoszenie do bazy wykonawców). Zwraca id firmy albo null, gdy odpowiedź już wysłano.
   */
  const registerContractor = (req: Request, res: Response, origin: { source: string; via?: string | null; projectId?: string; consentRequired: boolean }): number | null => {
    if (rateLimited(req)) { res.status(429).json({ error: 'Zbyt wiele prób — spróbuj za kilka minut' }); return null; }
    const b = req.body ?? {};
    const { first, last } = personName(b);
    const company = cleanName(b.companyName, 120) || null;
    const email = String(b.email ?? '').trim().toLowerCase().slice(0, 160);
    const phone = String(b.phone ?? '').replace(/[^\d+]/g, '').slice(0, 20);
    const errors: string[] = [];
    if (!first || !last) errors.push('Podaj imię i nazwisko');
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) errors.push('Podaj poprawny e-mail');
    if (phone.replace(/\D/g, '').length < 9) errors.push('Podaj poprawny numer telefonu');
    if (origin.consentRequired && b.consent !== true) errors.push('Zaznacz zgodę, aby zobaczyć projekt');
    const leads = b.leads === true;
    const postal = normPostal(b.postalCode);
    const radius = Math.round(Number(b.radiusKm));
    if (leads && !postal) errors.push('Podaj kod pocztowy w formacie 00-000');
    else if (leads && !geocodePostal(postal)) errors.push('Nie rozpoznajemy tego kodu pocztowego');
    if (leads && !(radius >= 5 && radius <= 300)) errors.push('Podaj promień od 5 do 300 km');
    if (!origin.consentRequired && !leads) errors.push('Zaznacz zgodę na otrzymywanie zapytań z okolicy');
    if (errors.length) { res.status(400).json({ error: errors.join('. '), errors }); return null; }
    // zgoda na zapytania z okolicy: zapis z treścią i datą; odznaczenie przy ponownej rejestracji ją wycofuje
    const setLeads = (id: number) => run(
      `UPDATE studio_contractors SET leads_opt_in = ?, listed = ?, postal_code = ?, radius_km = ?, leads_consent_text = ?, leads_consent_at = ?, company_name = COALESCE(?, company_name) WHERE id = ?`,
      leads ? 1 : 0, leads ? 1 : 0, leads ? postal : null, leads ? radius : null, leads ? LEADS_TEXT : null, leads ? nowIso() : null, company, id,
    );
    const consentText = origin.consentRequired ? CONSENT_TEXT : LEADS_TEXT;
    const contractorId = tx(() => {
      const ex = get(`SELECT id FROM studio_contractors WHERE email = ?`, email);
      if (ex) {
        run(`UPDATE studio_contractors SET first_name = ?, last_name = ?, phone = ?, consent_text = ?, consent_at = ? WHERE id = ?`, first, last, phone, consentText, nowIso(), ex.id);
        setLeads(ex.id as number);
        return ex.id as number;
      }
      const id = Number(run(
        `INSERT INTO studio_contractors (first_name, last_name, email, phone, consent_text, consent_at, source, via, ref_project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        first, last, email, phone, consentText, nowIso(), origin.source, origin.via ?? null, origin.projectId ?? null,
      ).lastInsertRowid);
      setLeads(id);
      return id;
    });
    const t = token(24);
    run(`INSERT INTO studio_sessions (token_hash, contractor_id, expires_at) VALUES (?, ?, ?)`, sha(t), contractorId, new Date(Date.now() + 90 * 86400_000).toISOString());
    setCookie(req, res, SESSION_COOKIE, t, 90 * 86400_000);
    return contractorId;
  };

  /** Błyskawiczna rejestracja firmy wykonawczej z udostępnionego linku. */
  r.post('/shares/:token/contractor', wrap((req, res) => {
    const s = shareOf(req, res);
    if (!s) return;
    const id = registerContractor(req, res, { source: 'share_link', via: cleanVia(req.body?.via) ?? 'link', projectId: s.project_id, consentRequired: true });
    if (id === null) return;
    touch(s.project_id, id);
    const c = get(`SELECT first_name, last_name FROM studio_contractors WHERE id = ?`, id)!;
    res.json({ role: 'contractor', viewer: { name: `${c.first_name} ${c.last_name}` } });
  }));

  /** Dołączenie wykonawcy z landingu — do bazy firm otrzymujących zapytania z okolicy. */
  r.post('/contractors', wrap((req, res) => {
    const id = registerContractor(req, res, { source: cleanTag(req.body?.source) ?? 'landing', consentRequired: false });
    if (id === null) return;
    res.status(201).json({ ok: true });
  }));

  // ---------- panel wykonawcy (CRM) ----------
  const contractorOnly = (req: Request, res: Response): Row | null => {
    const c = contractorOf(req);
    if (!c) { res.status(401).json({ error: 'Zaloguj się jako wykonawca — otwórz link do projektu albo dołącz na stronie głównej' }); return null; }
    return c;
  };
  const SHAPE_NAME: Record<string, string> = { I: 'proste', L: 'L', U: 'U', S: 'kręcone' };
  const QUOTE_STATUSES = new Set(['new', 'in_progress', 'sent', 'won', 'lost']);

  /** Wyceny (projekty, do których firma ma dostęp), kontakty inwestorów i profil firmy. */
  r.get('/contractor/overview', (req, res) => {
    const c = contractorOnly(req, res);
    if (!c) return;
    const quotes = all(
      `SELECT p.id, p.name, p.owner_phone, p.current_version, a.first_at, a.last_at,
              (SELECT token FROM studio_shares s WHERE s.project_id = p.id ORDER BY s.created_at LIMIT 1) token,
              (SELECT config FROM studio_versions v WHERE v.project_id = p.id AND v.version = p.current_version) config,
              (SELECT COUNT(*) FROM studio_comments m WHERE m.project_id = p.id) comments
       FROM studio_access a JOIN studio_projects p ON p.id = a.project_id WHERE a.contractor_id = ? ORDER BY a.first_at DESC`, c.id,
    ).map((p) => {
      let shape = '?';
      try { shape = JSON.parse(p.config as string)?.stairs?.shape ?? '?'; } catch { /* uszkodzona konfiguracja */ }
      const qr = get(`SELECT name, email, phone, postal_code, created_at FROM studio_quote_requests WHERE project_id = ? ORDER BY id DESC LIMIT 1`, p.id);
      const acc = p.owner_phone ? get(`SELECT first_name, last_name FROM studio_phones WHERE phone = ?`, p.owner_phone) : null;
      const q = get(`SELECT status, amount, note, viewed_at, updated_at FROM studio_contractor_quotes WHERE contractor_id = ? AND project_id = ?`, c.id, p.id);
      const ownerName = acc?.first_name ? `${acc.first_name} ${acc.last_name ?? ''}`.trim() : (qr?.name as string) || 'Inwestor';
      return {
        projectId: p.id, token: p.token, projectName: p.name,
        title: `Schody ${SHAPE_NAME[shape] ?? shape} — ${qr?.postal_code ?? 'bez kodu pocztowego'}`,
        shape, postalCode: qr?.postal_code ?? null,
        owner: { name: ownerName, phone: (p.owner_phone as string) ?? (qr?.phone as string) ?? null, email: (qr?.email as string) ?? null },
        receivedAt: p.first_at, lastOpenedAt: p.last_at, comments: p.comments,
        status: (q?.status as string) ?? 'new', amount: q?.amount ?? null, note: q?.note ?? null,
        isNew: !q?.viewed_at, updatedAt: q?.updated_at ?? null,
        history: projectHistory(c.id as number, p.id as string).slice(0, 40),
      };
    });
    // kontakty: inwestorzy z wycen (wg telefonu / e-maila / nazwy)
    const contacts = new Map<string, { key: string; name: string; phone: string | null; email: string | null; quotes: number; last: string; projectIds: string[] }>();
    for (const q of quotes) {
      const k = q.owner.phone ?? q.owner.email ?? q.owner.name;
      const e = contacts.get(k);
      if (e) { e.quotes++; e.projectIds.push(q.projectId as string); if (q.receivedAt > e.last) e.last = q.receivedAt as string; }
      else contacts.set(k, { key: k, name: q.owner.name, phone: q.owner.phone, email: q.owner.email, quotes: 1, last: q.receivedAt as string, projectIds: [q.projectId as string] });
    }
    res.json({
      me: {
        firstName: c.first_name, lastName: c.last_name, companyName: c.company_name ?? null, email: c.email, phone: c.phone,
        postalCode: c.postal_code ?? null, radiusKm: c.radius_km ?? null, leads: !!c.leads_opt_in, listed: !!c.listed, since: c.created_at,
      },
      quotes, contacts: [...contacts.values()], leadsText: LEADS_TEXT,
      unread: notificationsFor(c).filter((n) => n.unread).length,
    });
  });

  r.patch('/contractor/me', wrap((req, res) => {
    const c = contractorOnly(req, res);
    if (!c) return;
    const b = req.body ?? {};
    const company = cleanName(b.companyName, 120) || null;
    const phone = String(b.phone ?? c.phone).replace(/[^\d+]/g, '').slice(0, 20);
    const leads = b.leads === true;
    const postal = normPostal(b.postalCode);
    const radius = Math.round(Number(b.radiusKm));
    const errors: string[] = [];
    if (phone.replace(/\D/g, '').length < 9) errors.push('Podaj poprawny numer telefonu');
    if (leads && (!postal || !geocodePostal(postal))) errors.push('Podaj kod pocztowy w formacie 00-000');
    if (leads && !(radius >= 5 && radius <= 300)) errors.push('Podaj promień od 5 do 300 km');
    if (errors.length) return res.status(400).json({ error: errors.join('. '), errors });
    run(`UPDATE studio_contractors SET company_name = ?, phone = ?, leads_opt_in = ?, listed = ?, postal_code = ?, radius_km = ?,
           leads_consent_text = CASE WHEN ? THEN ? ELSE NULL END, leads_consent_at = CASE WHEN ? THEN COALESCE(leads_consent_at, ?) ELSE NULL END WHERE id = ?`,
      company, phone, leads ? 1 : 0, leads ? 1 : 0, leads ? postal : null, leads ? radius : null, leads ? 1 : 0, LEADS_TEXT, leads ? 1 : 0, nowIso(), c.id);
    res.json({ ok: true });
  }));

  /** Status, kwota i notatka wyceny (widoczne tylko dla tej firmy). */
  r.put('/contractor/quotes/:pid', wrap((req, res) => {
    const c = contractorOnly(req, res);
    if (!c) return;
    const pid = String(req.params.pid);
    if (!get(`SELECT 1 FROM studio_access WHERE contractor_id = ? AND project_id = ?`, c.id, pid)) return res.status(404).json({ error: 'Brak dostępu do projektu' });
    const b = req.body ?? {};
    const status = QUOTE_STATUSES.has(b.status) ? b.status : null;
    // kwota zmienia się tylko, gdy jest w żądaniu (zmiana samego etapu, np. w pipeline, jej nie kasuje)
    const hasAmount = 'amount' in b;
    const amount = !hasAmount || b.amount === null || b.amount === '' ? null : Math.round(Number(String(b.amount).replace(/\s/g, '').replace(',', '.')) * 100) / 100;
    if (amount !== null && !(amount >= 0 && amount < 10_000_000)) return res.status(400).json({ error: 'Nieprawidłowa kwota' });
    const note = b.note === undefined ? undefined : String(b.note).slice(0, 2000);
    const before = get(`SELECT status, amount FROM studio_contractor_quotes WHERE contractor_id = ? AND project_id = ?`, c.id, pid);
    tx(() => {
      run(`INSERT INTO studio_contractor_quotes (contractor_id, project_id, status, amount, note, viewed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(contractor_id, project_id) DO UPDATE SET status = COALESCE(?, status), amount = CASE WHEN ? THEN ? ELSE amount END, note = COALESCE(?, note), viewed_at = COALESCE(viewed_at, excluded.viewed_at), updated_at = excluded.updated_at`,
        c.id, pid, status ?? 'in_progress', amount, note ?? null, nowIso(), nowIso(), status, hasAmount ? 1 : 0, amount, note ?? null);
      const prevStatus = (before?.status as string) ?? 'new';
      if (status && status !== prevStatus) run(`INSERT INTO studio_crm_events (contractor_id, project_id, type, detail) VALUES (?, ?, 'status', ?)`, c.id, pid, status);
      if (hasAmount && amount !== null && amount !== (before?.amount ?? null)) run(`INSERT INTO studio_crm_events (contractor_id, project_id, type, detail) VALUES (?, ?, 'amount', ?)`, c.id, pid, String(amount));
    });
    res.json({ ok: true });
  }));
  r.post('/contractor/quotes/:pid/viewed', (req, res) => {
    const c = contractorOnly(req, res);
    if (!c) return;
    const pid = String(req.params.pid);
    if (!get(`SELECT 1 FROM studio_access WHERE contractor_id = ? AND project_id = ?`, c.id, pid)) return res.status(404).json({ error: 'Brak dostępu do projektu' });
    const first = !get(`SELECT viewed_at FROM studio_contractor_quotes WHERE contractor_id = ? AND project_id = ? AND viewed_at IS NOT NULL`, c.id, pid);
    run(`INSERT INTO studio_contractor_quotes (contractor_id, project_id, viewed_at) VALUES (?, ?, ?) ON CONFLICT(contractor_id, project_id) DO UPDATE SET viewed_at = COALESCE(viewed_at, excluded.viewed_at)`, c.id, pid, nowIso());
    if (first) run(`INSERT INTO studio_crm_events (contractor_id, project_id, type) VALUES (?, ?, 'viewed')`, c.id, pid);
    res.json({ ok: true });
  });

  /** Aktywność (powiadomienia) firmy: nowe wyceny, wiadomości i otwarcia projektu przez inwestora. */
  r.get('/contractor/notifications', (req, res) => {
    const c = contractorOnly(req, res);
    if (!c) return;
    res.json({ items: notificationsFor(c), seenAt: c.notifications_seen_at ?? null });
  });
  r.post('/contractor/notifications/seen', (req, res) => {
    const c = contractorOnly(req, res);
    if (!c) return;
    run(`UPDATE studio_contractors SET notifications_seen_at = ? WHERE id = ?`, nowIso(), c.id);
    res.json({ ok: true });
  });

  /** Anonimowe zdarzenia (wejście na landing / do konfiguratora / na stronę ogrodzeń, wybór układu na landingu). */
  const EVENT_TYPES = new Set(['visit', 'landing_shape', 'fence_plan']);
  const PAGES = new Set(['landing', 'configurator', 'ogrodzenia']);

  /** Lista oczekujących („Powiadom mnie o starcie”) dla nowych linii, np. ogrodzeń. */
  r.post('/waitlist', (req, res) => {
    if (rateLimited(req, 10, 10 * 60_000, 'waitlist')) return res.status(429).json({ error: 'Zbyt wiele prób — spróbuj za kilka minut' });
    const b = req.body ?? {};
    const product = b.product === 'ogrodzenia' ? 'ogrodzenia' : null;
    const kind = b.kind === 'contractor' ? 'contractor' : 'investor';
    const email = String(b.email ?? '').trim().toLowerCase().slice(0, 160);
    const errors: string[] = [];
    if (!product) errors.push('Nieznana linia produktu');
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) errors.push('Podaj poprawny e-mail');
    const postal = b.postalCode ? normPostal(b.postalCode) : null;
    if (b.postalCode && !postal) errors.push('Kod pocztowy w formacie 00-000');
    if (b.consent !== true) errors.push('Zaznacz zgodę na powiadomienie');
    if (errors.length) return res.status(400).json({ errors });
    const detail = typeof b.detail === 'string' ? b.detail.slice(0, 600) : null;
    run(`INSERT INTO studio_waitlist (product, kind, email, postal_code, detail, source) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (product, kind, email) DO UPDATE SET postal_code = COALESCE(excluded.postal_code, postal_code), detail = COALESCE(excluded.detail, detail)`,
      product, kind, email, postal, detail, cleanTag(b.source));
    res.json({ ok: true });
  });
  r.post('/events', (req, res) => {
    const b = req.body ?? {};
    if (!EVENT_TYPES.has(b.type) || rateLimited(req, 120, 10 * 60_000, 'events')) return res.status(204).end();
    run(`INSERT INTO studio_events (type, page, source, detail) VALUES (?, ?, ?, ?)`,
      b.type, PAGES.has(b.page) ? b.page : null, cleanTag(b.source), cleanTag(b.detail, 40));
    res.status(204).end();
  });

  /**
   * Wykonawcy w promieniu od kodu pocztowego inwestora (najbliżsi pierwsi) — tylko firmy, które zgodziły się
   * na pokazywanie w wyszukiwarce. Bez danych kontaktowych: zapytanie idzie przez design3d.pl.
   */
  r.get('/contractors/nearby', (req, res) => {
    if (rateLimited(req, 60, 10 * 60_000, 'nearby')) return res.status(429).json({ error: 'Zbyt wiele wyszukiwań — spróbuj za kilka minut' });
    const origin = geocodePostal(req.query.postal);
    if (!origin) return res.status(400).json({ error: 'Podaj poprawny kod pocztowy (00-000)' });
    const radius = Math.min(150, Math.max(10, Math.round(Number(req.query.radius) || SEARCH_RADIUS_KM)));
    res.json({ origin: { code: origin.code, place: origin.place, precision: origin.precision }, radiusKm: radius, results: nearbyContractors(origin, radius) });
  });

  /** „Znajdź wykonawcę”: właściciel zostawia kod pocztowy, kontakt i (opcjonalnie) wybranych wykonawców z tabeli. */
  r.post('/projects/:id/quote-request', wrap((req, res) => {
    const id = ownerOnly(req, res);
    if (!id) return;
    const b = req.body ?? {};
    const name = cleanName(b.name, 80);
    const email = String(b.email ?? '').trim().toLowerCase().slice(0, 160);
    const phone = String(b.phone ?? '').replace(/[^\d+]/g, '').slice(0, 20);
    const postal = normPostal(b.postalCode);
    const radius = Math.round(Number(b.radiusKm ?? SEARCH_RADIUS_KM));
    const errors: string[] = [];
    if (!name) errors.push('Podaj imię');
    if (!postal) errors.push('Podaj kod pocztowy w formacie 00-000');
    const origin = postal ? geocodePostal(postal) : null;
    if (postal && !origin) errors.push('Nie rozpoznajemy tego kodu pocztowego');
    if (!(radius >= 5 && radius <= 300)) errors.push('Podaj promień od 5 do 300 km');
    const okEmail = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email);
    const okPhone = phone.replace(/\D/g, '').length >= 9;
    if (!okEmail && !okPhone) errors.push('Podaj e-mail lub telefon, abyśmy mogli przekazać wyceny');
    if (b.consent !== true) errors.push('Zaznacz zgodę na przekazanie projektu wykonawcom');
    if (errors.length) return res.status(400).json({ error: errors.join('. '), errors });
    // wybrani z tabeli: tylko widoczni w wyszukiwarce i w promieniu wyszukiwania
    const found = nearbyContractors(origin!, Math.max(radius, SEARCH_RADIUS_KM));
    const wanted = new Set((Array.isArray(b.contractorIds) ? b.contractorIds : []).slice(0, 30).map(Number));
    const chosen = found.filter((c) => wanted.has(c.id));
    const reqId = tx(() => {
      const rid = Number(run(`INSERT INTO studio_quote_requests (project_id, name, email, phone, postal_code, radius_km, consent_text, consent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id, name, okEmail ? email : null, okPhone ? phone : null, postal, radius, QUOTE_CONSENT_TEXT, nowIso()).lastInsertRowid);
      for (const c of chosen) {
        run(`INSERT INTO studio_quote_request_contractors (request_id, contractor_id, distance_km) VALUES (?, ?, ?)`, rid, c.id, c.distanceKm);
        touch(id, c.id); // projekt pojawia się w panelu wykonawcy jako nowa wycena
      }
      return rid;
    });
    res.status(201).json({ ok: true, id: reqId, nearby: found.length, selected: chosen.length });
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
