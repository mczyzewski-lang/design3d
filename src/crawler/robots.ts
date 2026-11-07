// Obsługa robots.txt (RFC 9309) dla naszego User-Agenta.

import { createRequire } from 'node:module';
import type { Robot } from 'robots-parser';

// pakiet CJS: module.exports = function — ładujemy przez require, by uniknąć niezgodności typów default/CJS
const robotsParser = createRequire(import.meta.url)('robots-parser') as (url: string, contents: string) => Robot;
import { config } from '../config.ts';
import { fetchPage, setHostDelay, FetchError } from './http.ts';

export class RobotsDisallowedError extends Error {
  readonly url: string;
  constructor(url: string) {
    super(`robots.txt zabrania dostępu do ${url}`);
    this.name = 'RobotsDisallowedError';
    this.url = url;
  }
}

interface Entry {
  parser: Robot | null;
  /** 'allow-all' gdy brak pliku (4xx); 'disallow-all' gdy serwer niedostępny (5xx) */
  mode: 'parsed' | 'allow-all' | 'disallow-all';
  /** serwer w ogóle nie odpowiada (błąd sieci) — to nie jest decyzja właściciela strony */
  unreachable?: boolean;
  error?: string;
  fetchedAt: number;
}

const cache = new Map<string, Promise<Entry>>();
const TTL = 12 * 3600 * 1000;

async function load(origin: string): Promise<Entry> {
  const url = origin + '/robots.txt';
  try {
    const r = await fetchPage(url, { retries: 1, accept: 'text/plain,*/*', allowNonHtml: true });
    if (r.status >= 200 && r.status < 300) {
      const parser = robotsParser(url, r.body);
      const delay = parser.getCrawlDelay(config.botToken);
      if (delay) setHostDelay(new URL(origin).host, Math.min(delay, 30) * 1000);
      return { parser, mode: 'parsed', fetchedAt: Date.now() };
    }
    if (r.status >= 400 && r.status < 500) return { parser: null, mode: 'allow-all', fetchedAt: Date.now() };
    return { parser: null, mode: 'disallow-all', fetchedAt: Date.now() };
  } catch (e) {
    if (e instanceof FetchError && e.status && e.status >= 400 && e.status < 500) return { parser: null, mode: 'allow-all', fetchedAt: Date.now() };
    // RFC 9309: robots.txt nieosiągalny -> traktujemy jako zakaz (ostrożnie)
    return { parser: null, mode: 'disallow-all', unreachable: true, error: e instanceof Error ? e.message : String(e), fetchedAt: Date.now() };
  }
}

export async function robotsFor(url: string): Promise<Entry> {
  const origin = new URL(url).origin;
  let p = cache.get(origin);
  if (p) {
    const e = await p;
    const ttl = e.mode === 'disallow-all' ? 5 * 60 * 1000 : TTL; // błędy serwera sprawdzamy ponownie szybciej
    if (Date.now() - e.fetchedAt < ttl) return e;
  }
  p = load(origin);
  cache.set(origin, p);
  return p;
}

export async function isAllowed(url: string): Promise<boolean> {
  const e = await robotsFor(url);
  if (e.mode === 'allow-all') return true;
  if (e.mode === 'disallow-all') return false;
  return e.parser!.isAllowed(url, config.botToken) !== false;
}

export async function assertAllowed(url: string): Promise<void> {
  if (!(await isAllowed(url))) throw new RobotsDisallowedError(url);
}

export function clearRobotsCache(): void {
  cache.clear();
}
