import fs from 'node:fs';
import path from 'node:path';

// Wczytaj .env, jeśli istnieje (Node 22 ma wbudowany parser).
const envFile = process.env.DOTENV_PATH ?? path.resolve('.env');
if (fs.existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* ignore malformed .env */
  }
}

const str = (k: string, d = ''): string => process.env[k]?.trim() || d;
const num = (k: string, d: number): number => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) && process.env[k] !== '' && process.env[k] !== undefined ? v : d;
};
const bool = (k: string, d: boolean): boolean => {
  const v = process.env[k];
  if (v === undefined || v === '') return d;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};

export interface Config {
  port: number;
  adminUser: string;
  adminPassword: string;
  databasePath: string;
  userAgent: string;
  botToken: string;
  crawlConcurrency: number;
  perHostDelayMs: number;
  requestTimeoutMs: number;
  maxPageBytes: number;
  pageCacheHours: number;
  enableJsRendering: boolean;
  braveApiKey: string;
  braveCostPerQuery: number;
  braveBaseUrl: string;
  googleApiKey: string;
  googleCx: string;
  googleCostPerQuery: number;
  googleBaseUrl: string;
  anthropicApiKey: string;
  /** opcjonalnie: inny endpoint API (np. proxy firmowe lub testy) */
  anthropicBaseUrl: string;
  anthropicModel: string;
  anthropicEffort: 'low' | 'medium' | 'high';
  anthropicInputPrice: number;
  anthropicOutputPrice: number;
  aiConcurrency: number;
  retentionDays: number;
  reverifyDays: number;
  dataControllerName: string;
  dataControllerContact: string;
  /** Tylko testy: mapowanie hostów *.test na 127.0.0.1 (fixture'y). */
  testHostMap: Record<string, string> | null;
  /** Wyłącza harmonogram/workery przy starcie (testy). */
  disableBackground: boolean;
}

function loadConfig(): Config {
  const effort = str('ANTHROPIC_EFFORT', 'low');
  return {
    port: num('PORT', 3000),
    adminUser: str('ADMIN_USER', 'admin'),
    adminPassword: str('ADMIN_PASSWORD', ''),
    databasePath: str('DATABASE_PATH', './data/design3d.sqlite'),
    userAgent: str('CRAWLER_USER_AGENT', 'Design3dLeadBot/1.0 (+https://design3d.pl/bot)'),
    botToken: str('CRAWLER_BOT_TOKEN', 'Design3dLeadBot'),
    crawlConcurrency: num('CRAWL_CONCURRENCY', 6),
    perHostDelayMs: num('PER_HOST_DELAY_MS', 1500),
    requestTimeoutMs: num('REQUEST_TIMEOUT_MS', 15000),
    maxPageBytes: num('MAX_PAGE_BYTES', 2_500_000),
    pageCacheHours: num('PAGE_CACHE_HOURS', 168),
    enableJsRendering: bool('ENABLE_JS_RENDERING', true),
    braveApiKey: str('BRAVE_SEARCH_API_KEY'),
    braveCostPerQuery: num('BRAVE_COST_PER_QUERY_USD', 0.005),
    braveBaseUrl: str('BRAVE_BASE_URL', 'https://api.search.brave.com/res/v1/web/search'),
    googleApiKey: str('GOOGLE_CSE_API_KEY'),
    googleCx: str('GOOGLE_CSE_CX'),
    googleCostPerQuery: num('GOOGLE_CSE_COST_PER_QUERY_USD', 0.005),
    googleBaseUrl: str('GOOGLE_CSE_BASE_URL', 'https://www.googleapis.com/customsearch/v1'),
    anthropicApiKey: str('ANTHROPIC_API_KEY'),
    anthropicBaseUrl: str('LEAD_ANTHROPIC_BASE_URL'),
    anthropicModel: str('ANTHROPIC_MODEL', 'claude-opus-5-5'),
    anthropicEffort: (['low', 'medium', 'high'].includes(effort) ? effort : 'low') as Config['anthropicEffort'],
    anthropicInputPrice: num('ANTHROPIC_INPUT_PRICE_PER_MTOK', 4),
    anthropicOutputPrice: num('ANTHROPIC_OUTPUT_PRICE_PER_MTOK', 20),
    aiConcurrency: num('AI_CONCURRENCY', 2),
    retentionDays: num('RETENTION_DAYS', 730),
    reverifyDays: num('REVERIFY_DAYS', 90),
    dataControllerName: str('DATA_CONTROLLER_NAME', 'design3d.pl'),
    dataControllerContact: str('DATA_CONTROLLER_CONTACT', 'rodo@design3d.pl'),
    testHostMap: null,
    disableBackground: bool('DISABLE_BACKGROUND', false),
  };
}

export const config: Config = loadConfig();

/** Pozwala testom nadpisać ustawienia bez zmiennych środowiskowych. */
export function overrideConfig(patch: Partial<Config>): void {
  Object.assign(config, patch);
}
