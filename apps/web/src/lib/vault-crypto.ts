/**
 * vault-crypto.ts — Zero-Knowledge Client-Side AES-256-GCM + PBKDF2 implementation.
 *
 * Cryptographic invariants:
 *  - Master key is derived using PBKDF2 with SHA-256 and 100,000 iterations.
 *  - Encryption uses AES-256-GCM with a fresh 12-byte (96-bit) IV for each operation.
 *  - The plaintext passphrase and derived key are NEVER transmitted to the server or persisted.
 *  - Web Crypto API is used exclusively for hardware-accelerated, constant-time operations.
 */

export const VAULT_CANARY_MESSAGE = 'driveshell-vault-verified';
const PBKDF2_ITERATIONS = 100_000;

export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateSalt(): string {
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  return bufferToBase64(salt);
}

export function generateIv(): Uint8Array {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  return iv;
}

/**
 * Derive AES-256-GCM key from user passphrase and salt via PBKDF2 (100k iterations).
 */
export async function deriveVaultKey(passphrase: string, saltBase64: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passphraseBytes = enc.encode(passphrase);
  const saltBytes = base64ToBuffer(saltBase64);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passphraseBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable from memory
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt arbitrary bytes with AES-256-GCM.
 */
export async function encryptBytes(
  key: CryptoKey,
  data: Uint8Array | ArrayBuffer,
): Promise<{ ciphertextBase64: string; ivBase64: string }> {
  const iv = generateIv();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    data as unknown as BufferSource,
  );

  return {
    ciphertextBase64: bufferToBase64(encrypted),
    ivBase64: bufferToBase64(iv),
  };
}

/**
 * Decrypt bytes with AES-256-GCM.
 */
export async function decryptBytes(
  key: CryptoKey,
  ciphertextBase64: string,
  ivBase64: string,
): Promise<Uint8Array> {
  const ciphertext = base64ToBuffer(ciphertextBase64);
  const iv = base64ToBuffer(ivBase64);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    ciphertext as unknown as BufferSource,
  );
  return new Uint8Array(decrypted);
}

/**
 * Encrypt a text string.
 */
export async function encryptText(
  key: CryptoKey,
  text: string,
): Promise<{ ciphertextBase64: string; ivBase64: string }> {
  const data = new TextEncoder().encode(text);
  return encryptBytes(key, data);
}

/**
 * Decrypt a text string.
 */
export async function decryptText(
  key: CryptoKey,
  ciphertextBase64: string,
  ivBase64: string,
): Promise<string> {
  const decrypted = await decryptBytes(key, ciphertextBase64, ivBase64);
  return new TextDecoder().decode(decrypted);
}

/**
 * Verify if key is valid against canary ciphertext.
 */
export async function verifyVaultKey(
  key: CryptoKey,
  canaryCiphertext: string,
  canaryIv: string,
): Promise<boolean> {
  try {
    const text = await decryptText(key, canaryCiphertext, canaryIv);
    return text === VAULT_CANARY_MESSAGE;
  } catch {
    return false;
  }
}
