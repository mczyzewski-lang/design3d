// Import CSV z nazwami firm i/lub adresami stron — pozwala skanować bez płatnego API wyszukiwarki.

import { parse } from 'csv-parse/sync';
import { normalizeUrl, registrableDomain } from '../util/domain.ts';
import { foldPl } from '../util/polish.ts';
import { findOrCreateByDomain, findOrCreateWithoutWebsite } from '../companies/repo.ts';
import { enqueue } from '../queue/queue.ts';
import { getProject } from '../projects/projects.ts';
import { isLikelyCompanySite } from './officialSite.ts';

const COLS = {
  name: ['name', 'nazwa', 'firma', 'nazwa firmy', 'company', 'company name'],
  website: ['website', 'www', 'strona', 'strona www', 'url', 'domena', 'domain', 'adres strony', 'site'],
  city: ['city', 'miasto', 'miejscowosc', 'miejscowość', 'lokalizacja'],
  nip: ['nip', 'vat', 'nip/vat', 'tax id'],
};

export interface CsvRow { name?: string; website?: string; city?: string; nip?: string }

export function parseCsv(text: string): CsvRow[] {
  const clean = text.replace(/^﻿/, '').trim();
  if (!clean) return [];
  const firstLine = clean.split(/\r?\n/)[0];
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : firstLine.includes('\t') ? '\t' : ',';
  const records: string[][] = parse(clean, { delimiter, relax_column_count: true, skip_empty_lines: true, trim: true, bom: true });
  if (!records.length) return [];
  const header = records[0].map((h) => foldPl(h).replace(/["']/g, ''));
  const idx = (names: string[]) => header.findIndex((h) => names.map(foldPl).includes(h));
  const map = { name: idx(COLS.name), website: idx(COLS.website), city: idx(COLS.city), nip: idx(COLS.nip) };
  const hasHeader = Object.values(map).some((i) => i >= 0);
  const rows = hasHeader ? records.slice(1) : records;
  return rows.map((r) => {
    if (!hasHeader) {
      // bez nagłówka: pojedyncza kolumna z URL lub nazwą
      const v = r[0] ?? '';
      return normalizeUrl(v) && /\./.test(v) ? { website: v } : { name: v };
    }
    const g = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '') || undefined;
    return { name: g(map.name), website: g(map.website), city: g(map.city), nip: g(map.nip) };
  }).filter((r) => r.name || r.website);
}

export interface ImportSummary {
  rows: number;
  created: number;
  existing: number;
  withoutWebsite: number;
  skipped: number;
  queuedScans: number;
  queuedResolves: number;
  errors: string[];
}

export function importCsv(projectId: number, text: string): ImportSummary {
  const project = getProject(projectId);
  if (!project) throw new Error('Projekt nie istnieje');
  const rows = parseCsv(text);
  const s: ImportSummary = { rows: rows.length, created: 0, existing: 0, withoutWebsite: 0, skipped: 0, queuedScans: 0, queuedResolves: 0, errors: [] };
  rows.forEach((row, i) => {
    const url = row.website ? normalizeUrl(row.website) : null;
    if (row.website && !url) {
      s.errors.push(`Wiersz ${i + 2}: niepoprawny adres "${row.website}"`);
      s.skipped++;
      return;
    }
    if (url) {
      if (!isLikelyCompanySite(url)) {
        s.errors.push(`Wiersz ${i + 2}: ${url} to portal/katalog, nie strona firmy — pominięto`);
        s.skipped++;
        return;
      }
      const domain = registrableDomain(url)!;
      const res = findOrCreateByDomain({
        domain, url, name: row.name, city: row.city, nip: row.nip, projectId, via: 'csv',
        source: { kind: 'csv_import', title: 'Import CSV', snippet: [row.name, row.website, row.city].filter(Boolean).join(' | ') },
      });
      if (!res) {
        s.skipped++;
        return;
      }
      res.created ? s.created++ : s.existing++;
      if (enqueue({ queue: 'crawl', type: 'scan_company', projectId, companyId: res.companyId, payload: { url } })) s.queuedScans++;
    } else if (row.name) {
      const res = findOrCreateWithoutWebsite({ name: row.name, city: row.city, nip: row.nip, projectId, source: { kind: 'csv_import', title: 'Import CSV', snippet: row.name } });
      if (!res) {
        s.skipped++;
        return;
      }
      res.created ? s.created++ : s.existing++;
      s.withoutWebsite++;
      if (project.discovery_provider !== 'none') {
        if (enqueue({ queue: 'discovery', type: 'resolve_website', projectId, companyId: res.companyId, payload: { name: row.name, city: row.city ?? null } })) s.queuedResolves++;
      }
    }
  });
  return s;
}
