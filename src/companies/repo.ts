// Firmy, domeny, kontakty, źródła — z deduplikacją i scalaniem.

import crypto from 'node:crypto';
import { all, get, run, tx, nowIso, type Row } from '../db/index.ts';
import { choosePrimaryEmail, FREEMAIL, type EmailCategory } from '../crawler/emails.ts';
import { foldPl, normalizeNip, voivodeshipFor } from '../util/polish.ts';

// ---------------- RODO: lista wykluczeń ----------------
export type SuppressionKind = 'email' | 'domain' | 'nip';
export const hashId = (kind: SuppressionKind, value: string) =>
  crypto.createHash('sha256').update(`${kind}:${value.trim().toLowerCase()}`).digest('hex');

export function isSuppressed(kind: SuppressionKind, value: string | null | undefined): boolean {
  if (!value) return false;
  return !!get(`SELECT 1 FROM suppressions WHERE kind = ? AND value_hash = ?`, kind, hashId(kind, value));
}
export function addSuppression(kind: SuppressionKind, value: string, reason: 'objection' | 'erasure'): void {
  run(`INSERT OR IGNORE INTO suppressions (kind, value_hash, reason) VALUES (?, ?, ?)`, kind, hashId(kind, value), reason);
}

// ---------------- Firmy ----------------
export function resolveCompanyId(id: number): number {
  let cur = id;
  for (let i = 0; i < 20; i++) {
    const r = get(`SELECT merged_into_id FROM companies WHERE id = ?`, cur);
    if (!r || !r.merged_into_id) return cur;
    cur = r.merged_into_id;
  }
  return cur;
}

export function getCompany(id: number): Row | undefined {
  return get(`SELECT * FROM companies WHERE id = ?`, resolveCompanyId(id));
}

export function linkProject(projectId: number | null | undefined, companyId: number, via: string): boolean {
  if (!projectId) return false;
  return run(`INSERT OR IGNORE INTO project_companies (project_id, company_id, discovered_via) VALUES (?, ?, ?)`, projectId, companyId, via).changes > 0;
}

export function addSource(s: { companyId: number; projectId?: number | null; kind: string; provider?: string; url?: string; title?: string; snippet?: string; query?: string }): void {
  const dup = get(
    `SELECT id FROM sources WHERE company_id = ? AND kind = ? AND IFNULL(url,'') = IFNULL(?, '') AND IFNULL(query,'') = IFNULL(?, '') LIMIT 1`,
    s.companyId, s.kind, s.url ?? null, s.query ?? null,
  );
  if (dup) return;
  run(
    `INSERT INTO sources (company_id, project_id, kind, provider, url, title, snippet, query) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    s.companyId, s.projectId ?? null, s.kind, s.provider ?? null, s.url ?? null, s.title?.slice(0, 300) ?? null, s.snippet?.slice(0, 500) ?? null, s.query ?? null,
  );
}

export interface DiscoveredCompany {
  domain: string;
  url: string;
  name?: string | null;
  city?: string | null;
  nip?: string | null;
  projectId?: number | null;
  via: 'search' | 'csv' | 'manual';
  source?: { kind: string; provider?: string; url?: string; title?: string; snippet?: string; query?: string };
}

export interface UpsertResult {
  companyId: number;
  created: boolean;
  linked: boolean;
}

/** Znajdź firmę po domenie/NIP albo utwórz nową. Zwraca null, jeśli dane są objęte sprzeciwem. */
export function findOrCreateByDomain(d: DiscoveredCompany): UpsertResult | null {
  if (isSuppressed('domain', d.domain)) return null;
  const nip = normalizeNip(d.nip);
  if (nip && isSuppressed('nip', nip)) return null;
  return tx(() => {
    let companyId: number | null = null;
    let created = false;
    const dom = get(`SELECT * FROM domains WHERE domain = ?`, d.domain);
    if (dom?.company_id) companyId = resolveCompanyId(dom.company_id);
    if (!companyId && nip) {
      const byNip = get(`SELECT id FROM companies WHERE nip = ? AND merged_into_id IS NULL`, nip);
      if (byNip) companyId = byNip.id;
    }
    if (!companyId) {
      const city = d.city?.trim() || null;
      const r = run(
        `INSERT INTO companies (name, nip, website_url, primary_domain, city, voivodeship) VALUES (?, ?, ?, ?, ?, ?)`,
        d.name?.trim() || null, nip, d.url, d.domain, city, voivodeshipFor(city),
      );
      companyId = r.lastInsertRowid;
      created = true;
    } else {
      // uzupełnij brakujące pola
      run(
        `UPDATE companies SET name = COALESCE(name, ?), city = COALESCE(city, ?), nip = COALESCE(nip, ?),
           website_url = COALESCE(website_url, ?), primary_domain = COALESCE(primary_domain, ?), updated_at = ? WHERE id = ?`,
        d.name?.trim() || null, d.city?.trim() || null, nip, d.url, d.domain, nowIso(), companyId,
      );
    }
    if (!dom) {
      const hasPrimary = get(`SELECT 1 FROM domains WHERE company_id = ? AND is_primary = 1`, companyId);
      run(`INSERT INTO domains (domain, company_id, is_primary, start_url) VALUES (?, ?, ?, ?)`, d.domain, companyId, hasPrimary ? 0 : 1, d.url);
    } else if (!dom.company_id) {
      run(`UPDATE domains SET company_id = ? WHERE id = ?`, companyId, dom.id);
    }
    const linked = linkProject(d.projectId, companyId, d.via);
    if (d.source) addSource({ companyId, projectId: d.projectId, ...d.source });
    return { companyId, created, linked };
  });
}

/** Firma bez znanej strony (np. z CSV zawierającego tylko nazwę). Dedup po NIP lub nazwie+mieście. */
export function findOrCreateWithoutWebsite(d: { name: string; city?: string | null; nip?: string | null; projectId?: number | null; source?: DiscoveredCompany['source'] }): UpsertResult | null {
  const nip = normalizeNip(d.nip);
  if (nip && isSuppressed('nip', nip)) return null;
  return tx(() => {
    let row = nip ? get(`SELECT id FROM companies WHERE nip = ? AND merged_into_id IS NULL`, nip) : undefined;
    if (!row) {
      const key = foldPl(d.name);
      row = all(`SELECT id, name, city FROM companies WHERE merged_into_id IS NULL AND name IS NOT NULL AND primary_domain IS NULL`)
        .find((c) => foldPl(c.name) === key && foldPl(c.city ?? '') === foldPl(d.city ?? ''));
    }
    let created = false;
    let companyId: number;
    if (row) companyId = row.id;
    else {
      companyId = run(
        `INSERT INTO companies (name, nip, city, voivodeship, scan_status) VALUES (?, ?, ?, ?, 'no_website')`,
        d.name.trim(), nip, d.city?.trim() || null, voivodeshipFor(d.city),
      ).lastInsertRowid;
      created = true;
    }
    const linked = linkProject(d.projectId, companyId, 'csv');
    if (d.source) addSource({ companyId, projectId: d.projectId, ...d.source });
    return { companyId, created, linked };
  });
}

/** Scala firmę `dropId` do `keepId` (domeny, kontakty, źródła, projekty, lokalizacje). */
export function mergeCompanies(keepId: number, dropId: number, reason: string): number {
  keepId = resolveCompanyId(keepId);
  dropId = resolveCompanyId(dropId);
  if (keepId === dropId) return keepId;
  // zachowaj starszy rekord
  if (keepId > dropId) [keepId, dropId] = [dropId, keepId];
  tx(() => {
    run(`UPDATE domains SET company_id = ?, is_primary = 0 WHERE company_id = ?`, keepId, dropId);
    for (const c of all(`SELECT * FROM contacts WHERE company_id = ?`, dropId)) {
      const ex = get(`SELECT id, confidence FROM contacts WHERE company_id = ? AND kind = ? AND value = ?`, keepId, c.kind, c.value);
      if (ex) {
        run(`INSERT OR IGNORE INTO contact_sightings (contact_id, url, method, seen_at) SELECT ?, url, method, seen_at FROM contact_sightings WHERE contact_id = ?`, ex.id, c.id);
        if (c.confidence > ex.confidence) run(`UPDATE contacts SET confidence = ? WHERE id = ?`, c.confidence, ex.id);
        run(`DELETE FROM contacts WHERE id = ?`, c.id);
      } else {
        run(`UPDATE contacts SET company_id = ?, is_primary = 0 WHERE id = ?`, keepId, c.id);
      }
    }
    run(`UPDATE sources SET company_id = ? WHERE company_id = ?`, keepId, dropId);
    run(`UPDATE OR IGNORE company_locations SET company_id = ? WHERE company_id = ?`, keepId, dropId);
    run(`DELETE FROM company_locations WHERE company_id = ?`, dropId);
    run(`INSERT OR IGNORE INTO project_companies (project_id, company_id, discovered_via, created_at) SELECT project_id, ?, discovered_via, created_at FROM project_companies WHERE company_id = ?`, keepId, dropId);
    // powiązanie scalonego rekordu z projektem zostaje — statystyka „odkryte” vs „unikalne”
    const drop = get(`SELECT * FROM companies WHERE id = ?`, dropId)!;
    run(
      `UPDATE companies SET name = COALESCE(name, ?), nip = COALESCE(nip, ?), city = COALESCE(city, ?), voivodeship = COALESCE(voivodeship, ?),
         phone = COALESCE(phone, ?), website_url = COALESCE(website_url, ?), primary_domain = COALESCE(primary_domain, ?), updated_at = ? WHERE id = ?`,
      drop.name, drop.nip, drop.city, drop.voivodeship, drop.phone, drop.website_url, drop.primary_domain, nowIso(), keepId,
    );
    run(`UPDATE companies SET merged_into_id = ?, updated_at = ? WHERE id = ?`, keepId, nowIso(), dropId);
    run(`UPDATE jobs SET company_id = ? WHERE company_id = ? AND status IN ('done','failed','cancelled')`, keepId, dropId);
    run(`UPDATE jobs SET status = 'cancelled', last_error = ? WHERE company_id = ? AND status IN ('queued','paused')`, `scalono z firmą #${keepId}`, dropId);
    addSource({ companyId: keepId, kind: 'merge', title: `Scalono rekord #${dropId}: ${reason}` });
    refreshPrimaryContacts(keepId);
  });
  return keepId;
}

/** Podłącza domenę (np. po przekierowaniu) do firmy; jeśli należy do innej firmy — scala. */
export function attachDomain(companyId: number, domain: string, url: string): number {
  companyId = resolveCompanyId(companyId);
  const dom = get(`SELECT * FROM domains WHERE domain = ?`, domain);
  if (!dom) {
    run(`INSERT INTO domains (domain, company_id, is_primary, start_url) VALUES (?, ?, 0, ?)`, domain, companyId, url);
    return companyId;
  }
  if (!dom.company_id) {
    run(`UPDATE domains SET company_id = ? WHERE id = ?`, companyId, dom.id);
    return companyId;
  }
  const other = resolveCompanyId(dom.company_id);
  if (other !== companyId) return mergeCompanies(other, companyId, `przekierowanie na domenę ${domain}`);
  return companyId;
}

/** Deduplikacja po zeskanowaniu: NIP oraz wspólny opublikowany adres e-mail. */
export function dedupeAfterScan(companyId: number): number {
  companyId = resolveCompanyId(companyId);
  const c = get(`SELECT * FROM companies WHERE id = ?`, companyId);
  if (!c) return companyId;
  if (c.nip) {
    const other = get(`SELECT id FROM companies WHERE nip = ? AND id != ? AND merged_into_id IS NULL ORDER BY id LIMIT 1`, c.nip, companyId);
    if (other) companyId = mergeCompanies(other.id, companyId, `ten sam NIP ${c.nip}`);
  }
  const primary = get(`SELECT value FROM contacts WHERE company_id = ? AND kind = 'email' AND is_primary = 1`, companyId);
  if (primary) {
    const other = get(
      `SELECT ct.company_id AS id FROM contacts ct JOIN companies co ON co.id = ct.company_id
       WHERE ct.kind = 'email' AND ct.value = ? AND ct.is_primary = 1 AND ct.company_id != ? AND co.merged_into_id IS NULL LIMIT 1`,
      primary.value, companyId,
    );
    if (other) companyId = mergeCompanies(other.id, companyId, `ten sam główny e-mail ${primary.value}`);
  }
  return companyId;
}

// ---------------- Kontakty ----------------
export interface ContactInput {
  kind: 'email' | 'phone' | 'form';
  value: string;
  sourceUrl: string;
  method: string;
  category?: EmailCategory | string | null;
  confidence: number;
  context?: string;
  isPersonal?: boolean;
  businessContact?: boolean;
}

export function upsertContact(companyId: number, c: ContactInput): number | null {
  if (c.kind === 'email' && isSuppressed('email', c.value)) return null;
  const now = nowIso();
  const ex = get(`SELECT * FROM contacts WHERE company_id = ? AND kind = ? AND value = ?`, companyId, c.kind, c.value);
  let id: number;
  if (ex) {
    id = ex.id;
    const better = c.confidence > ex.confidence;
    run(
      `UPDATE contacts SET verified_at = ?, status = 'active',
         confidence = MAX(confidence, ?),
         source_url = CASE WHEN ? THEN ? ELSE source_url END,
         method = CASE WHEN ? THEN ? ELSE method END,
         category = COALESCE(?, category),
         context = CASE WHEN ? THEN ? ELSE context END
       WHERE id = ?`,
      now, c.confidence, better, c.sourceUrl, better, c.method, c.category ?? null, better, c.context ?? null, id,
    );
  } else {
    id = run(
      `INSERT INTO contacts (company_id, kind, value, source_url, method, category, confidence, context, is_personal, first_seen_at, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      companyId, c.kind, c.value, c.sourceUrl, c.method, c.category ?? null, c.confidence, c.context?.slice(0, 300) ?? null, !!c.isPersonal, now, now,
    ).lastInsertRowid;
  }
  run(`INSERT OR REPLACE INTO contact_sightings (contact_id, url, method, seen_at) VALUES (?, ?, ?, ?)`, id, c.sourceUrl, c.method, now);
  // przechowujemy flagę "kontakt biznesowy" w kontekście kategorii osobistych
  if (c.kind === 'email' && c.category === 'personal' && c.businessContact) {
    run(`UPDATE contacts SET context = '[kontakt biznesowy] ' || IFNULL(context,'') WHERE id = ? AND IFNULL(context,'') NOT LIKE '[kontakt biznesowy]%'`, id);
  }
  return id;
}

/** Oznacza kontakty nieodnalezione podczas pełnego ponownego skanu jako nieaktualne. */
export function markStaleContacts(companyId: number, seenSince: string): void {
  run(`UPDATE contacts SET status = 'stale', is_primary = 0 WHERE company_id = ? AND verified_at < ? AND kind != 'form'`, companyId, seenSince);
}

export function refreshPrimaryContacts(companyId: number): void {
  const emails = all(`SELECT * FROM contacts WHERE company_id = ? AND kind = 'email' AND status = 'active'`, companyId).map((e) => ({
    ...e,
    email: e.value as string,
    businessContact: String(e.context ?? '').startsWith('[kontakt biznesowy]'),
  }));
  const best = choosePrimaryEmail(emails as any) as any;
  run(`UPDATE contacts SET is_primary = 0 WHERE company_id = ? AND kind IN ('email','phone')`, companyId);
  if (best) run(`UPDATE contacts SET is_primary = 1 WHERE id = ?`, best.id);
  const phone = get(`SELECT * FROM contacts WHERE company_id = ? AND kind = 'phone' AND status = 'active' ORDER BY confidence DESC, id LIMIT 1`, companyId);
  if (phone) run(`UPDATE contacts SET is_primary = 1 WHERE id = ?`, phone.id);
  const form = get(`SELECT * FROM contacts WHERE company_id = ? AND kind = 'form' AND status = 'active' ORDER BY confidence DESC, id LIMIT 1`, companyId);
  const status = best ? 'email' : form ? 'form_only' : 'none';
  run(
    `UPDATE companies SET primary_email = ?, primary_email_source = ?, phone = COALESCE(?, phone), contact_form_url = ?, contact_status = ?, updated_at = ? WHERE id = ?`,
    best?.value ?? null, best?.source_url ?? null, phone?.value ?? null, form?.value ?? null, status, nowIso(), companyId,
  );
}

export function addLocation(companyId: number, l: { city: string; postalCode?: string | null; address?: string | null; sourceUrl?: string }): void {
  run(
    `INSERT OR IGNORE INTO company_locations (company_id, city, postal_code, voivodeship, address, source_url) VALUES (?, ?, ?, ?, ?, ?)`,
    companyId, l.city, l.postalCode ?? null, voivodeshipFor(l.city, l.postalCode), l.address?.slice(0, 200) ?? null, l.sourceUrl ?? null,
  );
}

export function isFreemail(email: string): boolean {
  return FREEMAIL.has(email.split('@')[1] ?? '');
}

export function companyDomains(companyId: number): Row[] {
  return all(`SELECT * FROM domains WHERE company_id = ? ORDER BY is_primary DESC, id`, companyId);
}
