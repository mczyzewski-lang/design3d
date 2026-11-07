// Analiza i kwalifikacja firmy przez Claude (ustrukturyzowany JSON).

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { config } from '../config.ts';
import { AnalysisSchema, type Analysis, type PageForAnalysis } from './types.ts';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey || undefined, maxRetries: 3, ...(config.anthropicBaseUrl ? { baseURL: config.anthropicBaseUrl } : {}) });
  return client;
}

export function aiConfigured(): boolean {
  return !!config.anthropicApiKey;
}

const SYSTEM = `Jesteś analitykiem B2B firmy design3d.pl, która sprzedaje producentom schodów konfigurator 3D do pozyskiwania klientów online.
Na podstawie treści oficjalnej strony firmy oceń, czym firma faktycznie się zajmuje. Nie zakładaj, że firma produkuje schody tylko dlatego, że słowo "schody" pojawia się na stronie.
Kategorie:
- manufacturer: sama produkuje schody (własna produkcja/stolarnia/warsztat),
- manufacturer_installer: produkuje i montuje schody,
- installer: wyłącznie monter lub podwykonawca (montuje cudze schody),
- construction: firma budowlana/remontowa, dla której schody są usługą poboczną,
- wholesale: hurtownia, dystrybutor, sklep z gotowymi schodami/elementami,
- unrelated: firma niezwiązana ze schodami,
- unknown: treść nie pozwala ocenić.
configurator_quality: none = brak konfiguratora; basic = prosty formularz/kalkulator wyceny; advanced_3d = interaktywny konfigurator z podglądem 3D.
configurator_3d_potential: jak bardzo firma skorzystałaby z konfiguratora 3D do pozyskiwania klientów (high = producent schodów na wymiar bez dobrego konfiguratora).
Opieraj się wyłącznie na dostarczonej treści. W source_urls podawaj tylko adresy z dostarczonych podstron. Uzasadnienie po polsku, maksymalnie 3 zdania.`;

/** Buduje treść wejściową, mieszcząc się w limicie znaków (bez obcinania w połowie słowa). */
export function buildAiInput(companyName: string | null, pages: PageForAnalysis[], maxChars = 24000): string {
  const order = ['home', 'about', 'offer', 'gallery', 'other', 'contact', 'legal'];
  const sorted = [...pages].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  const perPage = Math.floor(maxChars / Math.max(1, sorted.length));
  const parts = sorted.map((p) => {
    const sig = [
      p.signals?.configuratorLinks?.length ? `linki do konfiguratora: ${p.signals.configuratorLinks.join(', ')}` : '',
      p.signals?.configuratorScripts?.length ? `skrypty 3D/konfiguratora: ${p.signals.configuratorScripts.join(', ')}` : '',
      p.hasContactForm ? 'formularz kontaktowy: tak' : '',
    ].filter(Boolean).join('; ');
    let text = p.text.replace(/\s+/g, ' ');
    if (text.length > perPage) text = text.slice(0, perPage).replace(/\s+\S*$/, '') + ' […]';
    return `### ${p.type.toUpperCase()} — ${p.url}\nTytuł: ${p.title}\nNagłówki: ${p.headings.slice(0, 15).join(' | ')}\n${sig ? `Sygnały: ${sig}\n` : ''}Treść: ${text}`;
  });
  return `Firma: ${companyName ?? '(nieznana nazwa)'}\n\n${parts.join('\n\n')}`;
}

export function estimateCostUsd(inputChars: number, outputTokens = 1500): number {
  const inTok = inputChars / 3.2 + 900;
  return (inTok * config.anthropicInputPrice + outputTokens * config.anthropicOutputPrice) / 1_000_000;
}

export interface AiResult {
  analysis: Analysis;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
}

export async function analyzeWithAi(companyName: string | null, pages: PageForAnalysis[]): Promise<AiResult> {
  const input = buildAiInput(companyName, pages);
  const allowedUrls = new Set(pages.map((p) => p.url));
  const response = await getClient().beta.messages.parse({
    model: config.anthropicModel,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort: config.anthropicEffort, format: betaZodOutputFormat(AnalysisSchema) },
    messages: [{ role: 'user', content: input }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Model odmówił analizy (refusal)');
  if (response.stop_reason === 'max_tokens') throw new Error('Odpowiedź modelu została ucięta (max_tokens)');
  const parsed = response.parsed_output;
  if (!parsed) throw new Error('Brak poprawnego JSON w odpowiedzi modelu');
  const analysis: Analysis = { ...parsed, source_urls: parsed.source_urls.filter((u) => allowedUrls.has(u)) };
  if (!analysis.source_urls.length) analysis.source_urls = pages.map((p) => p.url).slice(0, 5);
  const inputTokens = response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0);
  const outputTokens = response.usage.output_tokens;
  const costUsd = (inputTokens * config.anthropicInputPrice + outputTokens * config.anthropicOutputPrice) / 1_000_000;
  return { analysis, inputTokens, outputTokens, costUsd, model: response.model };
}

export function isRetryableAiError(e: unknown): boolean {
  return e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError;
}
export function isPermanentAiError(e: unknown): boolean {
  return e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError || e instanceof Anthropic.BadRequestError || e instanceof Anthropic.NotFoundError;
}
