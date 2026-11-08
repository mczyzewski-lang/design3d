-- Stair Studio: projekty schodów, wersje, udostępnienia, komentarze 3D, firmy wykonawcze
CREATE TABLE IF NOT EXISTS studio_projects (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- przeglądarki (klucz właściciela w ciasteczku, tylko hash) mające prawa właściciela projektu
CREATE TABLE IF NOT EXISTS studio_project_owners (
  project_id     TEXT NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  owner_key_hash TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (project_id, owner_key_hash)
);
CREATE INDEX IF NOT EXISTS idx_studio_owner_key ON studio_project_owners(owner_key_hash);

CREATE TABLE IF NOT EXISTS studio_versions (
  id         INTEGER PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  label      TEXT,
  config     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (project_id, version)
);

-- link udostępnienia (zawsze pokazuje bieżącą wersję projektu)
CREATE TABLE IF NOT EXISTS studio_shares (
  token      TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- jednorazowe tokeny „link właściciela” (przejęcie projektu na innym urządzeniu)
CREATE TABLE IF NOT EXISTS studio_claims (
  token_hash TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS studio_contractors (
  id            INTEGER PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT NOT NULL,
  consent_text  TEXT NOT NULL,
  consent_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS studio_sessions (
  token_hash    TEXT PRIMARY KEY,
  contractor_id INTEGER NOT NULL REFERENCES studio_contractors(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at    TEXT NOT NULL
);

-- kto otworzył udostępniony projekt (widoczne dla właściciela)
CREATE TABLE IF NOT EXISTS studio_access (
  project_id    TEXT NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  contractor_id INTEGER NOT NULL REFERENCES studio_contractors(id) ON DELETE CASCADE,
  first_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (project_id, contractor_id)
);

CREATE TABLE IF NOT EXISTS studio_comments (
  id            INTEGER PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  version       INTEGER,
  author_role   TEXT NOT NULL,          -- owner | contractor
  contractor_id INTEGER REFERENCES studio_contractors(id) ON DELETE SET NULL,
  author_name   TEXT NOT NULL,
  text          TEXT NOT NULL,
  pos           TEXT,                   -- JSON {x,y,z} w metrach (punkt na modelu) albo NULL
  resolved      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_studio_comments_project ON studio_comments(project_id, id);

-- podgląd projektu (zrzut sceny) do bramki udostępnionego linku
CREATE TABLE IF NOT EXISTS studio_thumbnails (
  project_id TEXT PRIMARY KEY REFERENCES studio_projects(id) ON DELETE CASCADE,
  mime       TEXT NOT NULL,
  data       BLOB NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- anonimowe zdarzenia do analityki (bez danych osobowych i bez IP)
CREATE TABLE IF NOT EXISTS studio_events (
  id         INTEGER PRIMARY KEY,
  type       TEXT NOT NULL,          -- visit | share_view | landing_shape
  page       TEXT,                   -- landing | configurator | share
  source     TEXT,                   -- pierwsze źródło wejścia (landing, google, direct, utm…)
  via        TEXT,                   -- kanał udostępnienia linku: link | email | sms
  project_id TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_studio_events_type ON studio_events(type, created_at);

-- „Znajdź wykonawcę”: zgłoszenie właściciela projektu z kodem pocztowym
CREATE TABLE IF NOT EXISTS studio_quote_requests (
  id           INTEGER PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  postal_code  TEXT NOT NULL,
  radius_km    INTEGER NOT NULL,
  consent_text TEXT NOT NULL,
  consent_at   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'new',   -- new | sent | closed
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- wykonawcy wybrani przez inwestora w tabeli „Znajdź wykonawców”
CREATE TABLE IF NOT EXISTS studio_quote_request_contractors (
  request_id    INTEGER NOT NULL REFERENCES studio_quote_requests(id) ON DELETE CASCADE,
  contractor_id INTEGER NOT NULL REFERENCES studio_contractors(id) ON DELETE CASCADE,
  distance_km   REAL,
  PRIMARY KEY (request_id, contractor_id)
);

-- numer telefonu jako „konto” właściciela projektów (potwierdzony kodem SMS)
CREATE TABLE IF NOT EXISTS studio_phones (
  phone       TEXT PRIMARY KEY,           -- +48XXXXXXXXX
  verified_at TEXT NOT NULL,
  method      TEXT NOT NULL               -- sms | test (tryb testowy bez bramki SMS)
);
CREATE TABLE IF NOT EXISTS studio_owner_phones (
  owner_key_hash TEXT PRIMARY KEY,
  phone          TEXT NOT NULL REFERENCES studio_phones(phone) ON DELETE CASCADE,
  verified_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS studio_otp (
  id             INTEGER PRIMARY KEY,
  phone          TEXT NOT NULL,
  owner_key_hash TEXT NOT NULL,
  code_hash      TEXT NOT NULL,
  attempts       INTEGER NOT NULL DEFAULT 0,
  expires_at     TEXT NOT NULL,
  used_at        TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_studio_otp_phone ON studio_otp(phone, id);

-- panel wykonawcy (CRM): status i kwota wyceny dla projektu
CREATE TABLE IF NOT EXISTS studio_contractor_quotes (
  contractor_id INTEGER NOT NULL REFERENCES studio_contractors(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'new',   -- new | in_progress | sent | won | lost
  amount        REAL,
  note          TEXT,
  viewed_at     TEXT,
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (contractor_id, project_id)
);
