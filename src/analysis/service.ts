// Zastosowanie wyniku analizy do rekordu firmy + kolejka AI.

import { all, get, run, json, nowIso, parseJson } from '../db/index.ts';
import { heuristicAnalysis } from './heuristic.ts';
import { leadScore } from './score.ts';
import type { Analysis, PageForAnalysis } from './types.ts';
import type { PageExtraction } from '../crawler/extract.ts';

export function loadPagesForCompany(companyId: number): PageForAnalysis[] {
  const rows = all(
    `SELECT p.* FROM pages p WHERE p.domain IN (SELECT domain FROM domains WHERE company_id = ?)
       AND p.extracted IS NOT NULL AND p.status_code BETWEEN 200 AND 299 ORDER BY p.id`,
    companyId,
  );
  const seen = new Set<string>();
  const out: PageForAnalysis[] = [];
  for (const r of rows) {
    const x = parseJson<PageExtraction | null>(r.extracted, null);
    if (!x) continue;
    const key = r.final_url ?? r.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      url: r.final_url ?? r.url,
      type: r.page_type ?? 'other',
      title: x.title,
      headings: x.headings,
      text: x.text,
      signals: x.signals,
      hasContactForm: x.contactForms.length > 0,
    });
  }
  return out;
}

export function applyAnalysis(companyId: number, a: Analysis, source: 'heuristic' | 'ai', meta: Record<string, unknown> = {}): number {
  const c = get(`SELECT contact_status FROM companies WHERE id = ?`, companyId);
  const alive = !!get(`SELECT 1 FROM domains WHERE company_id = ? AND alive = 1`, companyId);
  const { score, breakdown } = leadScore(a, { websiteAlive: alive, contactStatus: (c?.contact_status ?? 'unknown') as any });
  const needsReview = a.category === 'unknown' || a.confidence < 0.45 ? 1 : 0;
  run(
    `UPDATE companies SET category = ?, specialization = ?, has_configurator = ?, lead_score = ?, analysis_json = ?,
       ai_summary = ?, analysis_status = ?, needs_review = CASE WHEN ? = 1 THEN 1 ELSE CASE WHEN scan_status IN ('error','blocked') THEN needs_review ELSE 0 END END,
       industry = COALESCE(industry, 'schody'), updated_at = ? WHERE id = ?`,
    a.category, json(a.stair_types), a.configurator_quality === 'advanced_3d' ? 1 : 0, score,
    json({ ...a, source, score_breakdown: breakdown, analyzed_at: nowIso(), ...meta }), a.reasoning, source, needsReview, nowIso(), companyId,
  );
  return score;
}

export function runHeuristic(companyId: number): Analysis | null {
  const pages = loadPagesForCompany(companyId);
  if (!pages.length) return null;
  const a = heuristicAnalysis(pages);
  // nie nadpisuj wcześniejszego wyniku AI wynikiem heurystyki
  const prev = get(`SELECT analysis_status FROM companies WHERE id = ?`, companyId);
  if (prev?.analysis_status === 'ai') {
    // zaktualizuj tylko score (np. zmienił się status kontaktu)
    const prevA = parseJson<Analysis | null>(get(`SELECT analysis_json FROM companies WHERE id = ?`, companyId)?.analysis_json, null);
    if (prevA) applyAnalysis(companyId, prevA, 'ai');
    return prevA;
  }
  applyAnalysis(companyId, a, 'heuristic');
  return a;
}
