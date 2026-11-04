/**
 * Vault DB queries — prepared-statement wrappers for Phase 9 Private Vault.
 *
 * Invariants:
 *  - Passphrase and keys are NEVER stored in the database.
 *  - The server only holds the salt, canary ciphertext, and encrypted payloads.
 */

import type { Db } from '../connection';

export interface VaultSettingsRow {
  account_id: string;
  salt: string;
  canary_ciphertext: string;
  canary_iv: string;
  created_at: number;
}

export interface VaultFileMeta {
  id: string;
  account_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  iv: string;
  created_at: number;
}

export interface VaultFileRow extends VaultFileMeta {
  encrypted_payload: Buffer;
}

export function buildVaultQueries(db: Db) {
  const getSettingsStmt = db.prepare<[string], VaultSettingsRow>(`
    SELECT account_id, salt, canary_ciphertext, canary_iv, created_at
    FROM vault_settings
    WHERE account_id = ?
  `);

  const insertSettingsStmt = db.prepare<[string, string, string, string, number], void>(`
    INSERT INTO vault_settings (account_id, salt, canary_ciphertext, canary_iv, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET
      salt = excluded.salt,
      canary_ciphertext = excluded.canary_ciphertext,
      canary_iv = excluded.canary_iv,
      created_at = excluded.created_at
  `);

  const listFilesStmt = db.prepare<[string], VaultFileMeta>(`
    SELECT id, account_id, name, mime_type, size_bytes, iv, created_at
    FROM vault_files
    WHERE account_id = ?
    ORDER BY created_at DESC
  `);

  const getFileStmt = db.prepare<[string, string], VaultFileRow>(`
    SELECT id, account_id, name, mime_type, size_bytes, encrypted_payload, iv, created_at
    FROM vault_files
    WHERE account_id = ? AND id = ?
  `);

  const insertFileStmt = db.prepare<
    [string, string, string, string, number, Buffer, string, number],
    void
  >(`
    INSERT INTO vault_files (id, account_id, name, mime_type, size_bytes, encrypted_payload, iv, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const deleteFileStmt = db.prepare<[string, string], void>(`
    DELETE FROM vault_files
    WHERE account_id = ? AND id = ?
  `);

  const clearFilesStmt = db.prepare<[string], void>(`
    DELETE FROM vault_files WHERE account_id = ?
  `);

  const deleteSettingsStmt = db.prepare<[string], void>(`
    DELETE FROM vault_settings WHERE account_id = ?
  `);

  return {
    getSettings(accountId: string): VaultSettingsRow | null {
      return getSettingsStmt.get(accountId) ?? null;
    },

    setup(accountId: string, salt: string, canaryCiphertext: string, canaryIv: string): void {
      insertSettingsStmt.run(accountId, salt, canaryCiphertext, canaryIv, Date.now());
    },

    listFiles(accountId: string): VaultFileMeta[] {
      return listFilesStmt.all(accountId);
    },

    getFile(accountId: string, fileId: string): VaultFileRow | null {
      return getFileStmt.get(accountId, fileId) ?? null;
    },

    saveFile(
      accountId: string,
      id: string,
      name: string,
      mimeType: string,
      sizeBytes: number,
      encryptedPayload: Buffer,
      iv: string,
    ): void {
      insertFileStmt.run(
        id,
        accountId,
        name,
        mimeType,
        sizeBytes,
        encryptedPayload,
        iv,
        Date.now(),
      );
    },

    deleteFile(accountId: string, fileId: string): boolean {
      const res = deleteFileStmt.run(accountId, fileId);
      return res.changes > 0;
    },

    reset(accountId: string): void {
      const resetTx = db.transaction(() => {
        clearFilesStmt.run(accountId);
        deleteSettingsStmt.run(accountId);
      });
      resetTx();
    },
  };
}

export type VaultQueries = ReturnType<typeof buildVaultQueries>;
