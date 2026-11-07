// Ekstrakcja danych kontaktowych i sygnałów z HTML strony.

import * as cheerio from 'cheerio';
import { parse as parseDomain } from 'tldts';
import type { AnyNode, Element } from 'domhandler';
import {
  EMAIL_RE, cleanEmail, decodeCfEmail, deobfuscate, isValidEmail, type EmailHit, type EmailMethod,
} from './emails.ts';
import { registrableDomain } from '../util/domain.ts';
import { normalizeNip, normalizePlPhone } from '../util/polish.ts';

export interface PhoneHit { phone: string; method: 'tel' | 'text' | 'jsonld'; context: string }
export interface AddressHit { postalCode: string; city: string; raw: string }
export interface FormHit { action: string; fields: string[] }

export interface PageExtraction {
  url: string;
  title: string;
  description: string;
  siteName: string;
  headings: string[];
  emails: EmailHit[];
  phones: PhoneHit[];
  contactForms: FormHit[];
  links: Array<{ url: string; text: string }>;
  jsonld: { names: string[]; types: string[] };
  nips: string[];
  addresses: AddressHit[];
  text: string;
  textLength: number;
  needsJs: boolean;
  challenge: boolean;
  signals: {
    configuratorLinks: string[];
    configuratorScripts: string[];
    iframes: string[];
    scriptCount: number;
  };
}

const BLOCK = new Set([
  'p', 'div', 'li', 'ul', 'ol', 'tr', 'td', 'th', 'table', 'tbody', 'thead', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section',
  'article', 'header', 'footer', 'nav', 'aside', 'main', 'address', 'blockquote', 'dd', 'dt', 'dl', 'form', 'fieldset',
  'figure', 'figcaption', 'pre', 'hr', 'option', 'select', 'label', 'button',
]);
const SPACED_INLINE = new Set(['a', 'img', 'input', 'textarea', 'small', 'strong', 'b', 'em', 'i']);
const DROP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe', 'object', 'head']);

/** Tekst z zachowaniem granic bloków (żeby sąsiednie elementy nie sklejały się w fałszywe adresy). */
function blockText(node: AnyNode, out: string[]): void {
  if (node.type === 'text') {
    out.push((node as any).data as string);
    return;
  }
  if (node.type !== 'tag' && node.type !== 'root') return;
  const el = node as Element;
  const name = el.name?.toLowerCase();
  if (name && DROP.has(name)) return;
  if (name === 'br') {
    out.push('\n');
    return;
  }
  const block = name ? BLOCK.has(name) : false;
  const spaced = name ? SPACED_INLINE.has(name) : false;
  if (block) out.push('\n');
  else if (spaced) out.push(' ');
  for (const c of el.children ?? []) blockText(c, out);
  if (block) out.push('\n');
  else if (spaced) out.push(' ');
}

function textOf($: cheerio.CheerioAPI, el: cheerio.Cheerio<AnyNode>): string {
  const out: string[] = [];
  el.each((_, n) => blockText(n, out));
  return out.join('').replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

/** Przycina domenę adresu do poprawnego sufiksu publicznego (np. "firma.pl.zapraszamy" -> "firma.pl"). */
function fixDomain(email: string, original: string): string | null {
  let [local, domain] = email.split('@');
  if (!domain) return null;
  // przejście z małej na wielką literę w oryginale oznacza sklejenie z kolejnym słowem
  const origDomain = original.split('@')[1] ?? '';
  const m = origDomain.match(/^(.*?[a-z0-9])(?=[A-Z][a-z])/);
  if (m && m[1].includes('.')) domain = m[1].toLowerCase();
  const labels = domain.split('.');
  while (labels.length >= 2) {
    const d = labels.join('.');
    const p = parseDomain(d);
    const tld = labels[labels.length - 1];
    if ((p.isIcann && p.domain) || tld === 'test') return `${local}@${d}`;
    labels.pop();
  }
  return null;
}

function emailsFrom(text: string): Array<{ email: string; index: number }> {
  const out: Array<{ email: string; index: number }> = [];
  for (const m of text.matchAll(EMAIL_RE)) {
    const fixed = fixDomain(cleanEmail(m[0]), m[0].replace(/[.,;:)\]>]+$/, ''));
    if (fixed && isValidEmail(fixed)) out.push({ email: fixed, index: m.index ?? 0 });
  }
  return out;
}

function around(text: string, index: number, len = 110): string {
  return text.slice(Math.max(0, index - len), index + len).replace(/\s+/g, ' ').trim();
}

const PHONE_TEXT_RE = /(?:tel(?:efon)?\.?|kom(?:órka)?\.?|mob(?:ile)?\.?|phone|☎|📞|t\.)\s*[:.]?\s*((?:\+|00)?\s?48[\s-]?)?(\(?\d{2,3}\)?[\s-]?\d{3}[\s-]?\d{2,3}[\s-]?\d{2,3})/gi;
const PHONE_INTL_RE = /\+48[\s-]?\d{2,3}[\s-]?\d{3}[\s-]?\d{2,3}[\s-]?\d{0,3}/g;
const POSTAL_RE = /\b(\d{2}-\d{3})\s+([A-ZŁŚŻŹĆŃÓĘĄ][a-ząćęłńóśźż]+(?:[\s-][A-ZŁŚŻŹĆŃÓĘĄ][a-ząćęłńóśźż]+){0,2})/g;
const NIP_RE = /NIP\s*(?:\/\s*VAT(?:-UE)?)?\s*[:.\-]?\s*(?:PL\s?)?(\d[\d\s-]{8,14}\d)/gi;

const CHALLENGE_RE = /(cf-chl|challenge-platform|just a moment\.\.\.|attention required! \| cloudflare|checking your browser|ddos-guard|captcha-delivery|g-recaptcha.*verify you are human|px-captcha|Access denied \| .* used Cloudflare)/i;

export function detectChallenge(html: string, status?: number, headers?: Record<string, string>): boolean {
  if (headers && (headers['cf-mitigated'] === 'challenge' || headers['x-datadome'])) return true;
  if (status && ![401, 403, 429, 503].includes(status) && html.length > 20000) return false;
  return CHALLENGE_RE.test(html.slice(0, 60000));
}

export function extractPage(html: string, pageUrl: string, opts: { rendered?: boolean } = {}): PageExtraction {
  const $ = cheerio.load(html);
  const site = registrableDomain(pageUrl);
  const hits: EmailHit[] = [];
  const add = (email: string, method: EmailMethod, context: string, inFooter = false) => {
    const fixed = fixDomain(cleanEmail(email), email);
    if (!fixed || !isValidEmail(fixed)) return;
    hits.push({ email: fixed, url: pageUrl, method: opts.rendered && method === 'text' ? 'rendered' : method, context: context.slice(0, 240), inFooter });
  };

  // JSON-LD (zanim usuniemy skrypty)
  const ldNames: string[] = [];
  const ldTypes: string[] = [];
  const ldPhones: string[] = [];
  const ldTax: string[] = [];
  const ldAddresses: AddressHit[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    const walk = (o: any, depth = 0) => {
      if (!o || typeof o !== 'object' || depth > 6) return;
      if (Array.isArray(o)) return o.forEach((x) => walk(x, depth + 1));
      const t = o['@type'];
      const types = Array.isArray(t) ? t : t ? [t] : [];
      const isOrg = types.some((x: string) => /Organization|LocalBusiness|Store|Contractor|HomeAndConstructionBusiness|Corporation|Manufacturer|Business/i.test(String(x)));
      if (isOrg) {
        ldTypes.push(...types.map(String));
        if (typeof o.name === 'string') ldNames.push(o.name.trim());
        if (typeof o.email === 'string') add(o.email, 'jsonld', `JSON-LD ${types.join(',')}: ${o.name ?? ''}`);
        if (typeof o.telephone === 'string') ldPhones.push(o.telephone);
        for (const k of ['taxID', 'vatID']) if (typeof o[k] === 'string') ldTax.push(o[k]);
        const a = o.address;
        if (a && typeof a === 'object' && !Array.isArray(a) && a.postalCode && a.addressLocality) {
          ldAddresses.push({ postalCode: String(a.postalCode).trim(), city: String(a.addressLocality).trim(), raw: [a.streetAddress, a.postalCode, a.addressLocality].filter(Boolean).join(', ') });
        }
      }
      for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, depth + 1);
    };
    walk(data);
  });

  // sygnały skryptów (konfiguratory 3D) i iframe
  const scripts: string[] = [];
  $('script[src]').each((_, el) => { scripts.push(String($(el).attr('src'))); });
  const inlineScripts = $('script:not([src])').map((_, el) => $(el).text()).get().join('\n').slice(0, 200000);
  const configuratorScripts = scripts.filter((s) => /(three(\.min)?\.js|three\.module|babylon|playcanvas|sketchfab|roomle|configurator|konfigurator|model-viewer|verge3d|threekit|zakeke|expivi|vectary|unity(loader|\.loader)|webgl)/i.test(s));
  if (/(new\s+THREE\.|BABYLON\.Engine|<model-viewer|WebGLRenderer)/.test(inlineScripts) || $('model-viewer').length) configuratorScripts.push('inline-webgl');
  const iframes = $('iframe[src]').map((_, el) => String($(el).attr('src'))).get();
  const scriptCount = $('script').length;

  // Cloudflare email protection (przeglądarka dekoduje to dla każdego odwiedzającego)
  $('[data-cfemail]').each((_, el) => {
    const e = decodeCfEmail(String($(el).attr('data-cfemail')));
    if (e) add(e, 'cfemail', textOf($, $(el).parent()));
  });
  $('a[href*="/cdn-cgi/l/email-protection#"]').each((_, el) => {
    const hash = String($(el).attr('href')).split('#')[1] ?? '';
    const e = decodeCfEmail(hash);
    if (e) add(e, 'cfemail', textOf($, $(el).parent()));
  });

  // linki mailto
  const footerEls = $('footer, [class*="footer" i], [id*="footer" i], [class*="stopka" i], [id*="stopka" i]');
  $('a[href^="mailto:" i]').each((_, el) => {
    const href = String($(el).attr('href'));
    let addr = href.replace(/^mailto:/i, '').split('?')[0];
    try {
      addr = decodeURIComponent(addr);
    } catch {
      /* keep */
    }
    const inFooter = $(el).closest('footer, [class*="footer" i], [id*="footer" i], [class*="stopka" i], [id*="stopka" i]').length > 0;
    let ctxEl = $(el).parent();
    for (let i = 0; i < 2 && textOf($, ctxEl).length < 60 && ctxEl.parent().length; i++) ctxEl = ctxEl.parent();
    const ctx = textOf($, ctxEl).slice(0, 300);
    for (const a of addr.split(/[,;]/)) add(a, 'mailto', ctx, inFooter);
  });

  // linki tel:
  const phones: PhoneHit[] = [];
  $('a[href^="tel:" i]').each((_, el) => {
    const p = normalizePlPhone(String($(el).attr('href')).replace(/^tel:/i, ''));
    if (p) phones.push({ phone: p, method: 'tel', context: textOf($, $(el).parent()).slice(0, 160) });
  });
  for (const p of ldPhones) {
    const n = normalizePlPhone(p);
    if (n) phones.push({ phone: n, method: 'jsonld', context: 'JSON-LD' });
  }

  // formularze kontaktowe (z polem wiadomości; pomijamy wyszukiwarki i newslettery)
  const contactForms: FormHit[] = [];
  $('form').each((_, el) => {
    const f = $(el);
    const hasTextarea = f.find('textarea').length > 0;
    const fields = f.find('input[name], textarea[name], select[name]').map((_, i) => String($(i).attr('name'))).get();
    const isSearch = f.attr('role') === 'search' || fields.some((n) => /^(s|q|search|szukaj)$/i.test(n));
    if (hasTextarea && !isSearch) contactForms.push({ action: String(f.attr('action') ?? ''), fields: fields.slice(0, 20) });
  });
  // popularne wtyczki formularzy renderowane później przez JS
  if (!contactForms.length && $('.wpcf7, .wpforms-container, .gform_wrapper, .elementor-form, [class*="contact-form" i], [id*="contact-form" i]').length) {
    contactForms.push({ action: '(widget)', fields: [] });
  }

  // linki wewnętrzne
  const links = new Map<string, string>();
  const configuratorLinks: string[] = [];
  $('a[href]').each((_, el) => {
    const href = String($(el).attr('href')).trim();
    if (!href || /^(mailto:|tel:|javascript:|#|data:|sms:|whatsapp:|skype:)/i.test(href)) return;
    let abs: URL;
    try {
      abs = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (!['http:', 'https:'].includes(abs.protocol)) return;
    abs.hash = '';
    const text = ($(el).text() || $(el).attr('title') || $(el).attr('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (/konfigurator|configurator|zaprojektuj (swoje )?schody|projektant online|kreator schod/i.test(text + ' ' + abs.pathname)) configuratorLinks.push(abs.toString());
    if (registrableDomain(abs.toString()) !== site) return;
    if (!links.has(abs.toString())) links.set(abs.toString(), text);
  });

  // tekst strony
  $('script, style, noscript, template, svg').remove();
  const footerText = textOf($, footerEls);
  const bodyText = textOf($, $('body').length ? $('body') : $.root());
  const deob = deobfuscate(bodyText);

  const seen = new Set(hits.map((h) => h.email));
  for (const { email, index } of emailsFrom(bodyText)) {
    if (seen.has(email)) continue;
    seen.add(email);
    const inFooter = footerText.includes(email) || footerText.toLowerCase().includes(email);
    hits.push({ email, url: pageUrl, method: opts.rendered ? 'rendered' : inFooter ? 'footer' : 'text', context: around(bodyText, index), inFooter });
  }
  if (deob !== bodyText) {
    for (const { email, index } of emailsFrom(deob)) {
      if (seen.has(email)) continue;
      seen.add(email);
      hits.push({ email, url: pageUrl, method: 'obfuscated', context: around(deob, index) });
    }
  }

  // telefony z tekstu
  for (const m of bodyText.matchAll(PHONE_TEXT_RE)) {
    const p = normalizePlPhone((m[1] ?? '') + m[2]);
    if (p) phones.push({ phone: p, method: 'text', context: around(bodyText, m.index ?? 0, 60) });
  }
  for (const m of bodyText.matchAll(PHONE_INTL_RE)) {
    const p = normalizePlPhone(m[0]);
    if (p) phones.push({ phone: p, method: 'text', context: around(bodyText, m.index ?? 0, 60) });
  }

  // NIP i adresy
  const nips = new Set<string>();
  for (const t of ldTax) {
    const n = normalizeNip(t);
    if (n) nips.add(n);
  }
  for (const m of bodyText.matchAll(NIP_RE)) {
    const n = normalizeNip(m[1]);
    if (n) nips.add(n);
  }
  const addresses: AddressHit[] = [...ldAddresses];
  for (const m of bodyText.matchAll(POSTAL_RE)) {
    addresses.push({ postalCode: m[1], city: m[2].trim(), raw: around(bodyText, m.index ?? 0, 60) });
  }

  const title = $('title').first().text().replace(/\s+/g, ' ').trim();
  const headings = $('h1, h2, h3').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean).slice(0, 40);
  const lowText = bodyText.length < 250;
  const jsShell = $('#root, #app, #__next, [ng-app], [data-reactroot], #__nuxt').length > 0;
  const needsJs = (lowText && (scriptCount >= 3 || jsShell)) || /(enable javascript|włącz javascript|wlacz javascript|requires javascript)/i.test(html.slice(0, 50000)) && lowText;

  return {
    url: pageUrl,
    title,
    description: ($('meta[name="description"]').attr('content') ?? '').trim().slice(0, 400),
    siteName: ($('meta[property="og:site_name"]').attr('content') ?? '').trim(),
    headings,
    emails: dedupeHits(hits),
    phones: dedupePhones(phones),
    contactForms,
    links: [...links].map(([url, text]) => ({ url, text })).slice(0, 400),
    jsonld: { names: [...new Set(ldNames)], types: [...new Set(ldTypes)] },
    nips: [...nips],
    addresses: dedupeAddr(addresses),
    text: bodyText.slice(0, 9000),
    textLength: bodyText.length,
    needsJs,
    challenge: detectChallenge(html),
    signals: { configuratorLinks: [...new Set(configuratorLinks)].slice(0, 10), configuratorScripts: [...new Set(configuratorScripts)].slice(0, 10), iframes: iframes.slice(0, 15), scriptCount },
  };
}

function dedupeHits(h: EmailHit[]): EmailHit[] {
  const order: EmailMethod[] = ['mailto', 'jsonld', 'cfemail', 'footer', 'text', 'rendered', 'obfuscated'];
  const m = new Map<string, EmailHit>();
  for (const x of h) {
    const prev = m.get(x.email);
    if (!prev || order.indexOf(x.method) < order.indexOf(prev.method)) {
      m.set(x.email, { ...x, context: prev && prev.context.length > x.context.length ? prev.context : x.context, inFooter: x.inFooter || prev?.inFooter });
    }
  }
  return [...m.values()];
}
function dedupePhones(p: PhoneHit[]): PhoneHit[] {
  const m = new Map<string, PhoneHit>();
  for (const x of p) if (!m.has(x.phone)) m.set(x.phone, x);
  return [...m.values()].slice(0, 10);
}
function dedupeAddr(a: AddressHit[]): AddressHit[] {
  const m = new Map<string, AddressHit>();
  for (const x of a) {
    const k = `${x.postalCode}|${x.city.toLowerCase()}`;
    if (!m.has(k)) m.set(k, x);
  }
  return [...m.values()].slice(0, 10);
}
