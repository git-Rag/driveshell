-- Migration 001: accounts and settings tables only.
--
-- files, FTS5, indexes, and triggers are in migration 002 (Phase 2),
-- because they depend on the full sync engine being in place.
--
-- Rules:
--   - Forward-only: no DROP TABLE or destructive changes.
--   - All timestamps are INTEGER unix milliseconds.
--   - PRAGMA foreign_keys=ON is set at connection time, not here.

CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER NOT NULL,
  applied_at INTEGER NOT NULL
);

-- ------------------------------------------------------------------ accounts
-- accounts.id = Drive permissionId (from about.get fields: user.permissionId).
-- This is stable across renames and does not require the openid scope.
-- email, display_name, avatar_url come from the same about.get call.
CREATE TABLE IF NOT EXISTS accounts (
  id                   TEXT    NOT NULL PRIMARY KEY,  -- Drive permissionId
  email                TEXT    NOT NULL,
  display_name         TEXT    NOT NULL,
  avatar_url           TEXT,
  -- 'readonly' | 'full'
  scope_level          TEXT    NOT NULL DEFAULT 'readonly',
  -- Incremental sync cursor (Drive changes API page token)
  changes_page_token   TEXT,
  -- Resumable full-sync state: page token within the current full listing pass
  full_sync_page_token TEXT,
  -- 'media_first' | 'rest' | 'done' | NULL (not started)
  full_sync_stage      TEXT,
  last_full_sync_at    INTEGER,
  last_incremental_at  INTEGER,
  -- 'ok' | 'syncing' | 'needs_reauth' | 'error'
  status               TEXT    NOT NULL DEFAULT 'ok',
  created_at           INTEGER NOT NULL
);

-- ------------------------------------------------------------------ settings
-- Simple key/value store for app-level configuration.
-- Keys are namespaced by convention, e.g. 'server.thumbCacheMaxBytes'.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT NOT NULL PRIMARY KEY,
  value TEXT NOT NULL
);

-- ------------------------------------------------------------------ version
INSERT INTO schema_version (version, applied_at)
VALUES (1, unixepoch() * 1000);

