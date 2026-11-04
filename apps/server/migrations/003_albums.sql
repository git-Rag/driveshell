-- Migration 003: albums and album_items tables for Phase 6.
--
-- Rules:
--   - Forward-only: no DROP TABLE or destructive changes.
--   - All timestamps are INTEGER unix milliseconds.
--   - foreign_keys = ON is already enabled at connection time.

CREATE TABLE IF NOT EXISTS albums (
  id             TEXT    PRIMARY KEY,
  account_id     TEXT    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title          TEXT    NOT NULL,
  description    TEXT,
  cover_file_id  TEXT,
  created_at     INTEGER NOT NULL,
  modified_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS album_items (
  album_id       TEXT    NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  file_id        TEXT    NOT NULL,
  added_at       INTEGER NOT NULL,
  PRIMARY KEY (album_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_albums_account
  ON albums(account_id, modified_at DESC);

CREATE INDEX IF NOT EXISTS idx_album_items_album
  ON album_items(album_id, added_at DESC);

CREATE INDEX IF NOT EXISTS idx_album_items_file
  ON album_items(file_id);

INSERT INTO schema_version (version, applied_at)
VALUES (3, unixepoch() * 1000);

