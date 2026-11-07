// Sprawdzenie w przeglądarce (Playwright + Chromium): tryby kamery, konstrukcje, balustrady, auto-dopasowanie.
// Użycie: node configurator/scripts/browser-check.mjs http://localhost:3000/konfigurator/ ./zrzuty
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.argv[2] ?? 'http://localhost:3000/konfigurator/';
const out = process.argv[3] ?? './browser-check';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[console.${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('✓', name); };

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 30000 });
await wait(2500);
const status = await page.textContent('[data-testid="status-pill"]');
const info = await page.textContent('[data-testid="info-bar"]');
console.log('status:', status, '| info:', info.replace(/\s+/g, ' '));
await shot('01-perspektywa');

for (const [cam, name] of [['top', '02-z-gory'], ['side', '03-z-boku'], ['section', '04-przekroj'], ['eye', '05-poziom-oczu'], ['persp', '06-perspektywa-powrot']]) {
  await page.click(`[data-testid="cam-${cam}"]`);
  await wait(1400);
  await shot(name);
}

await page.click('text=Konstrukcja stalowa');
for (const s of ['centralBeam', 'sideStringers', 'zigzag', 'bentPlate', 'weldedFrame']) {
  await page.click(`[data-testid="structure-${s}"]`);
  await wait(700);
  await shot(`10-konstrukcja-${s}`);
}
await page.click('[data-testid="support-fourPosts"]');
await wait(600);
await shot('11-spocznik-4-slupy');
await page.click('[data-testid="structure-centralBeam"]');
await page.click('[data-testid="support-none"]');

await page.click('text=Balustrady');
for (const r of ['verticalBars', 'flatBars', 'horizontalBars', 'perforated', 'mesh', 'solid', 'glass']) {
  await page.click(`[data-testid="railing-${r}"]`);
  await wait(700);
  await shot(`20-balustrada-${r}`);
}
await page.click('[data-testid="railing-verticalBars"]');

// konflikt: zmniejsz głębokość -> czerwone bryły, „Nie mieści się”
await page.click('text=Wymiary przestrzeni');
await page.fill('[data-testid="f-depth"]', '300');
await page.press('[data-testid="f-depth"]', 'Enter');
await wait(1200);
console.log('status po 300 cm:', await page.textContent('[data-testid="status-pill"]'));
await shot('30-konflikt');
await page.click('[data-testid="autofit"]');
await wait(1200);
console.log('auto-dopasowanie:', (await page.textContent('[data-testid="autofit-result"]')).trim(), '| status:', await page.textContent('[data-testid="status-pill"]'));
await shot('31-po-auto-dopasowaniu');

// noc + LED, kolekcja
await page.click('[data-testid="tool-night"]');
await wait(1000);
await shot('40-noc-led');
await page.click('[data-testid="tool-night"]');
await page.click('[data-testid="menu-collections"]');
await page.click('text=Dark Luxury');
await wait(1000);
await shot('41-kolekcja-dark-luxury');

// wąski ekran
await page.setViewportSize({ width: 420, height: 900 });
await wait(1200);
await shot('50-mobile');

await browser.close();
const fatal = problems.filter((p) => !/GPU stall|swiftshader|WebGL: INVALID_|Automatic fallback to software WebGL/i.test(p));
console.log(fatal.length ? `\nProblemy w konsoli (${fatal.length}):\n${fatal.join('\n')}` : '\nKonsola: brak błędów.');
process.exit(fatal.length ? 1 : 0);
