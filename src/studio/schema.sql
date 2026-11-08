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
