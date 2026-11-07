// Wspólna konfiguracja testów: osobna baza w katalogu tymczasowym, hosty *.test -> 127.0.0.1.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { overrideConfig } from '../../src/config.ts';
import { openDb } from '../../src/db/index.ts';

export function setupTestEnv(extra: Record<string, unknown> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd3-ld-'));
  const dbPath = path.join(dir, 'test.sqlite');
  overrideConfig({
    databasePath: dbPath,
    perHostDelayMs: 20,
    requestTimeoutMs: 5000,
    testHostMap: { '*.test': '127.0.0.1' },
    disableBackground: true,
    crawlConcurrency: 3,
    aiConcurrency: 1,
    anthropicApiKey: '',
    braveApiKey: '',
    ...extra,
  } as any);
  openDb(dbPath);
  return dir;
}
