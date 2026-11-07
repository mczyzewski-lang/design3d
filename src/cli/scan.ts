// CLI: szybkie skanowanie listy stron (CSV lub jeden URL w linii) bez uruchamiania panelu.
//   npm run scan -- lista.csv [--pages 8] [--project "Test"] [--out wynik.csv]
// Wyniki trafiają do tej samej bazy co panel (DATABASE_PATH), więc są potem widoczne w panelu.

import fs from 'node:fs';
import { openDb } from '../db/index.ts';
import { createProject } from '../projects/projects.ts';
import { startProject } from '../projects/lifecycle.ts';
import { importCsv } from '../discovery/csvImport.ts';
import { startWorkers, stopWorkers, drain } from '../queue/worker.ts';
import { exportRows, toCsv } from '../export/export.ts';
import { closeBrowser } from '../crawler/render.ts';
import { stats } from '../projects/projects.ts';

const args = process.argv.slice(2);
const opt = (name: string, d?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : d;
};
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!file || !fs.existsSync(file)) {
  console.error('Użycie: npm run scan -- lista.csv [--pages 8] [--project "Nazwa"] [--out wynik.csv]');
  process.exit(1);
}

openDb();
const pid = createProject({ name: opt('project', `CLI ${new Date().toISOString().slice(0, 16)}`)!, maxPagesPerCompany: Number(opt('pages', '8')) });
const summary = importCsv(pid, fs.readFileSync(file, 'utf8'));
console.log(`Import: ${summary.rows} wierszy, nowe: ${summary.created}, skany: ${summary.queuedScans}, pominięte: ${summary.skipped}`);
summary.errors.forEach((e) => console.log('  ! ' + e));
startProject(pid);
startWorkers();
const timer = setInterval(() => {
  const s = stats(pid);
  process.stdout.write(`\rPostęp: ${s.scan_progress}% · strony: ${s.pages_scanned} · firmy z e-mailem: ${s.with_email}/${s.unique_companies} · błędy: ${s.error_count}   `);
}, 2000);
await drain(24 * 3600_000, { includeDelayed: true });
clearInterval(timer);
await stopWorkers();
await closeBrowser();

const rows = exportRows({ projectId: pid });
console.log('\n');
for (const r of rows) {
  console.log(`${String(r.lead_score ?? '—').padStart(3)}  ${r.primary_domain ?? r.name}  ${r.primary_email ?? (r.contact_status === 'form_only' ? '[tylko formularz]' : '[brak]')}  ${r.primary_email_source ?? ''}  (${r.scan_status}${r.scan_error ? ': ' + r.scan_error : ''})`);
}
const out = opt('out');
if (out) {
  fs.writeFileSync(out, toCsv(rows));
  console.log(`\nZapisano ${rows.length} rekordów do ${out}`);
}
