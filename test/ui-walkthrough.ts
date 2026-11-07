// Ręczny przegląd panelu w przeglądarce (nie jest częścią `npm test`):
// uruchamia panel na fixture'ach i przechodzi scenariusz: Nowy projekt -> Rozpocznij -> import CSV -> wyniki -> źródło e-maila -> eksport.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // zależność opcjonalna
import { setupTestEnv } from './helpers/env.ts';
import { startFixtureServer } from './helpers/fixtureServer.ts';
import { createApp } from '../src/app.ts';
import { startWorkers, stopWorkers, drain } from '../src/queue/worker.ts';
import { closeBrowser } from '../src/crawler/render.ts';

const out = process.argv[2] ?? '.';
const fx = await startFixtureServer();
setupTestEnv();
startWorkers();
const server = createApp().listen(0);
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const shot = (n: string) => page.screenshot({ path: `${out}/${n}.png`, fullPage: true });
try {
  await page.goto(`${base}/admin/`);
  await page.click('text=+ Nowy projekt wyszukiwania');
  await page.selectOption('select[name=template]', { label: 'Producenci schodów — Polska' });
  await page.fill('input[name=maxCompanies]', '3000');
  await shot('1-nowy-projekt');
  await page.click('button:has-text("Utwórz i rozpocznij")');
  await page.waitForSelector('#csvtext');
  const sites = ['schody-kowalski.test', 'stalowe-schody.test', 'budex-remonty.test', 'tylko-formularz.test', 'konfigurator-schody.test', 'stara-domena.test', 'kowalski-poznan.test', 'hurtownia-schodow.test', 'chroniona.test'];
  await page.fill('#csvtext', ['strona', ...sites.map((s) => `http://${s}:${fx.port}/`)].join('\n'));
  await page.click('#csvgo');
  await page.waitForSelector('#csvres:has-text("skany w kolejce")');
  await drain(60_000);
  await page.waitForTimeout(4500);
  await shot('2-projekt-postep');
  await page.click('text=Firmy projektu →');
  await page.waitForSelector('#ctable table');
  await shot('3-tabela-firm');
  await page.click('#ctable tr[data-id]:first-child');
  await page.waitForSelector('text=Otwórz źródło e-maila');
  await shot('4-szczegoly-firmy');
  const href = await page.getAttribute('a:has-text("Otwórz źródło e-maila")', 'href');
  console.log('Otwórz źródło e-maila ->', href);
  await page.click('button:has-text("Zamknij")');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exp-csv')]);
  const p = `${out}/eksport.csv`;
  await dl.saveAs(p);
  console.log('CSV zapisany:', p);
  await page.goto(`${base}/admin/#/dashboard`);
  await page.waitForTimeout(800);
  await shot('5-pulpit');
} finally {
  await browser.close();
  server.close();
  await stopWorkers();
  await closeBrowser();
  await fx.close();
}
