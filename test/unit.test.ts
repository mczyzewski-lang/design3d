import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPage } from '../src/crawler/extract.ts';
import { categorizeEmail, choosePrimaryEmail, decodeCfEmail, deobfuscate, emailConfidence, findEmailsInText, isValidEmail } from '../src/crawler/emails.ts';
import { classifyLink } from '../src/crawler/links.ts';
import { isLikelyCompanySite, pickOfficialSite } from '../src/discovery/officialSite.ts';
import { parseCsv } from '../src/discovery/csvImport.ts';
import { generateQueries } from '../src/projects/projects.ts';
import { normalizeNip, normalizePlPhone, voivodeshipFor } from '../src/util/polish.ts';
import { registrableDomain } from '../src/util/domain.ts';
import { heuristicAnalysis } from '../src/analysis/heuristic.ts';
import { leadScore } from '../src/analysis/score.ts';

test('deobfuskacja popularnych form zapisu adresu', () => {
  const cases: Array<[string, string]> = [
    ['biuro [at] firma.pl', 'biuro@firma.pl'],
    ['biuro(at)firma(dot)pl', 'biuro@firma.pl'],
    ['biuro (małpa) firma (kropka) pl', 'biuro@firma.pl'],
    ['kontakt at schody-nowak dot com dot pl', 'kontakt@schody-nowak.com.pl'],
    ['biuro @ firma.pl', 'biuro@firma.pl'],
    ['oferta{at}firma[dot]pl', 'oferta@firma.pl'],
  ];
  for (const [input, expected] of cases) assert.deepEqual(findEmailsInText(deobfuscate(input)), [expected], input);
  // zwykłe zdanie z "at" nie może tworzyć adresu
  assert.deepEqual(findEmailsInText(deobfuscate('Meet us at home today')), []);
});

test('odrzuca pseudo-adresy (pliki graficzne, placeholdery, identyfikatory)', () => {
  for (const bad of ['logo@2x.png', 'twoj@email.pl', 'jan.kowalski@example.com', 'a3f5c2d1e4b6a7c8d9e0f1a2b3c4d5e6@sentry.wixpress.com', 'img@3x.webp']) {
    assert.equal(isValidEmail(bad), false, bad);
  }
  assert.equal(isValidEmail('biuro@schody.pl'), true);
});

test('dekodowanie Cloudflare email obfuscation', () => {
  const key = 0x42;
  const email = 'kontakt@schody.pl';
  const hex = key.toString(16) + [...email].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, '0')).join('');
  assert.equal(decodeCfEmail(hex), email);
});

test('ekstrakcja: mailto, tekst, stopka, JSON-LD, NIP, telefony, formularz, brak sklejania sąsiednich elementów', () => {
  const html = `<html><head><title>Firma</title><script type="application/ld+json">{"@type":"LocalBusiness","name":"Schody X","email":"biuro@schody-x.pl","address":{"postalCode":"30-001","addressLocality":"Kraków"}}</script></head>
  <body><p>Tel</p><p>oferta@schody-x.pl</p><a href="mailto:a@schody-x.pl">a@schody-x.pl</a><a href="mailto:b@schody-x.pl">b@schody-x.pl</a>
  <p>info@schody-x.pl.Zapraszamy</p><footer>NIP 526-104-08-28 · tel. +48 600 700 800</footer><form><textarea name="m"></textarea></form>
  <form role="search"><input name="s"></form></body></html>`;
  const x = extractPage(html, 'https://www.schody-x.pl/');
  const emails = Object.fromEntries(x.emails.map((e) => [e.email, e.method]));
  assert.deepEqual(Object.keys(emails).sort(), ['a@schody-x.pl', 'b@schody-x.pl', 'biuro@schody-x.pl', 'info@schody-x.pl', 'oferta@schody-x.pl']);
  assert.equal(emails['a@schody-x.pl'], 'mailto');
  assert.equal(emails['biuro@schody-x.pl'], 'jsonld');
  assert.deepEqual(x.nips, ['5261040828']);
  assert.equal(x.phones[0].phone, '+48 600 700 800');
  assert.equal(x.contactForms.length, 1);
  assert.equal(x.addresses[0].city, 'Kraków');
  assert.equal(x.jsonld.names[0], 'Schody X');
});

test('kategoryzacja e-maili i wybór głównego adresu handlowego', () => {
  const site = 'schody.pl';
  const mk = (email: string, ctx = '', method: any = 'mailto') => {
    const c = categorizeEmail(email, ctx, site);
    return { email, ...c, confidence: emailConfidence({ email, method, category: c.category, siteDomain: site, pageType: 'contact', sightings: 1 }) };
  };
  assert.equal(mk('praca@schody.pl').category, 'recruitment');
  assert.equal(mk('reklamacje@schody.pl').category, 'complaints');
  assert.equal(mk('faktury@schody.pl').category, 'accounting');
  assert.equal(mk('iod@schody.pl').category, 'privacy');
  assert.equal(mk('biuro@schody.pl').category, 'general');
  assert.equal(mk('biuro@schody.pl', 'Zamówienia i wyceny: biuro@schody.pl').category, 'sales');
  assert.equal(mk('hello@agencja.pl', 'Projekt i wykonanie strony: agencja').category, 'agency');
  assert.equal(mk('jan.nowak@schody.pl').category, 'personal');

  const pool = [mk('praca@schody.pl'), mk('reklamacje@schody.pl'), mk('biuro@schody.pl'), mk('oferta@schody.pl'), mk('iod@schody.pl')];
  assert.equal(choosePrimaryEmail(pool)?.email, 'oferta@schody.pl');
  // gdy brak lepszego — adres reklamacyjny jest dopuszczalny, IOD nigdy
  assert.equal(choosePrimaryEmail([mk('iod@schody.pl'), mk('reklamacje@schody.pl')])?.email, 'reklamacje@schody.pl');
  assert.equal(choosePrimaryEmail([mk('iod@schody.pl'), mk('hello@agencja.pl', 'wykonanie strony')]), null);
  // adres indywidualny tylko gdy wskazany jako kontakt biznesowy
  assert.equal(choosePrimaryEmail([mk('jan.nowak@schody.pl')]), null);
  assert.equal(choosePrimaryEmail([mk('jan.nowak@schody.pl', 'Doradca handlowy: Jan Nowak')])?.email, 'jan.nowak@schody.pl');
  // e-mail z obcej domeny ma niższą pewność niż firmowy
  assert.ok(mk('biuro@schody.pl').confidence > mk('schody@gmail.com').confidence);
});

test('priorytet linków: kontakt > o nas > wycena > galeria', () => {
  const s = (u: string, t: string) => classifyLink(u, t);
  assert.equal(s('https://a.pl/kontakt', 'Kontakt').type, 'contact');
  assert.equal(s('https://a.pl/?page_id=12', 'Kontakt z nami').type, 'contact');
  assert.equal(s('https://a.pl/o-firmie', 'O firmie').type, 'about');
  assert.equal(s('https://a.pl/darmowa-wycena', 'Wycena').type, 'offer');
  assert.ok(s('https://a.pl/kontakt', 'Kontakt').score > s('https://a.pl/o-firmie', 'O firmie').score);
  assert.ok(s('https://a.pl/o-firmie', '').score > s('https://a.pl/galeria', '').score);
  assert.ok(s('https://a.pl/en/contact', 'Contact').score < s('https://a.pl/kontakt', 'Kontakt').score);
});

test('rozpoznawanie oficjalnej strony vs katalogi/portale', () => {
  assert.equal(isLikelyCompanySite('https://www.facebook.com/schodykowalski'), false);
  assert.equal(isLikelyCompanySite('https://www.panoramafirm.pl/schody'), false);
  assert.equal(isLikelyCompanySite('https://allegro.pl/oferta/schody'), false);
  assert.equal(isLikelyCompanySite('https://www.schody-kowalski.pl/'), true);
  const results = [
    { url: 'https://www.panoramafirm.pl/schody/kowalski', title: 'Schody Kowalski – Panorama Firm', snippet: '' },
    { url: 'https://www.facebook.com/schodykowalski', title: 'Schody Kowalski', snippet: '' },
    { url: 'https://www.inne-schody.pl/', title: 'Inne schody', snippet: '' },
    { url: 'https://www.kowalski-schody.pl/oferta', title: 'Kowalski – schody na wymiar', snippet: '' },
  ];
  assert.equal(pickOfficialSite('PPHU Schody Kowalski Sp. z o.o.', results), 'https://www.kowalski-schody.pl/');
  assert.equal(pickOfficialSite('Firma Zupełnie Inna', results), null);
});

test('domeny rejestrowalne i dane polskie', () => {
  assert.equal(registrableDomain('https://sklep.schody-kowalski.com.pl/kontakt'), 'schody-kowalski.com.pl');
  assert.equal(registrableDomain('http://www.firma.waw.pl'), 'firma.waw.pl');
  assert.equal(normalizeNip('PL 778-14-79-112'), '7781479112');
  assert.equal(normalizeNip('1234567890'), null); // zła suma kontrolna
  assert.equal(normalizePlPhone('tel. (61) 852-33-44'), '+48 61 852 33 44');
  assert.equal(normalizePlPhone('0048 600 100 200'), '+48 600 100 200');
  assert.equal(voivodeshipFor('Poznań'), 'wielkopolskie');
  assert.equal(voivodeshipFor('Mała Wieś', '31-200'), 'małopolskie');
});

test('generowanie zapytań: frazy × miasta bez duplikatów', () => {
  const q = generateQueries(['producent schodów', 'Producent schodów '], ['schody drewniane'], ['Poznań', 'Warszawa']);
  assert.deepEqual(q, ['producent schodów', 'schody drewniane Poznań', 'schody drewniane Warszawa']);
});

test('parser CSV: nagłówki PL/EN, separator ; i ,, kolumna bez nagłówka', () => {
  assert.deepEqual(parseCsv('nazwa;strona;miasto\nSchody A;schody-a.pl;Poznań\n'), [{ name: 'Schody A', website: 'schody-a.pl', city: 'Poznań', nip: undefined }]);
  assert.deepEqual(parseCsv('company,website\n"Schody, B",https://b.pl'), [{ name: 'Schody, B', website: 'https://b.pl', city: undefined, nip: undefined }]);
  assert.deepEqual(parseCsv('schody-c.pl\nwww.schody-d.pl'), [{ website: 'schody-c.pl' }, { website: 'www.schody-d.pl' }]);
});

test('klasyfikacja heurystyczna i Lead Score', () => {
  const page = (text: string, title = '', headings: string[] = []) => ({ url: 'https://x.pl/', type: 'home', title, headings, text });
  const maker = heuristicAnalysis([page('Jesteśmy producentem schodów drewnianych. Własna stolarnia, maszyny CNC. Schody na wymiar, schody samonośne, dywanowe, zabiegowe. Montaż. Galeria realizacji. Bezpłatna wycena.', 'Producent schodów', ['Schody drewniane na wymiar'])]);
  assert.equal(maker.category, 'manufacturer_installer');
  assert.ok(maker.stair_types.includes('samonośne'));
  const builder = heuristicAnalysis([page('Firma budowlana. Usługi budowlane, remonty, wykończenia wnętrz, elewacje, dachy, docieplenia, tynki. Wykonujemy też schody betonowe.', 'Budowa domów', ['Remonty'])]);
  assert.equal(builder.category, 'construction');
  const other = heuristicAnalysis([page('Sprzedajemy rowery i części rowerowe.', 'Sklep rowerowy')]);
  assert.equal(other.category, 'unrelated');

  const s1 = leadScore(maker, { websiteAlive: true, contactStatus: 'email' }).score;
  const s2 = leadScore({ ...maker, configurator_quality: 'advanced_3d', has_online_configurator: true }, { websiteAlive: true, contactStatus: 'email' }).score;
  const s3 = leadScore(builder, { websiteAlive: true, contactStatus: 'email' }).score;
  assert.ok(s1 > 75, `producent bez konfiguratora: ${s1}`);
  assert.ok(s2 < s1 - 20, 'konfigurator 3D obniża score');
  assert.ok(s3 < 50, `firma budowlana: ${s3}`);
  assert.equal(leadScore(other, { websiteAlive: true, contactStatus: 'email' }).score, 0);
});
