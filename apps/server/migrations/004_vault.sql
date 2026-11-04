-- Migration 004: private vault tables for Phase 8 & 9.
--
-- Zero-knowledge encryption architecture:
--   - Salt and canary ciphertext stored on server.
--   - Passphrase and derived AES-256-GCM master key are NEVER stored or transmitted.
--   - Files stored in vault_files have their contents encrypted client-side.

CREATE TABLE IF NOT EXISTS vault_settings (
  account_id           TEXT    PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  salt                 TEXT    NOT NULL,
  canary_ciphertext    TEXT    NOT NULL,
  canary_iv            TEXT    NOT NULL,
  created_at           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vault_files (
  id                   TEXT    PRIMARY KEY,
  account_id           TEXT    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name                 TEXT    NOT NULL,
  mime_type            TEXT    NOT NULL,
  size_bytes           INTEGER NOT NULL,
  encrypted_payload    BLOB    NOT NULL,
  iv                   TEXT    NOT NULL,
  created_at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vault_files_account
  ON vault_files(account_id, created_at DESC);

INSERT INTO schema_version (version, applied_at)
VALUES (4, unixepoch() * 1000);
