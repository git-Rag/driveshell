import { describe, it, expect } from 'vitest';
import {
  generateSalt,
  deriveVaultKey,
  encryptText,
  decryptText,
  verifyVaultKey,
  encryptBytes,
  decryptBytes,
  VAULT_CANARY_MESSAGE,
} from './lib/vault-crypto';

describe('Vault Crypto', () => {
  it('derives key, encrypts text, decrypts text, and verifies canary', async () => {
    const salt = generateSalt();
    expect(salt).toBeTruthy();

    const key = await deriveVaultKey('correct-password-123', salt);
    expect(key).toBeDefined();

    // Canary encryption & verification
    const canary = await encryptText(key, VAULT_CANARY_MESSAGE);
    expect(canary.ciphertextBase64).toBeTruthy();
    expect(canary.ivBase64).toBeTruthy();

    const decryptedCanary = await decryptText(key, canary.ciphertextBase64, canary.ivBase64);
    expect(decryptedCanary).toBe(VAULT_CANARY_MESSAGE);

    // Verify with same key
    const valid = await verifyVaultKey(key, canary.ciphertextBase64, canary.ivBase64);
    expect(valid).toBe(true);

    // Verify with wrong key
    const wrongKey = await deriveVaultKey('wrong-password-456', salt);
    const invalid = await verifyVaultKey(wrongKey, canary.ciphertextBase64, canary.ivBase64);
    expect(invalid).toBe(false);

    // Encrypt & decrypt arbitrary bytes
    const originalBytes = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
    const enc = await encryptBytes(key, originalBytes);
    const dec = await decryptBytes(key, enc.ciphertextBase64, enc.ivBase64);
    expect(Array.from(dec)).toEqual(Array.from(originalBytes));
  });
});
