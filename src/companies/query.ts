// Lista firm z wyszukiwarką, filtrami, sortowaniem i stronicowaniem + szczegóły firmy.

import { all, get, parseJson, type Param, type Row } from '../db/index.ts';


export interface CompanyFilter {
  search?: string;
  projectId?: number;
  category?: string;
  contact?: string; // email | form_only | none
  scanStatus?: string;
  minScore?: number;
  maxScore?: number;
  voivodeship?: string;
  hasConfigurator?: string; // '1' | '0'
  needsReview?: string;
  includeObjected?: boolean;
  sort?: string;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

const SORTS: Record<string, string> = {
  score: 'c.lead_score', name: 'c.name COLLATE NOCASE', city: 'c.city COLLATE NOCASE', updated: 'c.updated_at',
  scanned: 'c.last_scanned_at', created: 'c.id', category: 'c.category', status: 'c.scan_status',
};

export function buildWhere(f: CompanyFilter): { where: string; params: Param[]; join: string } {
  const w: string[] = ['c.merged_into_id IS NULL'];
  const params: Param[] = [];
  let join = '';
  if (f.projectId) {
    join = 'JOIN project_companies pc ON pc.company_id = c.id AND pc.project_id = ?';
    params.push(f.projectId);
  }
  if (!f.includeObjected) w.push(`c.objection_status = 'none'`);
  if (f.search) {
    const s = `%${f.search.trim().toLowerCase()}%`;
    w.push(`(LOWER(IFNULL(c.name,'')) LIKE ? OR LOWER(IFNULL(c.primary_domain,'')) LIKE ? OR LOWER(IFNULL(c.primary_email,'')) LIKE ? OR LOWER(IFNULL(c.city,'')) LIKE ? OR IFNULL(c.nip,'') LIKE ?
             OR EXISTS (SELECT 1 FROM domains d WHERE d.company_id = c.id AND d.domain LIKE ?))`);
    params.push(s, s, s, s, s, s);
  }
  if (f.category) {
    const cats = f.category.split(',').filter(Boolean);
    w.push(`c.category IN (${cats.map(() => '?').join(',')})`);
    params.push(...cats);
  }
  if (f.contact) {
    w.push('c.contact_status = ?');
    params.push(f.contact);
  }
  if (f.scanStatus) {
    const st = f.scanStatus.split(',').filter(Boolean);
    w.push(`c.scan_status IN (${st.map(() => '?').join(',')})`);
    params.push(...st);
  }
  if (f.minScore !== undefined && !Number.isNaN(f.minScore)) {
    w.push('c.lead_score >= ?');
    params.push(f.minScore);
  }
  if (f.maxScore !== undefined && !Number.isNaN(f.maxScore)) {
    w.push('c.lead_score <= ?');
    params.push(f.maxScore);
  }
  if (f.voivodeship) {
    w.push('c.voivodeship = ?');
    params.push(f.voivodeship);
  }
  if (f.hasConfigurator === '1' || f.hasConfigurator === '0') {
    w.push('IFNULL(c.has_configurator, 0) = ?');
    params.push(Number(f.hasConfigurator));
  }
  if (f.needsReview === '1') w.push('(c.needs_review = 1 OR c.scan_status IN (\'error\',\'blocked\'))');
  return { where: w.join(' AND '), params, join };
}

export function listCompanies(f: CompanyFilter): { total: number; rows: Row[]; page: number; pageSize: number } {
  const { where, params, join } = buildWhere(f);
  const pageSize = Math.min(500, Math.max(1, f.pageSize ?? 50));
  const page = Math.max(1, f.page ?? 1);
  const sortCol = SORTS[f.sort ?? 'score'] ?? SORTS.score;
  const dir = f.dir === 'asc' ? 'ASC' : 'DESC';
  const total = get(`SELECT COUNT(*) AS n FROM companies c ${join} WHERE ${where}`, ...params)!.n;
  const rows = all(
    `SELECT c.id, c.name, c.website_url, c.primary_domain, c.primary_email, c.primary_email_source, c.phone, c.city, c.voivodeship,
            c.category, c.lead_score, c.has_configurator, c.scan_status, c.contact_status, c.contact_form_url, c.last_scanned_at,
            c.analysis_status, c.needs_review, c.nip, c.objection_status,
            (SELECT COUNT(*) FROM contacts ct WHERE ct.company_id = c.id AND ct.kind = 'email' AND ct.status = 'active') AS email_count
     FROM companies c ${join} WHERE ${where}
     ORDER BY ${sortCol} IS NULL, ${sortCol} ${dir}, c.id DESC LIMIT ? OFFSET ?`,
    ...params, pageSize, (page - 1) * pageSize,
  );
  return { total, rows, page, pageSize };
}

export function companyDetail(id: number): Row | null {
  const c = get(`SELECT * FROM companies WHERE id = ?`, id);
  if (!c) return null;
  const contacts = all(`SELECT * FROM contacts WHERE company_id = ? ORDER BY kind, is_primary DESC, confidence DESC`, id).map((ct) => ({
    ...ct,
    sightings: all(`SELECT url, method, seen_at FROM contact_sightings WHERE contact_id = ? ORDER BY seen_at`, ct.id),
  }));
  return {
    ...c,
    specialization: parseJson(c.specialization, []),
    analysis: parseJson(c.analysis_json, null),
    domains: all(`SELECT * FROM domains WHERE company_id = ? ORDER BY is_primary DESC, id`, id),
    contacts,
    locations: all(`SELECT * FROM company_locations WHERE company_id = ?`, id),
    sources: all(`SELECT * FROM sources WHERE company_id = ? ORDER BY id DESC LIMIT 100`, id),
    projects: all(`SELECT p.id, p.name, pc.discovered_via FROM project_companies pc JOIN search_projects p ON p.id = pc.project_id WHERE pc.company_id = ?`, id),
    pages: all(
      `SELECT url, final_url, page_type, status_code, rendered, error, fetched_at FROM pages WHERE domain IN (SELECT domain FROM domains WHERE company_id = ?) ORDER BY id`,
      id,
    ),
    jobs: all(`SELECT id, queue, type, status, attempts, last_error, progress, created_at, finished_at FROM jobs WHERE company_id = ? ORDER BY id DESC LIMIT 20`, id),
    merged: all(`SELECT id, name, primary_domain FROM companies WHERE merged_into_id = ?`, id),
  };
}

