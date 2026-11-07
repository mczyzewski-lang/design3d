// Lead Score 0–100. Najwyżej: rzeczywisty producent schodów na wymiar, z własną stroną, bez dobrego konfiguratora.

import type { Analysis } from './types.ts';

export interface ScoreFacts {
  websiteAlive: boolean;
  contactStatus: 'email' | 'form_only' | 'none' | 'unknown';
}

const BASE: Record<Analysis['category'], number> = {
  manufacturer: 52,
  manufacturer_installer: 50,
  installer: 20,
  construction: 12,
  wholesale: 10,
  unknown: 15,
  unrelated: 0,
};

export function leadScore(a: Analysis, f: ScoreFacts): { score: number; breakdown: Array<[string, number]> } {
  const b: Array<[string, number]> = [[`Kategoria: ${a.category}`, BASE[a.category]]];
  if (a.category === 'unrelated') return { score: 0, breakdown: b };
  const isMaker = a.category === 'manufacturer' || a.category === 'manufacturer_installer';
  if (a.custom_made) b.push(['Schody na wymiar / zamówienie', isMaker ? 15 : 5]);
  if (f.websiteAlive) b.push(['Własna działająca strona', 5]);
  if (f.contactStatus === 'email') b.push(['Znaleziony e-mail', 8]);
  else if (f.contactStatus === 'form_only') b.push(['Tylko formularz kontaktowy', 3]);
  if (a.has_gallery) b.push(['Galeria realizacji', 5]);
  if (a.online_quote) b.push(['Wycena przez internet', 4]);
  if (a.has_own_visualizations) b.push(['Własne wizualizacje', 2]);
  if (a.stair_types.length >= 3) b.push(['Szeroka oferta (≥3 rodzaje)', 3]);
  if (a.configurator_quality === 'none') b.push(['Brak konfiguratora (potencjał)', 6]);
  else if (a.configurator_quality === 'basic') b.push(['Prosty konfigurator', -4]);
  else b.push(['Ma już konfigurator 3D', -30]);
  let score = b.reduce((s, [, v]) => s + v, 0);
  if (a.confidence < 0.4) {
    b.push(['Niska pewność klasyfikacji', -5]);
    score -= 5;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, breakdown: b };
}
