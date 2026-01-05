PRAGMA foreign_keys = ON;

-- ----------------------------
-- 0) Migrations / settings
-- ----------------------------

CREATE TABLE IF NOT EXISTS schema_migrations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,
  applied_at_ms   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ----------------------------
-- 1) Users + Sessions (local)
-- ----------------------------

CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,           -- UUID/ULID
  email            TEXT NOT NULL UNIQUE,
  display_name     TEXT,
  password_hash    TEXT,                       -- nullable if you later add OAuth/local-trust
  created_at_ms    INTEGER NOT NULL,
  last_login_at_ms INTEGER,
  status           TEXT NOT NULL DEFAULT 'active' -- active|disabled
);

CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT PRIMARY KEY,            -- UUID/ULID
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash     TEXT NOT NULL UNIQUE,        -- store hash only
  created_at_ms  INTEGER NOT NULL,
  expires_at_ms  INTEGER NOT NULL,
  revoked_at_ms  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ----------------------------
-- 2) Documents (metadata + incremental indexing)
-- ----------------------------

CREATE TABLE IF NOT EXISTS documents (
  id             TEXT PRIMARY KEY,            -- UUID/ULID
  owner_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,

  -- UX identity (folders derive from this)
  path           TEXT NOT NULL UNIQUE,        -- e.g., "policy/07-document.md"
  uri            TEXT,                        -- optional: file://, s3://, hf://

  kind           TEXT NOT NULL,               -- doc|image|video|audio
  mime_type      TEXT,
  bytes          INTEGER NOT NULL,
  mtime_ms       INTEGER NOT NULL,            -- source modified time

  sha256         TEXT,                        -- content hash for change detection/dedupe
  ingest_status  TEXT NOT NULL DEFAULT 'pending',  -- pending|indexed|error
  error_message  TEXT,

  created_at_ms  INTEGER NOT NULL,
  updated_at_ms  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_mtime ON documents(mtime_ms);
CREATE INDEX IF NOT EXISTS idx_documents_sha ON documents(sha256);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_user_id);

-- ----------------------------
-- 3) Chunks (stable boundaries + offsets)
-- ----------------------------

CREATE TABLE IF NOT EXISTS doc_chunks (
  id             TEXT PRIMARY KEY,            -- UUID/ULID
  document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

  chunk_index    INTEGER NOT NULL,            -- 0..N
  start_byte     INTEGER NOT NULL,
  end_byte       INTEGER NOT NULL,

  content_sha256 TEXT,                        -- optional: chunk hash
  created_at_ms  INTEGER NOT NULL,

  UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_doc ON doc_chunks(document_id);

-- ----------------------------
-- 4) Full-text search (FTS5)
--    One FTS row per chunk
-- ----------------------------

CREATE VIRTUAL TABLE IF NOT EXISTS doc_chunks_fts
USING fts5(
  path,
  content,
  tags,
  chunk_id UNINDEXED,
  tokenize = 'porter'
);

-- Auto-delete FTS rows when chunks are deleted.
CREATE TRIGGER IF NOT EXISTS trg_chunks_delete_fts
AFTER DELETE ON doc_chunks
BEGIN
  DELETE FROM doc_chunks_fts WHERE chunk_id = OLD.id;
END;

-- ----------------------------
-- 5) Tags (folders come from documents.path)
-- ----------------------------

CREATE TABLE IF NOT EXISTS tags (
  id            TEXT PRIMARY KEY,            -- UUID/ULID
  name          TEXT NOT NULL UNIQUE,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS document_tags (
  document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag_id        TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(document_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_document_tags_tag ON document_tags(tag_id);

-- ----------------------------
-- 6) Runs / Trace / Evidence / Outputs
-- ----------------------------

CREATE TABLE IF NOT EXISTS runs (
  id              TEXT PRIMARY KEY,          -- UUID/ULID
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,

  task            TEXT NOT NULL,
  mode            TEXT NOT NULL DEFAULT 'balanced',  -- fast|balanced|thorough
  strict          INTEGER NOT NULL DEFAULT 1,        -- 0/1
  citations       INTEGER NOT NULL DEFAULT 1,        -- 0/1

  provider        TEXT NOT NULL,             -- local_cli|hf|openai_compat|custom
  model           TEXT NOT NULL,
  endpoint        TEXT,                      -- optional; store for reproducibility (no secrets)

  status          TEXT NOT NULL DEFAULT 'running',   -- running|succeeded|failed
  error_message   TEXT,

  created_at_ms   INTEGER NOT NULL,
  completed_at_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_runs_user_created ON runs(user_id, created_at_ms);

CREATE TABLE IF NOT EXISTS run_steps (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,
  stage         TEXT NOT NULL,               -- Index|Search|Select|Read|Analyze|Synthesize
  detail        TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  UNIQUE(run_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_run_steps_run ON run_steps(run_id);

CREATE TABLE IF NOT EXISTS run_evidence (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  chunk_id      TEXT NOT NULL REFERENCES doc_chunks(id) ON DELETE CASCADE,

  rank          REAL,
  snippet       TEXT NOT NULL,

  pinned        INTEGER NOT NULL DEFAULT 0,  -- 0/1
  excluded      INTEGER NOT NULL DEFAULT 0,  -- 0/1

  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_run_evidence_run ON run_evidence(run_id);
CREATE INDEX IF NOT EXISTS idx_run_evidence_chunk ON run_evidence(chunk_id);

CREATE TABLE IF NOT EXISTS run_outputs (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  format        TEXT NOT NULL,               -- markdown|text|json
  content       TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_run_outputs_run ON run_outputs(run_id);
