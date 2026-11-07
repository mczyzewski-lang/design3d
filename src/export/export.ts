// Eksport CSV / XLSX — wyłącznie rekordy zapisane w bazie (bez danych demonstracyjnych).

import ExcelJS from 'exceljs';
import { all } from '../db/index.ts';
import { buildWhere, type CompanyFilter } from '../companies/query.ts';
import { CATEGORY_LABELS } from '../analysis/types.ts';

const COLUMNS: Array<[string, string]> = [
  ['id', 'ID'], ['name', 'Nazwa firmy'], ['primary_domain', 'Domena'], ['website_url', 'Strona WWW'],
  ['primary_email', 'Główny e-mail'], ['primary_email_category', 'Kategoria e-maila'], ['primary_email_source', 'Źródło e-maila (URL)'],
  ['primary_email_verified_at', 'Data weryfikacji e-maila'], ['other_emails', 'Pozostałe e-maile'], ['phone', 'Telefon'],
  ['contact_form_url', 'Formularz kontaktowy'], ['contact_status', 'Status kontaktu'], ['city', 'Miasto'], ['voivodeship', 'Województwo'],
  ['nip', 'NIP'], ['industry', 'Branża'], ['specialization', 'Specjalizacja'], ['category_label', 'Kategoria firmy'],
  ['lead_score', 'Lead Score'], ['has_configurator', 'Ma konfigurator 3D'], ['scan_status', 'Status skanowania'],
  ['last_scanned_at', 'Data ostatniego skanu'], ['ai_summary', 'Podsumowanie'], ['sources', 'Źródła danych'],
  ['marketing_consent', 'Zgoda marketingowa'], ['objection_status', 'Sprzeciw'],
];

export function exportRows(f: CompanyFilter): Array<Record<string, unknown>> {
  const { where, params, join } = buildWhere(f);
  const rows = all(`SELECT c.* FROM companies c ${join} WHERE ${where} ORDER BY c.lead_score IS NULL, c.lead_score DESC, c.id LIMIT 20000`, ...params);
  return rows.map((c) => {
    const emails = all(`SELECT value, category, source_url, verified_at, is_primary FROM contacts WHERE company_id = ? AND kind = 'email' AND status = 'active' ORDER BY is_primary DESC, confidence DESC`, c.id);
    const primary = emails.find((e) => e.is_primary);
    const srcs = all(`SELECT DISTINCT kind, COALESCE(provider, '') AS provider FROM sources WHERE company_id = ?`, c.id).map((s) => (s.provider ? `${s.kind}:${s.provider}` : s.kind));
    let spec: string[] = [];
    try {
      spec = JSON.parse(c.specialization ?? '[]');
    } catch {
      /* */
    }
    return {
      ...c,
      primary_email_category: primary?.category ?? '',
      primary_email_verified_at: primary?.verified_at ?? '',
      other_emails: emails.filter((e) => !e.is_primary).map((e) => `${e.value} (${e.category}; ${e.source_url})`).join('\n'),
      specialization: spec.join(', '),
      category_label: c.category ? CATEGORY_LABELS[c.category as keyof typeof CATEGORY_LABELS] ?? c.category : '',
      has_configurator: c.has_configurator === 1 ? 'tak' : c.has_configurator === 0 ? 'nie' : '',
      marketing_consent: c.marketing_consent === 'confirmed' ? 'potwierdzona' : 'brak potwierdzonej zgody',
      objection_status: c.objection_status === 'objected' ? 'TAK' : 'nie',
      sources: srcs.join(', '),
    };
  });
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // ochrona przed wstrzyknięciem formuł w arkuszach
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  const head = COLUMNS.map(([, l]) => csvCell(l)).join(';');
  const body = rows.map((r) => COLUMNS.map(([k]) => csvCell(r[k])).join(';'));
  return '﻿' + [head, ...body].join('\r\n') + '\r\n';
}

export async function toXlsx(rows: Array<Record<string, unknown>>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'design3d.pl Lead Discovery';
  const ws = wb.addWorksheet('Firmy');
  ws.columns = COLUMNS.map(([k, l]) => ({ header: l, key: k, width: Math.min(60, Math.max(12, l.length + 4)) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of rows) {
    const row = ws.addRow(Object.fromEntries(COLUMNS.map(([k]) => [k, r[k] ?? ''])));
    const src = r.primary_email_source as string | undefined;
    if (src) row.getCell('primary_email_source').value = { text: src, hyperlink: src };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
