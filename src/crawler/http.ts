// Pobieranie stron: limity per host, globalny limit równoległości, retry z exponential backoff,
// poszanowanie Retry-After, wykrywanie blokad (CAPTCHA / Cloudflare) — bez ich obchodzenia.

import { Agent, EnvHttpProxyAgent, fetch as ufetch, type Dispatcher } from 'undici';
import dns from 'node:dns';
import { config } from '../config.ts';
import { detectChallenge } from './extract.ts';

export class BlockedError extends Error {
  readonly url: string;
  constructor(url: string, reason: string) {
    super(`Dostęp zablokowany (${reason}) — nie omijamy zabezpieczeń`);
    this.url = url;
  }
}
export class RetryLaterError extends Error {
  readonly delayMs: number;
  constructor(message: string, delayMs: number) {
    super(message);
    this.delayMs = delayMs;
  }
}
export class FetchError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  contentType: string;
  redirects: string[];
}

// ---------- dispatcher ----------
let dispatcher: Dispatcher | null = null;
export function getDispatcher(): Dispatcher {
  if (dispatcher) return dispatcher;
  const map = config.testHostMap;
  if (map) {
    dispatcher = new Agent({
      connect: {
        lookup: (hostname, options, cb) => {
          const target = map[hostname] ?? (hostname.endsWith('.test') ? map['*.test'] : undefined);
          if (target) {
            if ((options as any)?.all) return (cb as any)(null, [{ address: target, family: 4 }]);
            return (cb as any)(null, target, 4);
          }
          return dns.lookup(hostname, options as any, cb as any);
        },
      },
    });
  } else {
    // respektuje HTTPS_PROXY / HTTP_PROXY / NO_PROXY
    dispatcher = new EnvHttpProxyAgent();
  }
  return dispatcher;
}
export function resetDispatcher(): void {
  dispatcher = null;
}

// ---------- limity ----------
class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;
  private readonly max: number;
  constructor(max: number) {
    this.max = max;
  }
  async acquire(): Promise<() => void> {
    if (this.active >= this.max) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    return () => {
      this.active--;
      this.queue.shift()?.();
    };
  }
}
const globalSlots = new Semaphore(16);

const hostNext = new Map<string, number>();
const hostDelay = new Map<string, number>();
const hostChain = new Map<string, Promise<void>>();

export function setHostDelay(host: string, ms: number): void {
  hostDelay.set(host, Math.max(ms, config.perHostDelayMs));
}

/** Gwarantuje minimalny odstęp między żądaniami do jednego hosta (sekwencyjnie per host). */
export async function waitForHost(host: string): Promise<void> {
  const prev = hostChain.get(host) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  hostChain.set(host, prev.then(() => mine));
  await prev;
  const now = Date.now();
  const next = hostNext.get(host) ?? 0;
  if (next > now) await sleep(next - now);
  hostNext.set(host, Date.now() + (hostDelay.get(host) ?? config.perHostDelayMs));
  release();
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function parseRetryAfter(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n)) return n * 1000;
  const d = Date.parse(v);
  return Number.isFinite(d) ? Math.max(0, d - Date.now()) : null;
}

function decode(buf: Uint8Array, contentType: string): string {
  let charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase();
  if (!charset) {
    const head = new TextDecoder('latin1').decode(buf.slice(0, 4096));
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1]?.toLowerCase();
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

async function readLimited(res: Awaited<ReturnType<typeof ufetch>>, max: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body as any as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > max) break;
    chunks.push(chunk);
  }
  const out = new Uint8Array(Math.min(size, max));
  let o = 0;
  for (const c of chunks) {
    out.set(c.subarray(0, Math.min(c.byteLength, out.length - o)), o);
    o += c.byteLength;
    if (o >= out.length) break;
  }
  return out;
}

export interface FetchOptions {
  /** wywoływane dla każdego URL w łańcuchu przekierowań; ma rzucić, jeśli robots.txt zabrania */
  checkAllowed?: (url: string) => Promise<void>;
  accept?: string;
  retries?: number;
  skipHostWait?: boolean;
  allowNonHtml?: boolean;
}

/** Jedno żądanie GET z ręczną obsługą przekierowań (żeby znać docelową domenę). */
async function fetchOnce(url: string, opts: FetchOptions): Promise<FetchResult> {
  const redirects: string[] = [];
  let current = url;
  for (let hop = 0; hop < 8; hop++) {
    if (opts.checkAllowed) await opts.checkAllowed(current);
    const host = new URL(current).host;
    if (!opts.skipHostWait) await waitForHost(host);
    const release = await globalSlots.acquire();
    let res;
    try {
      res = await ufetch(current, {
        method: 'GET',
        redirect: 'manual',
        dispatcher: getDispatcher(),
        signal: AbortSignal.timeout(config.requestTimeoutMs),
        headers: {
          'user-agent': config.userAgent,
          accept: opts.accept ?? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'accept-language': 'pl-PL,pl;q=0.9,en;q=0.5',
        },
      });
    } finally {
      release();
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    if (res.status >= 300 && res.status < 400 && headers.location) {
      await res.body?.cancel().catch(() => {});
      const next = new URL(headers.location, current).toString();
      redirects.push(next);
      current = next;
      continue;
    }
    const contentType = headers['content-type'] ?? '';
    const isHtml = /html|xml|text\/plain/i.test(contentType) || !contentType;
    let body = '';
    if (isHtml || opts.allowNonHtml) body = decode(await readLimited(res, config.maxPageBytes), contentType);
    else await res.body?.cancel().catch(() => {});
    return { url, finalUrl: current, status: res.status, headers, body, contentType, redirects };
  }
  throw new FetchError('Zbyt wiele przekierowań');
}

/** GET z retry/backoff. Rzuca BlockedError dla CAPTCHA/challenge, RetryLaterError dla długich Retry-After. */
export async function fetchPage(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const retries = opts.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetchOnce(url, opts);
      const host = new URL(r.finalUrl).host;
      if ([401, 403, 429, 503].includes(r.status) && detectChallenge(r.body, r.status, r.headers)) {
        throw new BlockedError(r.finalUrl, r.status === 429 ? 'limit / challenge' : 'CAPTCHA lub ochrona anty-botowa');
      }
      if (r.status === 429 || (r.status >= 500 && r.status <= 504)) {
        const ra = parseRetryAfter(r.headers['retry-after']);
        if (ra !== null && ra > 60_000) throw new RetryLaterError(`HTTP ${r.status}, Retry-After ${Math.round(ra / 1000)}s`, ra);
        if (ra !== null) setHostDelay(host, Math.min(ra, 30_000));
        lastErr = new FetchError(`HTTP ${r.status}`, r.status);
        if (attempt < retries) {
          await sleep(ra ?? backoff(attempt));
          continue;
        }
        throw lastErr;
      }
      if (r.status === 200 && detectChallenge(r.body, r.status, r.headers) && r.body.length < 20000) {
        throw new BlockedError(r.finalUrl, 'strona weryfikacji przeglądarki');
      }
      return r;
    } catch (e) {
      if (e instanceof BlockedError || e instanceof RetryLaterError || (e as any)?.name === 'RobotsDisallowedError') throw e;
      if (e instanceof FetchError && e.status) throw e;
      lastErr = e;
      if (attempt < retries) {
        await sleep(backoff(attempt));
        continue;
      }
    }
  }
  const msg = lastErr instanceof Error ? (lastErr.cause instanceof Error ? `${lastErr.message}: ${lastErr.cause.message}` : lastErr.message) : String(lastErr);
  throw new FetchError(msg);
}

export function backoff(attempt: number, baseMs = 800): number {
  return Math.round(baseMs * 2 ** attempt * (0.75 + Math.random() * 0.5));
}
