// Renderowanie JavaScript przez Playwright — tylko, gdy lekkie pobranie HTML nie wystarcza.
// Playwright jest zależnością opcjonalną: bez niego crawler działa w trybie samego HTML.

import { createRequire } from 'node:module';
import { config } from '../config.ts';
import { waitForHost } from './http.ts';
import { detectChallenge } from './extract.ts';

type Browser = any;

let browserPromise: Promise<Browser | null> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let available: boolean | null = null;

function loadPlaywright(): any | null {
  const req = createRequire(import.meta.url);
  try {
    return req('playwright');
  } catch {
    try {
      return req('playwright-core');
    } catch {
      return null;
    }
  }
}

export function renderingAvailable(): boolean {
  if (!config.enableJsRendering) return false;
  if (available === null) available = loadPlaywright() !== null;
  return available;
}

async function getBrowser(): Promise<Browser | null> {
  if (!renderingAvailable()) return null;
  if (!browserPromise) {
    const pw = loadPlaywright();
    const args: string[] = [];
    if (config.testHostMap) {
      const rules = Object.entries(config.testHostMap).map(([h, ip]) => `MAP ${h} ${ip}`).join(', ');
      args.push(`--host-resolver-rules=${rules}`);
    }
    const proxy = !config.testHostMap && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: process.env.NO_PROXY } : undefined;
    browserPromise = pw.chromium.launch({ headless: true, args, proxy }).catch((e: Error) => {
      console.error('[render] Nie udało się uruchomić przeglądarki:', e.message);
      available = false;
      browserPromise = null;
      return null;
    });
  }
  return browserPromise;
}

function scheduleIdleClose(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void closeBrowser(), 60_000);
  idleTimer.unref();
}

export async function closeBrowser(): Promise<void> {
  const p = browserPromise;
  browserPromise = null;
  const b = await p;
  await b?.close().catch(() => {});
}

export interface RenderResult {
  finalUrl: string;
  html: string;
  status: number;
  challenge: boolean;
}

let activeRenders = 0;
const MAX_RENDERS = 2;

/** Renderuje stronę. URL musi być wcześniej sprawdzony z robots.txt. */
export async function renderPage(url: string): Promise<RenderResult | null> {
  const browser = await getBrowser();
  if (!browser) return null;
  while (activeRenders >= MAX_RENDERS) await new Promise((r) => setTimeout(r, 200));
  activeRenders++;
  await waitForHost(new URL(url).host);
  const context = await browser.newContext({ userAgent: config.userAgent, locale: 'pl-PL', javaScriptEnabled: true });
  try {
    const page = await context.newPage();
    // nie pobieramy zbędnych zasobów (obrazy, wideo, fonty) — mniejsze obciążenie serwera
    await page.route('**/*', (route: any) => {
      const t = route.request().resourceType();
      return ['image', 'media', 'font'].includes(t) ? route.abort() : route.continue();
    });
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.requestTimeoutMs + 5000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    const html: string = await page.content();
    const status: number = resp?.status() ?? 0;
    return { finalUrl: page.url(), html, status, challenge: detectChallenge(html, status) };
  } finally {
    await context.close().catch(() => {});
    activeRenders--;
    scheduleIdleClose();
  }
}
