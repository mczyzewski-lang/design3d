// Rozpoznawanie, walidacja, kategoryzacja i wybór adresów e-mail.
// Zasada: zapisujemy WYŁĄCZNIE adresy faktycznie opublikowane na stronie. Nic nie zgadujemy.

import { foldPl } from '../util/polish.ts';

export type EmailMethod = 'mailto' | 'text' | 'footer' | 'obfuscated' | 'cfemail' | 'jsonld' | 'rendered';
export type EmailCategory =
  | 'sales' | 'general' | 'customer' | 'personal' | 'other'
  | 'support' | 'complaints' | 'accounting' | 'recruitment' | 'privacy' | 'agency' | 'noreply';

export interface EmailHit {
  email: string;
  url: string;
  method: EmailMethod;
  context: string;
  inFooter?: boolean;
}

export const EMAIL_RE = /[a-z0-9](?:[a-z0-9._%+-]{0,63})@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}/gi;

const BAD_TLDS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'css', 'js', 'ico', 'bmp', 'tif', 'tiff', 'mp4', 'webm', 'woff', 'woff2', 'ttf', 'eot', 'json', 'map', 'php', 'html', 'htm']);
const PLACEHOLDER_DOMAINS = new Set([
  'example.com', 'example.pl', 'example.org', 'domain.com', 'domena.pl', 'twojadomena.pl', 'yourdomain.com', 'email.com',
  'mail.com.example', 'test.com', 'sentry.io', 'sentry-next.wixpress.com', 'wixpress.com', 'sentry.wixpress.com', 'localhost.localdomain',
]);
const PLACEHOLDER_LOCALS = /^(twoj|twój|twojemail|twoj\.email|email|e-mail|adres|name|imie|imię|imie\.nazwisko|jan\.kowalski|jankowalski|user|username|you|your|yourname|example|test|xxx|abc)$/i;

export const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'wp.pl', 'o2.pl', 'onet.pl', 'onet.eu', 'op.pl', 'poczta.onet.pl', 'poczta.fm', 'interia.pl',
  'interia.eu', 'vp.pl', 'tlen.pl', 'gazeta.pl', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com',
  'protonmail.com', 'proton.me', 'go2.pl', 'autograf.pl', 'buziaczek.pl', 'int.pl', 'spoko.pl', 'neostrada.pl',
]);

export function isValidEmail(raw: string): boolean {
  const e = raw.toLowerCase();
  if (e.length > 100) return false;
  const at = e.lastIndexOf('@');
  if (at < 1) return false;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const tld = domain.split('.').pop() ?? '';
  if (BAD_TLDS.has(tld)) return false;
  if (/^\d+x$/.test(local) || /@\dx\./.test(e)) return false; // logo@2x.png
  if (PLACEHOLDER_DOMAINS.has(domain)) return false;
  if (PLACEHOLDER_LOCALS.test(local)) return false;
  if (/^[a-f0-9]{24,}$/.test(local)) return false; // identyfikatory (np. Sentry DSN)
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  return true;
}

export function cleanEmail(raw: string): string {
  return raw.trim().replace(/^mailto:/i, '').replace(/[.,;:)\]>]+$/, '').toLowerCase();
}

/** Wyszukuje adresy w zwykłym tekście. */
export function findEmailsInText(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(EMAIL_RE)) {
    const e = cleanEmail(m[0]);
    if (isValidEmail(e)) out.add(e);
  }
  return [...out];
}

/**
 * Zamienia popularne formy maskowania na zwykłe adresy, np.
 *  biuro [at] firma.pl, biuro(at)firma(dot)pl, biuro (małpa) firma (kropka) pl, biuro at firma dot pl
 */
export function deobfuscate(text: string): string {
  let t = text;
  // znaki @ zapisane słownie w nawiasach
  t = t.replace(/\s*[\[\(\{<]\s*(?:at|@|małpa|malpa|małpka|malpka|monkey)\s*[\]\)\}>]\s*/gi, '@');
  // kropki zapisane słownie w nawiasach
  t = t.replace(/\s*[\[\(\{<]\s*(?:dot|kropka|\.)\s*[\]\)\}>]\s*/gi, '.');
  // wersja bez nawiasów: "biuro małpa firma kropka pl" / "biuro at firma dot pl" — tylko gdy jest też kropka słowna
  t = t.replace(
    /\b([a-z0-9][a-z0-9._%+-]{0,40})\s+(?:at|małpa|malpa)\s+([a-z0-9-]{2,63}(?:\s+(?:dot|kropka)\s+[a-z0-9-]{2,24}){1,3})\b/gi,
    (_m, local: string, dom: string) => `${local}@${dom.replace(/\s+(?:dot|kropka)\s+/gi, '.')}`,
  );
  // "biuro@firma dot pl"
  t = t.replace(/(@[a-z0-9-]{2,63})\s+(?:dot|kropka)\s+([a-z]{2,24})\b/gi, '$1.$2');
  // spacje wokół @: "biuro @ firma.pl"
  t = t.replace(/([a-z0-9._%+-])\s+@\s+([a-z0-9-])/gi, '$1@$2');
  return t;
}

/** Dekoduje adres ukryty mechanizmem "Email Address Obfuscation" Cloudflare (to samo robi przeglądarka odwiedzającego). */
export function decodeCfEmail(hex: string): string | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 4 || hex.length % 2 !== 0) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  try {
    out = decodeURIComponent(escape(out));
  } catch {
    /* ascii */
  }
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/i.test(out) ? out : null;
}

// ---------------- Kategoryzacja ----------------

const LOCAL_RULES: Array<[EmailCategory, RegExp]> = [
  ['noreply', /^(no-?reply|do-?not-?reply|nie-?odpowiadaj|mailer-daemon|postmaster|bounce|abuse|hostmaster)/],
  ['privacy', /^(iod|rodo|gdpr|privacy|abi|dane-?osobowe|daneosobowe|ochrona-?danych|dpo)\b/],
  ['recruitment', /^(praca|rekrutacja|kariera|hr|jobs?|cv|career|careers|staz)\b/],
  ['accounting', /^(faktury?|ksiegowosc|księgowość|finanse|invoices?|billing|platnosci|płatności|rozliczenia|ksiegowa)\b/],
  ['complaints', /^(reklamacje?|complaints?|gwarancja|zwroty)\b/],
  ['support', /^(support|pomoc|admin|administrator|webmaster|it|serwis|service|techniczny|wsparcie)\b/],
  ['sales', /^(oferta|oferty|sprzedaz|sprzedaż|sales|handlowy|handel|dzial\.?handlowy|zamowienia|zamówienia|zamowienie|orders?|wycena|wyceny|zapytania|zapytanie|sklep|shop|projekty|projekt)\b/],
  ['general', /^(biuro|kontakt|office|info|firma|contact|hello|hej|mail|poczta|sekretariat|recepcja|schody|stolarnia|zaklad|zakład|witaj)\b/],
  ['other', /^(marketing|media|pr|press|prasa|reklama|newsletter)\b/],
];

const FIRST_NAMES = new Set(
  ('adam adrian agata agnieszka aleksander aleksandra alicja andrzej anna antoni artur barbara bartek bartosz beata bogdan bozena ' +
    'cezary dagmara damian daniel dariusz dawid dominik dorota edyta elzbieta emil ewa ewelina filip grazyna grzegorz halina hubert ' +
    'irena iwona izabela jacek jakub jan janusz jaroslaw jerzy joanna jolanta jozef julia justyna kamil kamila karol karolina katarzyna ' +
    'kazimierz krystian krystyna krzysztof leszek lukasz maciej magdalena malgorzata marcin marek maria mariusz marta marzena mateusz ' +
    'michal miroslaw monika natalia norbert oliwia patryk patrycja paulina pawel piotr przemek przemyslaw radoslaw rafal renata robert ' +
    'roman ryszard sebastian slawomir stanislaw stefan sylwia szymon tadeusz teresa tomasz urszula wieslaw witold wiktoria wojciech ' +
    'zbigniew zdzislaw zofia zuzanna').split(/\s+/),
);

export function looksPersonal(local: string): boolean {
  const l = foldPl(local);
  const parts = l.split(/[._-]+/).filter(Boolean);
  if (parts.some((p) => FIRST_NAMES.has(p))) return true;
  // j.kowalski / jkowalski — inicjał + nazwisko
  if (/^[a-z]\.[a-z]{3,}$/.test(l)) return true;
  return false;
}

const CTX_RULES: Array<[EmailCategory, RegExp]> = [
  ['agency', /(projekt i wykonanie|wykonanie strony|realizacja strony|strona wykonana|stron[ay] www|created by|design(ed)? by|powered by|agencja interaktywna|projektowanie stron|webdesign)/i],
  ['privacy', /(inspektor[a-z]* ochrony danych|\biod\b|rodo|dane osobowe|danych osobowych|administrator danych)/i],
  ['recruitment', /(rekrutac|oferty pracy|praca u nas|kariera|prześlij cv|przeslij cv)/i],
  ['complaints', /(reklamac|zgłoszenia gwarancyjne|serwis gwarancyjny)/i],
  ['accounting', /(faktur|księgow|ksiegow|rozliczeń|rozliczen)/i],
  ['sales', /(zamówie|zamowie|wycen|ofert|sprzedaż|sprzedaz|dział handlowy|dzial handlowy|zapytani|handlow|doradca|kontakt handlowy)/i],
];

export interface Categorized {
  category: EmailCategory;
  isPersonal: boolean;
  /** dla adresów indywidualnych — czy wskazano je jako kontakt biznesowy */
  businessContact: boolean;
}

export function categorizeEmail(email: string, context: string, siteDomain: string | null): Categorized {
  const [localRaw, domain] = email.split('@');
  const local = foldPl(localRaw);
  const ctx = context ?? '';
  const onSite = !!siteDomain && (domain === siteDomain || domain.endsWith('.' + siteDomain));
  let category: EmailCategory | null = null;
  for (const [cat, re] of LOCAL_RULES) {
    if (re.test(local)) {
      category = cat;
      break;
    }
  }
  const personal = !category && looksPersonal(localRaw);
  const ctxCats = CTX_RULES.filter(([, re]) => re.test(ctx)).map(([c]) => c);

  // adres agencji/twórcy strony w stopce
  if (!onSite && ctxCats.includes('agency') && !FREEMAIL.has(domain)) {
    return { category: 'agency', isPersonal: personal, businessContact: false };
  }
  if (category && !['general', 'other'].includes(category)) {
    return { category, isPersonal: false, businessContact: category === 'sales' };
  }
  // dla ogólnych/nieznanych prefiksów kontekst może doprecyzować przeznaczenie
  const ctxCat = ctxCats.find((c) => c !== 'agency');
  if (ctxCat === 'sales') {
    return { category: personal ? 'personal' : 'sales', isPersonal: personal, businessContact: true };
  }
  if (ctxCat && !category) {
    return { category: ctxCat, isPersonal: personal, businessContact: false };
  }
  if (category) return { category, isPersonal: false, businessContact: category === 'general' };
  if (personal) return { category: 'personal', isPersonal: true, businessContact: /kontakt|tel|telefon|zapraszam|właściciel|wlasciciel/i.test(ctx) };
  return { category: 'customer', isPersonal: false, businessContact: onSite };
}

// ---------------- Pewność i wybór ----------------

const METHOD_BASE: Record<EmailMethod, number> = {
  mailto: 0.9, jsonld: 0.9, footer: 0.85, cfemail: 0.85, text: 0.8, rendered: 0.8, obfuscated: 0.75,
};

export function emailConfidence(opts: {
  email: string;
  method: EmailMethod;
  category: EmailCategory;
  siteDomain: string | null;
  pageType: string;
  sightings: number;
}): number {
  const domain = opts.email.split('@')[1];
  let c = METHOD_BASE[opts.method] ?? 0.7;
  const onSite = !!opts.siteDomain && (domain === opts.siteDomain || domain.endsWith('.' + opts.siteDomain));
  if (onSite) c += 0.08;
  else if (FREEMAIL.has(domain)) c -= 0.08;
  else c -= 0.25;
  if (opts.pageType === 'contact') c += 0.05;
  if (opts.sightings > 1) c += 0.04;
  if (opts.category === 'agency') c = Math.min(c, 0.2);
  if (opts.category === 'noreply') c = Math.min(c, 0.1);
  return Math.round(Math.max(0, Math.min(1, c)) * 100) / 100;
}

const PRIORITY: Record<EmailCategory, number> = {
  sales: 1, general: 2, customer: 3, personal: 4, other: 5,
  support: 7, complaints: 8, accounting: 8, recruitment: 9, privacy: 99, agency: 99, noreply: 99,
};

export interface RankedEmail {
  email: string;
  category: EmailCategory;
  confidence: number;
  businessContact?: boolean;
  isPersonal?: boolean;
}

/** Wybiera najlepszy adres do ogólnego kontaktu handlowego. Zwraca null, jeśli żaden się nie nadaje. */
export function choosePrimaryEmail<T extends RankedEmail>(emails: T[]): T | null {
  const eligible = emails.filter((e) => PRIORITY[e.category] < 99 && e.confidence >= 0.35);
  // adres indywidualny tylko gdy wskazany jako kontakt biznesowy
  const filtered = eligible.filter((e) => e.category !== 'personal' || e.businessContact);
  const pool = filtered.length ? filtered : [];
  pool.sort((a, b) => PRIORITY[a.category] - PRIORITY[b.category] || b.confidence - a.confidence || a.email.localeCompare(b.email));
  return pool[0] ?? null;
}

export const CATEGORY_LABELS: Record<EmailCategory, string> = {
  sales: 'Oferty / zamówienia / wyceny',
  general: 'Ogólny firmowy',
  customer: 'Do zapytań klientów',
  personal: 'Indywidualny',
  other: 'Inny (marketing/media)',
  support: 'Wsparcie techniczne',
  complaints: 'Reklamacje',
  accounting: 'Księgowość',
  recruitment: 'Rekrutacja',
  privacy: 'Ochrona danych (IOD)',
  agency: 'Twórca strony / agencja',
  noreply: 'No-reply / systemowy',
};
