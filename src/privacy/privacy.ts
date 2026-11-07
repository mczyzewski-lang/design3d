// RODO: sprzeciw, usunięcie danych, rejestr czynności, obowiązek informacyjny (art. 14).

import { all, get, run, tx, json, nowIso } from '../db/index.ts';
import { config } from '../config.ts';
import { addSuppression, resolveCompanyId } from '../companies/repo.ts';

function suppressIdentifiers(companyId: number, reason: 'objection' | 'erasure'): void {
  for (const d of all(`SELECT domain FROM domains WHERE company_id = ?`, companyId)) addSuppression('domain', d.domain, reason);
  for (const e of all(`SELECT value FROM contacts WHERE company_id = ? AND kind = 'email'`, companyId)) addSuppression('email', e.value, reason);
  const c = get(`SELECT nip FROM companies WHERE id = ?`, companyId);
  if (c?.nip) addSuppression('nip', c.nip, reason);
}

/**
 * Sprzeciw wobec przetwarzania i kontaktu: usuwamy dane kontaktowe, zostawiamy minimalny rekord
 * (nazwa + domena) z flagą sprzeciwu oraz hashe identyfikatorów, by nie zbierać ich ponownie.
 */
export function objectCompany(companyIdIn: number, note = ''): void {
  const companyId = resolveCompanyId(companyIdIn);
  tx(() => {
    suppressIdentifiers(companyId, 'objection');
    run(`DELETE FROM contacts WHERE company_id = ?`, companyId);
    run(`DELETE FROM company_locations WHERE company_id = ?`, companyId);
    run(`UPDATE jobs SET status = 'cancelled', last_error = 'sprzeciw' WHERE company_id = ? AND status IN ('queued','paused')`, companyId);
    run(
      `UPDATE companies SET objection_status = 'objected', objection_at = ?, primary_email = NULL, primary_email_source = NULL, phone = NULL,
         contact_form_url = NULL, contact_status = 'none', address = NULL, marketing_consent = 'not_confirmed', next_reverify_at = NULL, updated_at = ? WHERE id = ?`,
      nowIso(), nowIso(), companyId,
    );
    run(`INSERT INTO privacy_log (company_id, action, details) VALUES (?, 'objection', ?)`, companyId, json({ note }));
  });
}

/** Prawo do usunięcia: kasujemy firmę i wszystkie powiązane dane (pozostaje hash na liście wykluczeń). */
export function eraseCompany(companyIdIn: number, action: 'erasure' | 'retention_purge' = 'erasure', suppress = true): void {
  const companyId = resolveCompanyId(companyIdIn);
  tx(() => {
    if (suppress) suppressIdentifiers(companyId, 'erasure');
    const domains = all(`SELECT domain FROM domains WHERE company_id = ?`, companyId).map((d) => d.domain);
    for (const d of domains) run(`DELETE FROM pages WHERE domain = ?`, d);
    run(`DELETE FROM jobs WHERE company_id = ?`, companyId);
    // rekordy wcześniej scalone do tej firmy
    for (const m of all(`SELECT id FROM companies WHERE merged_into_id = ?`, companyId)) run(`DELETE FROM companies WHERE id = ?`, m.id);
    run(`DELETE FROM companies WHERE id = ?`, companyId); // kaskadowo: domeny, kontakty, źródła, lokalizacje, projekty
    run(`INSERT INTO privacy_log (company_id, action, details) VALUES (NULL, ?, ?)`, action, json({ removed_company_id: companyId, domains: domains.length }));
  });
}

export function setMarketingConsent(companyId: number, status: 'not_confirmed' | 'confirmed', note: string): void {
  run(`UPDATE companies SET marketing_consent = ?, updated_at = ? WHERE id = ?`, status, nowIso(), resolveCompanyId(companyId));
  run(`INSERT INTO privacy_log (company_id, action, details) VALUES (?, 'consent_update', ?)`, resolveCompanyId(companyId), json({ status, note }));
}

/** Klauzula informacyjna (art. 14 RODO) — do przekazania przy pierwszym kontakcie z firmą. */
export function informationClause(): string {
  return `Klauzula informacyjna (art. 14 RODO)

1. Administratorem danych jest ${config.dataControllerName}. Kontakt w sprawie danych: ${config.dataControllerContact}.
2. Pozyskaliśmy dane kontaktowe Twojej firmy (nazwa, adres e-mail, telefon, adres strony internetowej, miejscowość) z publicznie dostępnych źródeł — z oficjalnej strony internetowej firmy; dokładny adres podstrony, z której pochodzi dany kontakt, oraz datę pozyskania przechowujemy i udostępnimy na żądanie.
3. Cel: jednorazowy kontakt w sprawie współpracy B2B (oferta konfiguratora 3D), na podstawie prawnie uzasadnionego interesu administratora (art. 6 ust. 1 lit. f RODO). Nie wysyłamy informacji handlowych drogą elektroniczną bez uprzedniej zgody (art. 10 ustawy o świadczeniu usług drogą elektroniczną / art. 172 Prawa telekomunikacyjnego, odpowiednio PKE).
4. Dane przechowujemy nie dłużej niż ${config.retentionDays} dni od ostatniej weryfikacji albo do zgłoszenia sprzeciwu.
5. Przysługuje Ci prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, sprzeciwu wobec przetwarzania oraz skargi do Prezesa UODO.
6. Dane nie są przekazywane poza EOG i nie podlegają zautomatyzowanemu podejmowaniu decyzji wywołującemu skutki prawne.`;
}

export function privacyLog(limit = 200) {
  return all(`SELECT * FROM privacy_log ORDER BY id DESC LIMIT ?`, limit);
}
