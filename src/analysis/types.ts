import { z } from 'zod';

export const CATEGORIES = ['manufacturer', 'manufacturer_installer', 'installer', 'construction', 'wholesale', 'unrelated', 'unknown'] as const;
export type CompanyCategory = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CompanyCategory, string> = {
  manufacturer: 'Producent schodów',
  manufacturer_installer: 'Producent + montaż',
  installer: 'Monter / podwykonawca',
  construction: 'Firma budowlana (schody pobocznie)',
  wholesale: 'Hurtownia / dystrybutor',
  unrelated: 'Niepowiązana z branżą',
  unknown: 'Do weryfikacji',
};

/** Wynik analizy — wspólny format dla heurystyki i AI. */
export const AnalysisSchema = z.object({
  category: z.enum(CATEGORIES),
  stair_types: z.array(z.string()).describe('Rodzaje schodów w ofercie, np. drewniane, stalowe, samonośne, dywanowe, zabiegowe, betonowe, kręcone, szklane'),
  custom_made: z.boolean().describe('Czy realizuje schody na indywidualne zamówienie / na wymiar'),
  has_own_visualizations: z.boolean().describe('Czy prezentuje własne wizualizacje / projekty 3D'),
  has_online_configurator: z.boolean(),
  configurator_quality: z.enum(['none', 'basic', 'advanced_3d']).describe('none = brak, basic = prosty formularz/kalkulator, advanced_3d = interaktywny konfigurator 3D'),
  has_gallery: z.boolean().describe('Czy ma galerię realizacji'),
  online_quote: z.boolean().describe('Czy można uzyskać wycenę przez internet (formularz, e-mail)'),
  configurator_3d_potential: z.enum(['low', 'medium', 'high']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().describe('Krótkie uzasadnienie po polsku (1–3 zdania)'),
  source_urls: z.array(z.string()).describe('Adresy podstron, na których oparto ocenę'),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export interface PageForAnalysis {
  url: string;
  type: string;
  title: string;
  headings: string[];
  text: string;
  signals?: { configuratorLinks?: string[]; configuratorScripts?: string[]; iframes?: string[] };
  hasContactForm?: boolean;
}
