// Legalne źródła odkrywania domen: oficjalne API wyszukiwarek (klucze w zmiennych środowiskowych).

import { fetch as ufetch } from 'undici';
import { getDispatcher } from '../crawler/http.ts';
import { config } from '../config.ts';

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

export interface SearchProvider {
  key: 'brave' | 'google';
  label: string;
  configured(): boolean;
  costPerQuery(): number;
  /** page: 0-based */
  search(query: string, page: number): Promise<SearchResult[]>;
}


export class ProviderError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await ufetch(url, { headers: { accept: 'application/json', ...headers }, dispatcher: getDispatcher(), signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  if (!res.ok) throw new ProviderError(`HTTP ${res.status}: ${text.slice(0, 200)}`, res.status);
  return JSON.parse(text);
}

export const brave: SearchProvider = {
  key: 'brave',
  label: 'Brave Search API',
  configured: () => !!config.braveApiKey,
  costPerQuery: () => config.braveCostPerQuery,
  async search(query, page) {
    const u = new URL(config.braveBaseUrl);
    u.searchParams.set('q', query);
    u.searchParams.set('country', 'PL');
    u.searchParams.set('search_lang', 'pl');
    u.searchParams.set('count', '20');
    u.searchParams.set('offset', String(page));
    const data = await getJson(u.toString(), { 'X-Subscription-Token': config.braveApiKey });
    return (data?.web?.results ?? []).map((r: any) => ({ url: String(r.url), title: String(r.title ?? ''), snippet: String(r.description ?? '').replace(/<[^>]+>/g, '') }));
  },
};

export const google: SearchProvider = {
  key: 'google',
  label: 'Google Programmable Search (Custom Search JSON API)',
  configured: () => !!config.googleApiKey && !!config.googleCx,
  costPerQuery: () => config.googleCostPerQuery,
  async search(query, page) {
    const u = new URL(config.googleBaseUrl);
    u.searchParams.set('key', config.googleApiKey);
    u.searchParams.set('cx', config.googleCx);
    u.searchParams.set('q', query);
    u.searchParams.set('gl', 'pl');
    u.searchParams.set('lr', 'lang_pl');
    u.searchParams.set('num', '10');
    u.searchParams.set('start', String(page * 10 + 1));
    const data = await getJson(u.toString());
    return (data?.items ?? []).map((r: any) => ({ url: String(r.link), title: String(r.title ?? ''), snippet: String(r.snippet ?? '') }));
  },
};

export const PROVIDERS: Record<string, SearchProvider> = { brave, google };

export function getProvider(key: string | null | undefined): SearchProvider | null {
  return key ? PROVIDERS[key] ?? null : null;
}
