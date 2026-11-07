// Odróżnianie oficjalnych stron firm od katalogów, portali, marketplace'ów i social media.

import { registrableDomain } from '../util/domain.ts';
import { foldPl } from '../util/polish.ts';

/** Domeny, które nie są oficjalnymi stronami firm (katalogi, ogłoszenia, social media, portale). */
export const NON_COMPANY_DOMAINS = new Set([
  'facebook.com', 'instagram.com', 'youtube.com', 'youtu.be', 'linkedin.com', 'pinterest.com', 'pinterest.pl', 'tiktok.com',
  'twitter.com', 'x.com', 'threads.net', 'wikipedia.org', 'google.com', 'google.pl', 'goo.gl', 'bing.com', 'yandex.ru',
  'olx.pl', 'allegro.pl', 'allegrolokalnie.pl', 'ceneo.pl', 'amazon.pl', 'amazon.com', 'amazon.de', 'ebay.com', 'ebay.pl', 'temu.com', 'aliexpress.com',
  'pkt.pl', 'panoramafirm.pl', 'aleo.com', 'oferteo.pl', 'fixly.pl', 'zumi.pl', 'cylex-polska.pl', 'cylex.pl', 'firmy.net',
  'gowork.pl', 'biznesfinder.pl', 'baza-firm.com.pl', 'firmo.pl', 'targeo.pl', 'e-targeo.pl', 'rejestr.io', 'krs-online.com.pl',
  'infoveriti.pl', 'owg.pl', 'regon.info', 'bizraport.pl', 'imsig.pl', 'ceidg.gov.pl', 'biznes.gov.pl', 'teleadreson.pl',
  'muratordom.pl', 'muratorplus.pl', 'murator.pl', 'extradom.pl', 'budujemydom.pl', 'homebook.pl', 'dobrzemieszkaj.pl',
  'urzadzamy.pl', 'zbudujmydom.pl', 'forum.muratordom.pl', 'budowlane.info.pl', 'kb.pl', 'ladnydom.pl', 'architekturaimarketing.pl',
  'otodom.pl', 'morizon.pl', 'gratka.pl', 'sprzedajemy.pl', 'domiporta.pl', 'castorama.pl', 'leroymerlin.pl', 'obi.pl',
  'bricomarche.pl', 'mrowka.com.pl', 'pszczolka.com.pl', 'jysk.pl', 'ikea.com', 'houzz.com', 'houzz.pl', 'remontuj.pl', 'fachowcy.pl',
  'zlecenia.przez.net', 'oferia.pl', 'niezalezna.pl', 'onet.pl', 'wp.pl', 'interia.pl', 'gazeta.pl', 'o2.pl', 'money.pl',
  'trojmiasto.pl', 'gumtree.pl', 'yelp.com', 'tripadvisor.com', 'foursquare.com', 'yellowpages.com', 'europages.com', 'europages.pl',
  'kompass.com', 'opineo.pl', 'opinie.pl', 'reddit.com', 'quora.com', 'wikimapia.org', 'mapy.cz', 'jakdojade.pl', 'zoover.pl',
  'businessinsider.com.pl', 'bankier.pl', 'pracuj.pl', 'olx.com', 'indeed.com', 'praca.pl', 'archiexpo.com', 'archiexpo.pl', 'issuu.com',
  'blogspot.com', 'wordpress.com', 'wix.com', 'canva.site', 'site123.me', 'webwave.me', 'business.site',
]);

const NON_COMPANY_PATTERNS = [/\.gov\.pl$/, /\.edu\.pl$/, /(^|\.)forum\./, /katalog|baza-?firm|ranking|top-?10|najlepsze-firmy|spis-firm|firmy-/];

export function isLikelyCompanySite(url: string): boolean {
  const d = registrableDomain(url);
  if (!d) return false;
  if (NON_COMPANY_DOMAINS.has(d)) return false;
  if (NON_COMPANY_PATTERNS.some((re) => re.test(d))) return false;
  return true;
}

const LEGAL_FORMS = /\b(sp\.? ?z ?o\.? ?o\.?|sp\.? ?j\.?|sp\.? ?k\.?|s\.? ?c\.?|s\.? ?a\.?|spolka|spółka|z ograniczona|odpowiedzialnoscia|komandytowa|jawna|cywilna|pphu|phu|fhu|ppuh|zpu|puh|przedsiebiorstwo|firma|zaklad|zakład|uslugowo|handlowe|produkcyjne)\b/gi;

export function nameTokens(name: string): string[] {
  return foldPl(name.replace(LEGAL_FORMS, ' '))
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !['schody', 'schodow', 'stolarnia', 'stolarstwo', 'produkcja', 'uslugi', 'oraz', 'dla'].includes(t));
}

/** Wybiera z wyników wyszukiwania oficjalną stronę konkretnej firmy (dla importu po nazwie). */
export function pickOfficialSite(name: string, results: Array<{ url: string; title: string; snippet: string }>): string | null {
  const tokens = nameTokens(name);
  let best: { url: string; score: number } | null = null;
  results.forEach((r, i) => {
    if (!isLikelyCompanySite(r.url)) return;
    const d = foldPl(registrableDomain(r.url) ?? '').replace(/[^a-z0-9]/g, '');
    const title = foldPl(r.title);
    let score = 0;
    for (const t of tokens) {
      if (d.includes(t)) score += 3;
      if (title.includes(t)) score += 1;
    }
    score -= i * 0.2;
    if (score >= 2 && (!best || score > best.score)) best = { url: r.url, score };
  });
  return best ? new URL((best as { url: string }).url).origin + '/' : null;
}
