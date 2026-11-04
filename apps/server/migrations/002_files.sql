-- Migration 002: files table, FTS5 search, indexes, and sync triggers.
--
-- Rules:
--   - Forward-only: no DROP TABLE or destructive changes.
--   - All timestamps are INTEGER unix milliseconds.
--   - PRAGMA foreign_keys is already ON at connection time.
--   - rowid is explicit so FTS5 external-content can reference it directly.
--   - FTS5 uses trigram tokenizer for substring search on 3+ char queries.
--   - AFTER UPDATE trigger fires ONLY on name changes (not starred/trashed).

-- ------------------------------------------------------------------- files
CREATE TABLE IF NOT EXISTS files (
  rowid            INTEGER PRIMARY KEY,
  account_id       TEXT    NOT NULL,  -- references accounts(id)
  id               TEXT    NOT NULL,  -- Google Drive file ID
  name             TEXT    NOT NULL,
  mime_type        TEXT    NOT NULL,
  parent_id        TEXT,              -- nullable for root-level files
  size_bytes       INTEGER,
  modified_at      INTEGER NOT NULL,  -- unix ms
  created_at_ms    INTEGER NOT NULL,  -- unix ms (renamed to avoid clash with SQLite rowid alias)
  starred          INTEGER NOT NULL DEFAULT 0,
  trashed          INTEGER NOT NULL DEFAULT 0,
  thumbnail_url    TEXT,
  web_view_link    TEXT,
  image_width      INTEGER,
  image_height     INTEGER,
  -- exif fields for Photos view
  taken_at         INTEGER,           -- unix ms (from imageMediaMetadata.time)
  camera_make      TEXT,
  camera_model     TEXT,
  UNIQUE(account_id, id)
);

-- ------------------------------------------------------------------ FTS5
-- External-content FTS5 on files.name, linked via rowid.
-- Trigram tokenizer enables substring matching for queries of any length.
CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
  name,
  content='files',
  content_rowid='rowid',
  tokenize='trigram'
);

-- --------------------------------------------------------------- Triggers
-- AFTER INSERT: index the new file name.
CREATE TRIGGER IF NOT EXISTS files_fts_insert
  AFTER INSERT ON files
BEGIN
  INSERT INTO files_fts(rowid, name) VALUES (new.rowid, new.name);
END;

-- AFTER UPDATE OF name ONLY: re-index on rename.
-- Starring, trashing, thumbnail changes, etc. do NOT update FTS.
CREATE TRIGGER IF NOT EXISTS files_fts_update
  AFTER UPDATE OF name ON files
BEGIN
  DELETE FROM files_fts WHERE rowid = old.rowid;
  INSERT INTO files_fts(rowid, name) VALUES (new.rowid, new.name);
END;

-- AFTER DELETE: remove from FTS index.
CREATE TRIGGER IF NOT EXISTS files_fts_delete
  AFTER DELETE ON files
BEGIN
  DELETE FROM files_fts WHERE rowid = old.rowid;
END;

-- --------------------------------------------------------------- Indexes
CREATE INDEX IF NOT EXISTS idx_files_account
  ON files(account_id);

CREATE INDEX IF NOT EXISTS idx_files_account_mime
  ON files(account_id, mime_type);

-- Partial index — only starred rows (small, fast for favorites queries)
CREATE INDEX IF NOT EXISTS idx_files_account_starred
  ON files(account_id, starred) WHERE starred = 1;

CREATE INDEX IF NOT EXISTS idx_files_account_modified
  ON files(account_id, modified_at DESC);

-- Partial index — only files that have EXIF taken_at (photos with date)
CREATE INDEX IF NOT EXISTS idx_files_account_taken
  ON files(account_id, taken_at DESC) WHERE taken_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_files_parent
  ON files(account_id, parent_id);

-- ---------------------------------------------------------------- version
INSERT INTO schema_version (version, applied_at)
VALUES (2, unixepoch() * 1000);

