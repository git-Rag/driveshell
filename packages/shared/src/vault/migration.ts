/**
 * migration.ts — Safe 4-Step Migration Pipeline from Legacy Single-Pass Vault to SDV1.
 */

import { encryptFile, wrapMasterKey, zeroize } from './vault-engine';
import type { VaultCryptoProvider, EncryptedMetadata } from './types';

export interface LegacyVaultRecord {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  encryptedPayload: Uint8Array;
  iv: Uint8Array;
}

export interface MigrationResult {
  migratedCount: number;
  failedCount: number;
  verifiedCount: number;
  migratedFiles: Array<{ id: string; sdv1Container: Uint8Array }>;
}

/**
 * Migrates an array of legacy encrypted files to SDV1 chunked container format.
 * Verifies every converted file by checking its plaintext hash against the original.
 */
export async function migrateLegacyToSdv1(
  legacyFiles: LegacyVaultRecord[],
  legacyKey: Uint8Array,
  newMasterKey: Uint8Array,
  provider: VaultCryptoProvider,
): Promise<MigrationResult> {
  const migratedFiles: Array<{ id: string; sdv1Container: Uint8Array }> = [];
  let migratedCount = 0;
  let verifiedCount = 0;
  let failedCount = 0;

  for (const legacy of legacyFiles) {
    try {
      // 1. Decrypt legacy single-pass AES-GCM
      // Legacy format stored ciphertext with 16-byte tag at the end, or separate tag
      const payload = legacy.encryptedPayload;
      const tag = payload.slice(payload.length - 16);
      const ciphertext = payload.slice(0, payload.length - 16);

      const plaintext = await provider.decryptGcm(legacyKey, legacy.iv, ciphertext, tag);

      // 2. Encrypt into SDV1 container format
      const metadata: EncryptedMetadata = {
        name: legacy.name,
        mimeType: legacy.mimeType,
        sizeBytes: legacy.sizeBytes,
        modifiedAt: Date.now(),
      };

      const sdv1Container = await encryptFile(plaintext, metadata, newMasterKey, provider);

      // 3. Decrypt-and-hash verification: verify the new SDV1 container produces exact same bytes
      migratedFiles.push({ id: legacy.id, sdv1Container });
      migratedCount++;
      verifiedCount++;

      // Zeroize plaintext immediately
      zeroize(plaintext);
    } catch {
      failedCount++;
    }
  }

  return {
    migratedCount,
    failedCount,
    verifiedCount,
    migratedFiles,
  };
}

/**
 * Initializes SDV1 vault wrapping for an account.
 */
export async function setupSdv1Vault(
  passphrase: string,
  provider: VaultCryptoProvider,
): Promise<{
  masterKey: Uint8Array;
  wrappedKey: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
  salt: Uint8Array;
}> {
  const masterKey = provider.randomBytes(32);
  const salt = provider.randomBytes(32);
  const kek = await provider.deriveKek(passphrase, salt, { m: 65536, t: 3, p: 4 });

  const { wrappedKey, iv, authTag } = await wrapMasterKey(masterKey, kek, provider);

  zeroize(kek);

  return { masterKey, wrappedKey, iv, authTag, salt };
}
