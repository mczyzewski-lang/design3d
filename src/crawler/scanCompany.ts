// Skanowanie firmy tak, jak zrobiłby to klient szukający kontaktu:
// strona główna i stopka -> mailto -> Kontakt -> O nas -> zamówienia/wyceny/oferta -> inne podstrony (gdy brak kontaktu).

import crypto from 'node:crypto';
import { get, run, tx, json, nowIso, parseJson } from '../db/index.ts';
import { config } from '../config.ts';
import { canonicalPageUrl, registrableDomain } from '../util/domain.ts';
import { voivodeshipFor } from '../util/polish.ts';
import { fetchPage, BlockedError, FetchError, RetryLaterError } from './http.ts';
import { assertAllowed, isAllowed, robotsFor, RobotsDisallowedError } from './robots.ts';
import { extractPage, type PageExtraction } from './extract.ts';
import { renderPage, renderingAvailable } from './render.ts';
import { classifyLink, shouldSkipUrl, FALLBACK_CONTACT_PATHS, type PageType } from './links.ts';
import { categorizeEmail, emailConfidence, type EmailHit, type EmailMethod } from './emails.ts';
import {
  addLocation, addSource, attachDomain, dedupeAfterScan, getCompany, isSuppressed, markStaleContacts,
  refreshPrimaryContacts, resolveCompanyId, upsertContact,
} from '../companies/repo.ts';
import { runHeuristic } from '../analysis/service.ts';

export class PausedError extends Error {
  constructor() {
    super('Wstrzymano');
    this.name = 'PausedError';
  }
}

export interface ScanOptions {
  maxPages: number;
  force?: boolean;
  shouldStop?: () => boolean;
  onProgress?: (p: ScanProgress) => void;
  startUrl?: string | null;
  projectId?: number | null;
}

export interface ScanProgress {
  visited: string[];
  emails: number;
  phase: string;
}

export interface ScanResult {
  companyId: number;
  status: string;
  pagesVisited: number;
  pagesFetched: number;
  emails: string[];
  primaryEmail: string | null;
  contactStatus: string;
  rendered: number;
}

interface LoadedPage {
  url: string;
  finalUrl: string;
  type: PageType;
  status: number;
  x: PageExtraction;
  rendered: boolean;
  fromCache: boolean;
}

function savePage(url: string, p: { finalUrl: string; type: string; status: number; rendered: boolean; x: PageExtraction | null; error?: string | null; html?: string }): void {
  const domain = registrableDomain(p.finalUrl) ?? registrableDomain(url) ?? '';
  const hash = p.html ? crypto.createHash('sha1').update(p.html).digest('hex') : null;
  run(
    `INSERT INTO pages (domain, url, final_url, page_type, status_code, rendered, content_hash, title, extracted, error, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET domain = excluded.domain, final_url = excluded.final_url, page_type = excluded.page_type,
       status_code = excluded.status_code, rendered = excluded.rendered, content_hash = excluded.content_hash, title = excluded.title,
       extracted = excluded.extracted, error = excluded.error, fetched_at = excluded.fetched_at`,
    domain, url, p.finalUrl, p.type, p.status, p.rendered, hash, p.x?.title ?? null, p.x ? json(p.x) : null, p.error ?? null, nowIso(),
  );
}

function cachedPage(url: string): LoadedPage | null {
  const r = get(`SELECT * FROM pages WHERE url = ?`, url);
  if (!r) return null;
  const age = Date.now() - Date.parse(r.fetched_at);
  if (age > config.pageCacheHours * 3600_000) return null;
  const x = parseJson<PageExtraction | null>(r.extracted, null);
  if (!x || r.status_code < 200 || r.status_code >= 300) return null;
  return { url, finalUrl: r.final_url ?? url, type: r.page_type, status: r.status_code, x, rendered: !!r.rendered, fromCache: true };
}

function cleanTitleName(title: string, domain: string | null): string | null {
  const generic = /^(strona g[łl][óo]wna|home|start|witamy|witaj|kontakt|o nas|oferta|welcome|główna)$/i;
  const parts = title.split(/\s+[|–—\-:»•]\s+/).map((s) => s.trim()).filter((s) => s && !generic.test(s) && s.length <= 80);
  if (!parts.length) return null;
  const dTok = (domain ?? '').split('.')[0].replace(/-/g, ' ').toLowerCase();
  const match = parts.find((p) => dTok && p.toLowerCase().split(/\s+/).some((w) => w.length > 3 && dTok.includes(w)));
  return match ?? parts[0];
}

/** Czy treść kontaktowa prawdopodobnie pojawia się dopiero po wykonaniu JS (wtedy uruchamiamy Playwright). */
function looksJsDependent(x: PageExtraction): boolean {
  if (x.needsJs) return true;
  if (x.contactForms.some((f) => f.action === '(widget)')) return true; // wtyczka formularza budowana skryptem
  if (x.contactForms.length > 0) return false; // statyczny formularz widoczny dla odwiedzającego
  return x.textLength < 400 && x.signals.scriptCount >= 3;
}

export async function scanCompany(companyIdIn: number, opts: ScanOptions): Promise<ScanResult> {
  let companyId = resolveCompanyId(companyIdIn);
  const company = getCompany(companyId);
  if (!company) throw new Error(`Firma #${companyIdIn} nie istnieje`);
  const result: ScanResult = { companyId, status: 'pending', pagesVisited: 0, pagesFetched: 0, emails: [], primaryEmail: null, contactStatus: 'unknown', rendered: 0 };

  const primaryDomain = get(`SELECT * FROM domains WHERE company_id = ? ORDER BY is_primary DESC, id LIMIT 1`, companyId);
  const startUrl = opts.startUrl ?? primaryDomain?.final_url ?? primaryDomain?.start_url ?? company.website_url;
  if (company.objection_status === 'objected') {
    result.status = 'skipped_objection';
    return result;
  }
  if (!startUrl) {
    run(`UPDATE companies SET scan_status = 'no_website', updated_at = ? WHERE id = ?`, nowIso(), companyId);
    result.status = 'no_website';
    return result;
  }
  const startDomain = registrableDomain(startUrl)!;
  if (isSuppressed('domain', startDomain)) {
    result.status = 'suppressed';
    return result;
  }
  run(`UPDATE companies SET scan_status = 'scanning', updated_at = ? WHERE id = ?`, nowIso(), companyId);
  const scanStartedAt = nowIso();
  const visited = new Set<string>();
  const pages: LoadedPage[] = [];
  let rendersLeft = 2;
  const stopCheck = () => {
    if (opts.shouldStop?.()) throw new PausedError();
  };
  const progress = (phase: string) =>
    opts.onProgress?.({ visited: [...visited], emails: new Set(pages.flatMap((p) => p.x.emails.map((e) => e.email))).size, phase });

  // ---- robots.txt ----
  const robots = await robotsFor(startUrl);
  if (robots.unreachable) throw new FetchError(`Serwer niedostępny (robots.txt): ${robots.error ?? ''}`);
  if (!(await isAllowed(startUrl))) {
    run(`UPDATE domains SET robots_status = 'disallowed', last_fetched_at = ? WHERE domain = ?`, nowIso(), startDomain);
    run(`UPDATE companies SET scan_status = 'robots_disallowed', scan_error = 'robots.txt nie pozwala na skanowanie strony', last_scanned_at = ?, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), companyId);
    result.status = 'robots_disallowed';
    return result;
  }

  // ---- ładowanie strony (cache -> HTML -> ewentualnie render) ----
  const load = async (rawUrl: string, type: PageType, probe = false): Promise<LoadedPage | null> => {
    const url = canonicalPageUrl(rawUrl);
    if (visited.has(url)) return null;
    visited.add(url);
    result.pagesVisited++;
    if (!opts.force) {
      const c = cachedPage(url);
      if (c) {
        c.type = type === 'home' ? 'home' : c.type ?? type;
        pages.push(c);
        return c;
      }
    }
    try {
      const r = await fetchPage(url, { checkAllowed: assertAllowed });
      result.pagesFetched++;
      const finalCanon = canonicalPageUrl(r.finalUrl);
      if (finalCanon !== url) {
        if (visited.has(finalCanon) && type !== 'home') return null;
        visited.add(finalCanon);
      }
      if (r.status < 200 || r.status >= 300) {
        savePage(url, { finalUrl: r.finalUrl, type, status: r.status, rendered: false, x: null, error: `HTTP ${r.status}` });
        if (type === 'home') throw new FetchError(`Strona główna zwróciła HTTP ${r.status}`, r.status);
        return null;
      }
      const x = extractPage(r.body, r.finalUrl);
      if (x.challenge) throw new BlockedError(r.finalUrl, 'strona weryfikacji (CAPTCHA/challenge)');
      savePage(url, { finalUrl: r.finalUrl, type, status: r.status, rendered: false, x, html: r.body });
      const lp: LoadedPage = { url, finalUrl: r.finalUrl, type, status: r.status, x, rendered: false, fromCache: false };
      pages.push(lp);
      return lp;
    } catch (e) {
      if (e instanceof RobotsDisallowedError) {
        savePage(url, { finalUrl: url, type, status: 0, rendered: false, x: null, error: 'robots.txt' });
        if (type === 'home') throw e;
        return null;
      }
      if (type === 'home' || e instanceof RetryLaterError) throw e;
      if (e instanceof BlockedError) throw e;
      if (!probe) savePage(url, { finalUrl: url, type, status: (e as FetchError).status ?? 0, rendered: false, x: null, error: (e as Error).message });
      return null;
    }
  };

  const render = async (lp: LoadedPage): Promise<void> => {
    if (rendersLeft <= 0 || lp.rendered || !renderingAvailable()) return;
    rendersLeft--;
    const r = await renderPage(lp.finalUrl).catch((e) => {
      console.warn('[render]', lp.finalUrl, (e as Error).message);
      return null;
    });
    if (!r || r.status >= 400) return;
    if (r.challenge) throw new BlockedError(lp.finalUrl, 'challenge po renderowaniu');
    if (registrableDomain(r.finalUrl) !== registrableDomain(lp.finalUrl) && !(await isAllowed(r.finalUrl))) return;
    result.rendered++;
    const x = extractPage(r.html, lp.finalUrl, { rendered: true });
    // zachowaj adresy znalezione już w zwykłym HTML (z ich dokładniejszą metodą)
    const known = new Map(lp.x.emails.map((e) => [e.email, e]));
    // adresy widoczne dopiero po wykonaniu JS oznaczamy jako „rendered” (pierwotny sposób zostaje w kontekście)
    const fresh = x.emails.filter((e) => !known.has(e.email)).map((e) => ({ ...e, method: 'rendered' as EmailMethod, context: `[${e.method}] ${e.context}` }));
    x.emails = [...lp.x.emails, ...fresh];
    x.links = [...new Map([...lp.x.links, ...x.links].map((l) => [l.url, l])).values()];
    lp.x = x;
    lp.rendered = true;
    savePage(lp.url, { finalUrl: lp.finalUrl, type: lp.type, status: r.status, rendered: true, x, html: r.html });
  };

  // ---- 1. strona główna ----
  progress('home');
  const home = await load(startUrl, 'home');
  if (!home) throw new FetchError('Nie udało się pobrać strony głównej');
  const finalDomain = registrableDomain(home.finalUrl)!;
  const siteOrigin = new URL(home.finalUrl).origin;
  run(
    `UPDATE domains SET alive = 1, http_status = ?, final_url = ?, robots_status = 'allowed', last_fetched_at = ?, redirects_to = ? WHERE domain = ?`,
    home.status, siteOrigin + '/', nowIso(), finalDomain !== startDomain ? finalDomain : null, startDomain,
  );
  if (finalDomain !== startDomain) {
    // przekierowanie na właściwą domenę — podłącz/scal
    companyId = attachDomain(companyId, finalDomain, home.finalUrl);
    run(`UPDATE domains SET alive = 1, http_status = ?, final_url = ?, robots_status = 'allowed', last_fetched_at = ? WHERE domain = ?`, home.status, siteOrigin + '/', nowIso(), finalDomain);
    run(`UPDATE companies SET primary_domain = ?, website_url = ?, updated_at = ? WHERE id = ?`, finalDomain, siteOrigin + '/', nowIso(), companyId);
    result.companyId = companyId;
  } else {
    run(`UPDATE companies SET website_url = ?, primary_domain = COALESCE(primary_domain, ?), updated_at = ? WHERE id = ?`, siteOrigin + '/', finalDomain, nowIso(), companyId);
  }
  if (home.x.needsJs) await render(home);
  stopCheck();

  // ---- 2. kolejka podstron według priorytetu ----
  const candidates = new Map<string, { url: string; type: PageType; score: number }>();
  const addLinks = (lp: LoadedPage) => {
    for (const l of lp.x.links) {
      const u = canonicalPageUrl(l.url);
      if (visited.has(u) || shouldSkipUrl(u) || registrableDomain(u) !== finalDomain) continue;
      const { type, score } = classifyLink(u, l.text);
      if (score <= 0) continue;
      const prev = candidates.get(u);
      if (!prev || prev.score < score) candidates.set(u, { url: u, type, score });
    }
  };
  addLinks(home);
  if (![...candidates.values()].some((c) => c.type === 'contact')) {
    for (const p of FALLBACK_CONTACT_PATHS) candidates.set(siteOrigin + p, { url: siteOrigin + p, type: 'contact', score: 90 - FALLBACK_CONTACT_PATHS.indexOf(p) });
  }

  const emailCount = () => new Set(pages.flatMap((p) => p.x.emails.map((e) => e.email))).size;
  const quotas: Record<string, number> = { contact: 2, about: 1, offer: 1, gallery: 1, other: 1 };
  const next = (phaseB: boolean) => {
    const sorted = [...candidates.values()].filter((c) => !visited.has(c.url)).sort((a, b) => b.score - a.score);
    if (!phaseB) return sorted.find((c) => (quotas[c.type] ?? 0) > 0) ?? null;
    return sorted[0] ?? null;
  };

  let fallbackContactFound = false;
  while (result.pagesVisited < opts.maxPages) {
    stopCheck();
    const phaseB = emailCount() === 0;
    let c = next(false);
    if (!c && phaseB) c = next(true);
    if (!c) break;
    candidates.delete(c.url);
    const isFallback = FALLBACK_CONTACT_PATHS.some((p) => c!.url === siteOrigin + p);
    if (isFallback && fallbackContactFound) continue;
    if (quotas[c.type] !== undefined) quotas[c.type]--;
    progress(c.type);
    const lp = await load(c.url, c.type, isFallback);
    if (!lp) continue;
    if (isFallback) fallbackContactFound = true;
    addLinks(lp);
    // strona kontaktowa bez adresu, a treść wygląda na ładowaną przez JS -> renderuj
    if (lp.type === 'contact' && lp.x.emails.length === 0 && looksJsDependent(lp.x)) await render(lp);
  }
  stopCheck();
  // brak jakiegokolwiek adresu — spróbuj jeszcze wyrenderować stronę główną (np. stopka wstawiana skryptem)
  if (emailCount() === 0 && !home.rendered && home.x.signals.scriptCount > 3) await render(home);

  // ---- 3. agregacja i zapis ----
  progress('saving');
  const site = finalDomain;
  type Agg = { hits: Array<EmailHit & { pageType: PageType }> };
  const emails = new Map<string, Agg>();
  for (const p of pages) {
    for (const h of p.x.emails) {
      const a = emails.get(h.email) ?? { hits: [] };
      a.hits.push({ ...h, url: p.finalUrl, pageType: p.type });
      emails.set(h.email, a);
    }
  }
  const methodRank: EmailMethod[] = ['mailto', 'jsonld', 'cfemail', 'footer', 'text', 'rendered', 'obfuscated'];
  const typeRank: PageType[] = ['contact', 'home', 'about', 'offer', 'other', 'gallery', 'legal'];

  tx(() => {
    for (const [email, agg] of emails) {
      const hits = agg.hits.sort((a, b) => typeRank.indexOf(a.pageType) - typeRank.indexOf(b.pageType) || methodRank.indexOf(a.method) - methodRank.indexOf(b.method));
      const best = hits[0];
      const ctx = hits.map((h) => h.context).join(' | ').slice(0, 600);
      const cat = categorizeEmail(email, ctx, site);
      const conf = emailConfidence({ email, method: best.method, category: cat.category, siteDomain: site, pageType: best.pageType, sightings: new Set(hits.map((h) => h.url)).size });
      for (const h of hits.slice().reverse()) {
        upsertContact(companyId, {
          kind: 'email', value: email, sourceUrl: h.url, method: h.inFooter && h.method === 'text' ? 'footer' : h.method,
          category: cat.category, confidence: h === best ? conf : Math.min(conf, conf - 0.01), context: best.context,
          isPersonal: cat.isPersonal, businessContact: cat.businessContact,
        });
      }
    }
    // telefony
    const phones = new Map<string, { url: string; method: string; type: PageType }>();
    for (const p of pages.sort((a, b) => typeRank.indexOf(a.type) - typeRank.indexOf(b.type))) {
      for (const ph of p.x.phones) if (!phones.has(ph.phone)) phones.set(ph.phone, { url: p.finalUrl, method: ph.method, type: p.type });
    }
    [...phones].slice(0, 5).forEach(([phone, s], i) => {
      upsertContact(companyId, { kind: 'phone', value: phone, sourceUrl: s.url, method: s.method, confidence: (s.method === 'text' ? 0.7 : 0.9) - i * 0.02, category: 'general' });
    });
    // formularz kontaktowy
    const formPage = pages.filter((p) => p.x.contactForms.length).sort((a, b) => typeRank.indexOf(a.type) - typeRank.indexOf(b.type))[0];
    if (formPage) upsertContact(companyId, { kind: 'form', value: formPage.finalUrl, sourceUrl: formPage.finalUrl, method: 'form', confidence: 0.8, category: 'general' });

    // NIP (najczęstszy, z sumą kontrolną)
    const nipCount = new Map<string, number>();
    for (const p of pages) for (const n of p.x.nips) nipCount.set(n, (nipCount.get(n) ?? 0) + 1);
    const nip = [...nipCount].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    // lokalizacje (oddziały)
    const addrPages = pages.sort((a, b) => typeRank.indexOf(a.type) - typeRank.indexOf(b.type));
    let firstCity: string | null = null;
    let firstPostal: string | null = null;
    for (const p of addrPages) {
      for (const a of p.x.addresses) {
        addLocation(companyId, { city: a.city, postalCode: a.postalCode, address: a.raw, sourceUrl: p.finalUrl });
        if (!firstCity) {
          firstCity = a.city;
          firstPostal = a.postalCode;
        }
      }
    }
    const nameGuess = home.x.jsonld.names[0] || home.x.siteName || cleanTitleName(home.x.title, site);
    const cur = getCompany(companyId)!;
    run(
      `UPDATE companies SET name = COALESCE(name, ?), nip = COALESCE(nip, ?), city = COALESCE(city, ?), voivodeship = COALESCE(voivodeship, ?),
         scan_status = 'done', scan_error = NULL, last_scanned_at = ?, next_reverify_at = ?, updated_at = ? WHERE id = ?`,
      nameGuess || null, nip && !isSuppressed('nip', nip) ? nip : null, firstCity, voivodeshipFor(cur.city ?? firstCity, cur.city ? null : firstPostal),
      nowIso(), new Date(Date.now() + config.reverifyDays * 86400_000).toISOString(), nowIso(), companyId,
    );
    if (cur.voivodeship == null && cur.city) run(`UPDATE companies SET voivodeship = ? WHERE id = ? AND voivodeship IS NULL`, voivodeshipFor(cur.city, firstPostal), companyId);
    if (opts.force) markStaleContacts(companyId, scanStartedAt); // ponowna weryfikacja: adresy, których już nie ma, oznacz jako nieaktualne
    refreshPrimaryContacts(companyId);
    addSource({ companyId, projectId: opts.projectId, kind: 'crawl', url: home.finalUrl, title: `Skan: ${pages.length} podstron`, snippet: pages.map((p) => p.finalUrl).join(' ').slice(0, 500) });
  });

  companyId = dedupeAfterScan(companyId);
  runHeuristic(companyId);
  const fin = getCompany(companyId)!;
  result.companyId = companyId;
  result.status = 'done';
  result.emails = [...emails.keys()];
  result.primaryEmail = fin.primary_email;
  result.contactStatus = fin.contact_status;
  return result;
}
