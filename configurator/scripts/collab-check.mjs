// E2E współpracy (Playwright): właściciel zapisuje wersje i komentuje w 3D, udostępnia link;
// firma wykonawcza widzi rozmyty projekt, rejestruje się, komentuje; sesja pomija bramkę.
// Użycie: node configurator/scripts/collab-check.mjs http://localhost:3000 ./zrzuty
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? './collab-check';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const ok = (cond, msg) => { if (!cond) { problems.push('✗ ' + msg); console.log('✗', msg); } else console.log('✓', msg); };
async function ctx() {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await c.newPage();
  p.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`[console.error] ${m.text()}`); });
  // błędy HTTP — oczekiwany jest tylko 400 przy celowej próbie rejestracji bez zgody
  p.on('response', (r) => { if (r.status() >= 400 && !(r.status() === 400 && /\/(contractor|quote-request|phone\/verify)$/.test(r.url()))) problems.push(`[http ${r.status()}] ${r.url()}`); });
  return { c, p };
}
const answer = (p, text) => p.once('dialog', (d) => d.accept(text));

// ---- właściciel ----
const { p: o } = await ctx();
await o.goto(`${base}/konfigurator/`, { waitUntil: 'networkidle' });
await o.waitForSelector('canvas'); await o.waitForTimeout(2000);
answer(o, 'Schody — dom Kowalskich');
await o.click('[data-testid="save-menu"]');
await o.click('[data-testid="save"]'); // „Zapisz projekt (bez udostępniania)” w menu ▾
await o.waitForURL(/\?project=/);
ok(/\?project=/.test(o.url()), 'pierwszy zapis tworzy projekt (adres ?project=)');
await o.click('[data-testid="shape-L"]');
await o.click('[data-testid="save-menu"]');
await o.click('[data-testid="save"]');
await o.waitForTimeout(600);
await o.click('[data-testid="save-menu"]');
ok((await o.locator('text=Wersja 1').count()) > 0 && (await o.locator('text=Wersja 2').count()) === 0, 'Zapisz nadpisuje wersję 1 (nadal jedna wersja)');
await o.click('[data-testid="save-menu"]'); // zamknij menu
await o.click('[data-testid="shape-S"]');
await o.click('[data-testid="save-menu"]');
answer(o, 'Wariant spiralny');
await o.click('[data-testid="save-version"]');
await o.waitForTimeout(700);
await o.click('[data-testid="save-menu"]');
ok((await o.locator('text=Wariant spiralny').count()) > 0, 'Zapisz jako nową wersję → druga wersja w menu');
await o.keyboard.press('Escape'); await o.mouse.click(700, 500);
// komentarz 3D: tryb + kliknięcie w model
await o.click('[data-testid="tool-comment"]');
const box = await o.locator('canvas').boundingBox();
let placed = false;
for (const [fx, fy] of [[0.45, 0.55], [0.5, 0.6], [0.4, 0.5], [0.5, 0.75]]) {
  await o.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await o.waitForTimeout(300);
  if (await o.locator('[data-testid="comment-text"]').count()) { placed = true; break; }
}
ok(placed, 'kliknięcie w model ustawia kropkę komentarza');
await o.fill('[data-testid="comment-text"]', 'Czy tu może być szkło z dębowym pochwytem?');
await o.click('[data-testid="comment-submit"]');
await o.waitForSelector('.pin-label.pin-owner', { timeout: 5000 });
ok(true, 'kropka 3D z numerem po dodaniu komentarza');
await o.waitForTimeout(500);
await o.screenshot({ path: `${out}/1-wlasciciel-komentarz.png` });
// „Zapisz i udostępnij”: 1) numer telefonu + kod SMS (tryb testowy) 2) link 3) wykonawcy
await o.click('[data-testid="save-share"]');
await o.waitForSelector('[data-testid="step-phone"]');
ok((await o.locator('[data-testid="open-find"]').isDisabled()) && (await o.locator('[data-testid="share-url"]').count()) === 0, 'kroki 2 i 3 widoczne, ale nieaktywne przed potwierdzeniem numeru');
// losowy numer: limit 3 kodów na numer / 10 min nie blokuje kolejnych przebiegów
await o.fill('[data-testid="phone-input"]', `6${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`);
await o.click('[data-testid="phone-send"]');
await o.waitForSelector('[data-testid="phone-test-code"]');
const testCode = (await o.textContent('[data-testid="phone-test-code"] b')).trim();
await o.fill('[data-testid="phone-code"]', testCode === '000000' ? '111111' : '000000');
await o.click('[data-testid="phone-verify"]');
await o.waitForSelector('[data-testid="phone-error"]');
ok(true, 'błędny kod SMS — komunikat');
await o.fill('[data-testid="phone-code"]', testCode);
await o.click('[data-testid="phone-verify"]');
await o.waitForSelector('[data-testid="phone-done"]');
ok(true, 'numer potwierdzony kodem SMS (tryb testowy)');
await o.waitForFunction(() => document.querySelector('[data-testid="share-url"]')?.value.includes('/konfigurator/p/'));
const shareUrl = await o.inputValue('[data-testid="share-url"]');
const mail = await o.getAttribute('[data-testid="share-email"]', 'href');
const sms = await o.getAttribute('[data-testid="share-sms"]', 'href');
ok(mail.startsWith('mailto:') && decodeURIComponent(mail).includes(shareUrl), 'udostępnienie e-mailem (mailto z linkiem)');
ok(sms.startsWith('sms:') && decodeURIComponent(sms).includes(shareUrl), 'udostępnienie SMS-em (sms: z linkiem)');
await o.screenshot({ path: `${out}/2-udostepnij.png` });

// ---- krok 3: znajdź wykonawców z okolicy ----
await o.click('[data-testid="open-find"]');
await o.fill('[data-testid="quote-postal"]', '30061');
await o.click('[data-testid="quote-search"]');
await o.waitForSelector('[data-testid="nearby-results"]');
const rows = await o.locator('[data-testid="nearby-row"]').count();
ok(/Kraków/.test(await o.textContent('[data-testid="nearby-results"]')), `tabela wykonawców w promieniu 50 km od 30-061 (Kraków), wierszy: ${rows}`);
await o.fill('[data-testid="quote-name"]', 'Anna');
await o.fill('[data-testid="quote-email"]', 'anna@example.pl');
await o.click('[data-testid="quote-submit"]');
await o.waitForSelector('[data-testid="quote-errors"]');
ok(/zgod/i.test(await o.textContent('[data-testid="quote-errors"]')), '„Znajdź wykonawcę” bez zgody — komunikat');
await o.check('[data-testid="quote-consent"]');
await o.click('[data-testid="quote-submit"]');
await o.waitForSelector('[data-testid="quote-done"]');
ok(true, '„Znajdź wykonawców” — zapytanie do wybranych przyjęte');
await o.click('[data-testid="quote-done"] button');

// karta właściciela nie renderuje sceny w tle podczas kroków firmy (programowy render w CI jest wolny)
const ownerUrl = o.url();
await o.goto('about:blank');

// ---- firma wykonawcza (nowa przeglądarka) ----
const { p: f } = await ctx();
await f.goto(shareUrl, { waitUntil: 'networkidle' });
await f.waitForSelector('[data-testid="share-gate"]', { timeout: 90000 }); // wolny render programowy przy dwóch kartach
await f.waitForTimeout(2500);
ok(true, 'bramka nad rozmytym projektem');
await f.waitForSelector('[data-testid="gate-thumb-large"]', { timeout: 30000 });
ok(await f.evaluate(() => { const i = document.querySelector('[data-testid="gate-thumb-large"]'); return i.complete && i.naturalWidth > 100; }), 'duży podgląd PNG projektu w bramce');
await f.screenshot({ path: `${out}/3-bramka.png` });
await f.click('[data-testid="gate-owner"]');
await f.waitForTimeout(600);
ok((await f.locator('text=nie ma aktywnej sesji właściciela').count()) > 0, '„Jestem właścicielem” bez sesji → informacja');
await f.click('text=Wróć');
await f.click('[data-testid="gate-contractor"]');
await f.fill('[data-testid="gate-firstName"]', 'Jan');
await f.fill('[data-testid="gate-lastName"]', 'Stolarz');
await f.fill('[data-testid="gate-email"]', 'jan@schody-stolarz.pl');
await f.fill('[data-testid="gate-phone"]', '600 100 200');
ok((await f.locator('[data-testid="gate-thumb-small"]').count()) === 1, 'mały podgląd projektu przy formularzu');
await f.check('[data-testid="gate-leads"]');
await f.fill('[data-testid="gate-postalCode"]', '30061');
ok((await f.inputValue('[data-testid="gate-postalCode"]')) === '30-061', 'kod pocztowy formatowany 00-000');
await f.fill('[data-testid="gate-radiusKm"]', '40');
await f.fill('[data-testid="gate-companyName"]', 'Stolarstwo Schodowe Jan Stolarz');
await f.screenshot({ path: `${out}/4-rejestracja.png` });
await f.click('[data-testid="gate-submit"]');
await f.waitForSelector('[data-testid="gate-errors"]');
ok(/zgod/i.test(await f.textContent('[data-testid="gate-errors"]')), 'bez zgody — komunikat');
await f.check('[data-testid="gate-consent"]');
await f.click('[data-testid="gate-submit"]');
await f.waitForSelector('[data-testid="share-gate"]', { state: 'detached' });
ok(true, 'po rejestracji: „Zobacz i wyceń projekt schodów” otwiera projekt');
await f.waitForSelector('.pin-label.pin-owner');
await f.click('[data-testid="comments-toggle"]'); // lista komentarzy jest domyślnie zwinięta
ok((await f.locator('text=Czy tu może być szkło').count()) > 0, 'firma widzi komentarz właściciela');
await f.fill('[data-testid="comments-card"] input', 'Wycena: ok. 28 000 zł netto, termin 6 tygodni.');
await f.press('[data-testid="comments-card"] input', 'Enter');
await f.waitForTimeout(800);
const filt = await f.evaluate(() => getComputedStyle(document.querySelector('#root > div')).filter)
ok(filt === 'none', `po rejestracji projekt nie jest rozmyty (filter: ${filt})`);
await f.screenshot({ path: `${out}/5-firma-widok.png` });
await f.reload({ waitUntil: 'networkidle' });
await f.waitForTimeout(1500);
ok((await f.locator('[data-testid="share-gate"]').count()) === 0, 'aktywna sesja firmy pomija bramkę');

// ---- właściciel widzi odpowiedź i firmę ----
await o.goto(ownerUrl, { waitUntil: 'networkidle' });
await o.waitForTimeout(1500);
await o.waitForSelector('[data-testid="comments-card"]', { timeout: 90000 }); // projekt właściciela wczytuje się po przeładowaniu
await o.click('[data-testid="comments-toggle"]');
ok((await o.locator('text=Wycena: ok. 28 000').count()) > 0, 'właściciel widzi komentarz firmy');
await o.click('[data-testid="save-share"]');
await o.waitForSelector('text=Firmy, które otworzyły projekt');
ok((await o.locator('[data-testid="phone-done"]').count()) === 1, 'numer zapamiętany — krok 1 od razu zaliczony');
ok((await o.locator('text=jan@schody-stolarz.pl').count()) > 0, 'właściciel widzi dane firmy');
await o.screenshot({ path: `${out}/6-wlasciciel-firmy.png` });

await browser.close();
const fatal = problems.filter((p) => !/THREE\.Clock/.test(p));
console.log(fatal.length ? `\nProblemy (${fatal.length}):\n${fatal.join('\n')}` : '\nWszystko OK, konsola bez błędów.');
process.exit(fatal.length ? 1 : 0);
