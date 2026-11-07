-- Lead Discovery — schemat bazy (SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS search_projects (
  id                     INTEGER PRIMARY KEY,
  name                   TEXT NOT NULL,
  industry               TEXT NOT NULL,              -- klucz profilu branży, np. 'stairs'
  keywords               TEXT NOT NULL DEFAULT '[]', -- JSON: frazy bazowe
  cities                 TEXT NOT NULL DEFAULT '[]', -- JSON: miasta do kombinacji fraz
  country                TEXT NOT NULL DEFAULT 'PL',
  region                 TEXT,                        -- np. województwo lub NULL = cały kraj
  max_companies          INTEGER NOT NULL DEFAULT 1000,
  max_pages_per_company  INTEGER NOT NULL DEFAULT 8,
  discovery_provider     TEXT NOT NULL DEFAULT 'none', -- none | brave | google
  budget_limit_usd       REAL NOT NULL DEFAULT 0,      -- 0 = brak zgody na płatne zapytania
  api_cost_usd           REAL NOT NULL DEFAULT 0,
  ai_enabled             INTEGER NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'draft', -- draft | running | paused | completed | stopped
  started_at             TEXT,
  finished_at            TEXT,
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS companies (
  id                      INTEGER PRIMARY KEY,
  name                    TEXT,
  nip                     TEXT,
  website_url             TEXT,
  primary_domain          TEXT,
  primary_email           TEXT,
  primary_email_source    TEXT,
  phone                   TEXT,
  city                    TEXT,
  voivodeship             TEXT,
  address                 TEXT,
  industry                TEXT,
  specialization          TEXT,                         -- JSON: rodzaje schodów
  category                TEXT,                         -- manufacturer | manufacturer_installer | installer | construction | wholesale | unrelated | unknown
  lead_score              INTEGER,
  has_configurator        INTEGER,                      -- 0/1/NULL
  contact_status          TEXT NOT NULL DEFAULT 'unknown', -- email | form_only | none | unknown
  contact_form_url        TEXT,
  scan_status             TEXT NOT NULL DEFAULT 'pending', -- pending | scanning | done | no_website | blocked | error | robots_disallowed
  scan_error              TEXT,
  last_scanned_at         TEXT,
  next_reverify_at        TEXT,
  analysis_status         TEXT NOT NULL DEFAULT 'pending', -- pending | heuristic | ai | error
  analysis_json           TEXT,
  ai_summary              TEXT,
  needs_review            INTEGER NOT NULL DEFAULT 0,
  marketing_consent       TEXT NOT NULL DEFAULT 'not_confirmed', -- not_confirmed | confirmed
  objection_status        TEXT NOT NULL DEFAULT 'none',          -- none | objected
  objection_at            TEXT,
  merged_into_id          INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_companies_nip ON companies(nip) WHERE nip IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_score ON companies(lead_score);
CREATE INDEX IF NOT EXISTS idx_companies_merged ON companies(merged_into_id);

-- Firma może należeć do wielu projektów
CREATE TABLE IF NOT EXISTS project_companies (
  project_id   INTEGER NOT NULL REFERENCES search_projects(id) ON DELETE CASCADE,
  company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  discovered_via TEXT NOT NULL,      -- search | csv | merge
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (project_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_pc_company ON project_companies(company_id);

-- Jedna firma może mieć kilka domen
CREATE TABLE IF NOT EXISTS domains (
  id               INTEGER PRIMARY KEY,
  domain           TEXT NOT NULL UNIQUE,     -- domena rejestrowalna, np. schody-kowalski.pl
  company_id       INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  is_primary       INTEGER NOT NULL DEFAULT 0,
  start_url        TEXT,
  final_url        TEXT,                     -- po przekierowaniach
  redirects_to     TEXT,                     -- inna domena, jeśli przekierowuje
  http_status      INTEGER,
  alive            INTEGER,                  -- 0/1/NULL
  robots_status    TEXT,                     -- allowed | disallowed | unavailable
  last_fetched_at  TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_domains_company ON domains(company_id);

-- Jedna domena może reprezentować kilka oddziałów
CREATE TABLE IF NOT EXISTS company_locations (
  id          INTEGER PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  city        TEXT,
  postal_code TEXT,
  voivodeship TEXT,
  address     TEXT,
  source_url  TEXT,
  UNIQUE (company_id, postal_code, city)
);

-- Kontakty: e-mail, telefon, formularz
CREATE TABLE IF NOT EXISTS contacts (
  id            INTEGER PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,             -- email | phone | form
  value         TEXT NOT NULL,             -- znormalizowana wartość
  source_url    TEXT NOT NULL,             -- najlepsze (pierwsze najbardziej wiarygodne) źródło
  method        TEXT NOT NULL,             -- mailto | text | footer | obfuscated | cfemail | jsonld | rendered | tel | form
  category      TEXT,                      -- sales | general | customer | personal | complaints | recruitment | accounting | support | privacy | agency | other
  confidence    REAL NOT NULL DEFAULT 0.5, -- 0..1
  context       TEXT,                      -- krótki fragment otoczenia
  is_primary    INTEGER NOT NULL DEFAULT 0,
  is_personal   INTEGER NOT NULL DEFAULT 0, -- może stanowić dane osobowe
  status        TEXT NOT NULL DEFAULT 'active', -- active | stale
  first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  verified_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (company_id, kind, value)
);
CREATE INDEX IF NOT EXISTS idx_contacts_value ON contacts(kind, value);

-- Wszystkie miejsca, w których dany kontakt wystąpił
CREATE TABLE IF NOT EXISTS contact_sightings (
  contact_id  INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  method      TEXT NOT NULL,
  seen_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (contact_id, url, method)
);

-- Pochodzenie danych (wyniki wyszukiwania, import CSV, rejestry)
CREATE TABLE IF NOT EXISTS sources (
  id          INTEGER PRIMARY KEY,
  company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  project_id  INTEGER REFERENCES search_projects(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL,      -- search_result | csv_import | crawl | registry
  provider    TEXT,
  url         TEXT,
  title       TEXT,
  snippet     TEXT,
  query       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sources_company ON sources(company_id);

-- Cache przeskanowanych stron (wyekstrahowane dane, nie surowy HTML)
CREATE TABLE IF NOT EXISTS pages (
  id            INTEGER PRIMARY KEY,
  domain        TEXT NOT NULL,
  url           TEXT NOT NULL UNIQUE,
  final_url     TEXT,
  page_type     TEXT,              -- home | contact | about | offer | gallery | other
  status_code   INTEGER,
  rendered      INTEGER NOT NULL DEFAULT 0,
  content_hash  TEXT,
  title         TEXT,
  extracted     TEXT,              -- JSON PageExtraction
  error         TEXT,
  fetched_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_pages_domain ON pages(domain);

-- Zapytania discovery (żeby nie powtarzać płatnych zapytań)
CREATE TABLE IF NOT EXISTS discovery_queries (
  id            INTEGER PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES search_projects(id) ON DELETE CASCADE,
  query         TEXT NOT NULL,
  page          INTEGER NOT NULL DEFAULT 0,
  provider      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | done | error | skipped
  results_count INTEGER,
  new_companies INTEGER,
  cost_usd      REAL NOT NULL DEFAULT 0,
  error         TEXT,
  executed_at   TEXT,
  UNIQUE (project_id, query, page, provider)
);

-- Trwała kolejka zadań
CREATE TABLE IF NOT EXISTS jobs (
  id            INTEGER PRIMARY KEY,
  queue         TEXT NOT NULL,           -- discovery | crawl | analysis
  type          TEXT NOT NULL,           -- discover_query | scan_company | analyze_company
  project_id    INTEGER REFERENCES search_projects(id) ON DELETE CASCADE,
  company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  payload       TEXT NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'queued', -- queued | running | done | failed | paused | cancelled
  priority      INTEGER NOT NULL DEFAULT 0,
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 4,
  run_after     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  locked_at     TEXT,
  locked_by     TEXT,
  progress      TEXT,                    -- JSON: checkpoint / postęp
  last_error    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_claim ON jobs(queue, status, run_after, priority);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id);

-- Monitoring błędów
CREATE TABLE IF NOT EXISTS error_log (
  id          INTEGER PRIMARY KEY,
  job_id      INTEGER,
  project_id  INTEGER,
  company_id  INTEGER,
  scope       TEXT NOT NULL,       -- crawl | discovery | analysis | system
  message     TEXT NOT NULL,
  url         TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_error_project ON error_log(project_id, created_at);

-- Koszty API
CREATE TABLE IF NOT EXISTS api_usage (
  id          INTEGER PRIMARY KEY,
  project_id  INTEGER,
  provider    TEXT NOT NULL,       -- brave | google | anthropic
  units       INTEGER NOT NULL DEFAULT 1,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost_usd    REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- RODO: lista wykluczeń (hash identyfikatora), by nie zbierać ponownie danych po sprzeciwie/usunięciu
CREATE TABLE IF NOT EXISTS suppressions (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,       -- email | domain | nip
  value_hash  TEXT NOT NULL,
  reason      TEXT NOT NULL,       -- objection | erasure
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (kind, value_hash)
);

-- RODO: rejestr czynności (usunięcia, sprzeciwy, retencja)
CREATE TABLE IF NOT EXISTS privacy_log (
  id          INTEGER PRIMARY KEY,
  company_id  INTEGER,
  action      TEXT NOT NULL,       -- objection | erasure | retention_purge | consent_update
  details     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
