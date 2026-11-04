/**
 * types.ts — Sunflower Drive Vault (SDV1) Cryptographic Types & Interfaces.
 */

export interface VaultKdfParams {
  m: number; // Memory cost in KiB (e.g., 65536)
  t: number; // Iterations (e.g., 3)
  p: number; // Parallelism (e.g., 4)
}

export interface EncryptedMetadata {
  name: string;
  mimeType: string;
  sizeBytes: number;
  modifiedAt: number;
  thumbnailIv?: string;
  thumbnailTag?: string;
  extra?: Record<string, unknown>;
}

export interface SDV1Header {
  magic: number; // 0x53445631 ("SDV1")
  version: number; // 1
  fileSalt: Uint8Array; // 32 bytes
  headerIv: Uint8Array; // 12 bytes
  metadataCiphertext: Uint8Array;
  headerAuthTag: Uint8Array; // 16 bytes
}

export interface WrappedMasterKey {
  wrappedKey: Uint8Array; // 32 bytes ciphertext
  iv: Uint8Array; // 12 bytes
  authTag: Uint8Array; // 16 bytes
  kdfParams: VaultKdfParams;
  salt: Uint8Array; // 32 bytes
}

export interface VaultCryptoProvider {
  /** Derive Key Encryption Key (KEK) from password and salt */
  deriveKek(password: string, salt: Uint8Array, params: VaultKdfParams): Promise<Uint8Array>;

  /** Derive per-file subkey from Master Key and File Salt using HKDF-SHA256 */
  deriveFileKey(masterKey: Uint8Array, fileSalt: Uint8Array, info: string): Promise<Uint8Array>;

  /** Authenticated encryption via AES-256-GCM */
  encryptGcm(
    key: Uint8Array,
    iv: Uint8Array,
    plaintext: Uint8Array,
    additionalData?: Uint8Array,
  ): Promise<{ ciphertext: Uint8Array; authTag: Uint8Array }>;

  /** Authenticated decryption via AES-256-GCM */
  decryptGcm(
    key: Uint8Array,
    iv: Uint8Array,
    ciphertext: Uint8Array,
    authTag: Uint8Array,
    additionalData?: Uint8Array,
  ): Promise<Uint8Array>;

  /** Cryptographically secure pseudorandom number generator */
  randomBytes(length: number): Uint8Array;
}
