import { config } from './config.ts';
import { openDb } from './db/index.ts';
import { createApp } from './app.ts';
import { startWorkers, stopWorkers } from './queue/worker.ts';
import { startScheduler, stopScheduler } from './queue/scheduler.ts';
import { closeBrowser } from './crawler/render.ts';

openDb();
const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`design3d.pl panel: http://localhost:${config.port}/admin/  (Lead Discovery)`);
  if (!config.adminPassword) console.warn('UWAGA: brak ADMIN_PASSWORD — panel dostępny wyłącznie z localhost.');
});

if (!config.disableBackground) {
  startWorkers();
  startScheduler();
}

async function shutdown(sig: string) {
  console.log(`\n${sig}: zatrzymywanie… (zadania w toku wrócą do kolejki)`);
  server.close();
  stopScheduler();
  await Promise.race([stopWorkers(), new Promise((r) => setTimeout(r, 15000))]);
  await closeBrowser();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
