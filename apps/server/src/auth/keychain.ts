/**
 * Keychain module — secure credential storage.
 *
 * Primary:  @napi-rs/keyring (Windows Credential Manager / macOS Keychain /
 *           Linux Secret Service via libsecret).
 * Fallback: AES-256-GCM encrypted file at <dataDir>/keychain.enc.json.
 *           Used when the native module fails to load (headless servers,
 *           containers, CI environments).
 *
 * Per-entry size limit:
 *   Windows Credential Manager caps credential values at 2 560 bytes.
 *   We store each logical secret (clientId, clientSecret, each token set) as
 *   a SEPARATE entry so we never approach that limit.
 *
 * Entry naming convention:
 *   service = "driveshell"
 *   key     = "client-id" | "client-secret" | "token-<permissionId>"
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { getDataDir } from '../db/connection';

// ---------------------------------------------------------------------------
// Native keyring — loaded lazily so the server still starts if the native
// module is absent (the encrypted-file fallback takes over).
// ---------------------------------------------------------------------------

type KeyringModule = {
  Entry: new (
    service: string,
    name: string,
  ) => {
    getPassword(): string | null;
    setPassword(password: string): void;
    deletePassword(): boolean;
  };
};

let keyringModule: KeyringModule | null | 'failed' = null;

function loadKeyring(): KeyringModule | null {
  if (keyringModule === 'failed') return null;
  if (keyringModule) return keyringModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic native module
    keyringModule = require('@napi-rs/keyring') as KeyringModule;
    return keyringModule;
  } catch {
    keyringModule = 'failed';
    return null;
  }
}

// ---------------------------------------------------------------------------
// Encrypted-file fallback
// ---------------------------------------------------------------------------

const ALGO = 'aes-256-gcm' as const;
const KEY_LEN = 32; // bytes
const SALT_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const KDF_ITERATIONS = 100_000;

/** Derive a 32-byte key from a machine-scoped secret + salt using PBKDF2. */
function deriveKey(machineSecret: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(machineSecret, salt, KDF_ITERATIONS, KEY_LEN, 'sha256');
}

/**
 * A simple machine-scoped secret derived from fixed env + hostname.
 * This protects the file at rest against casual access; it is NOT a HSM.
 * The file should still have restricted filesystem permissions (600).
 */
function machineSecret(prefix = 'projectsunflower'): string {
  return `${prefix}:${process.env['DATA_DIR'] ?? ''}:${process.env['COMPUTERNAME'] ?? process.env['HOSTNAME'] ?? 'local'}`;
}

type EncryptedStore = Record<string, string>; // "service:key" → base64 ciphertext blob

function getStorePath(): string {
  return path.join(getDataDir(), 'keychain.enc.json');
}

function readStore(): EncryptedStore {
  const p = getStorePath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as EncryptedStore;
  } catch {
    return {};
  }
}

function writeStore(store: EncryptedStore): void {
  const p = getStorePath();
  const json = JSON.stringify(store, null, 0);
  fs.writeFileSync(p, json, { mode: 0o600 });
}

/** Encrypt a plaintext value → base64 blob (salt‖iv‖tag‖ciphertext). */
function encryptValue(plaintext: string): string {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(machineSecret(), salt);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, tag, ct]).toString('base64');
}

/** Decrypt a base64 blob → plaintext. Returns null on any error. */
function decryptValue(blob: string): string | null {
  for (const prefix of ['projectsunflower', 'sunflowerdrive', 'driveshell']) {
    try {
      const buf = Buffer.from(blob, 'base64');
      const salt = buf.subarray(0, SALT_LEN);
      const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
      const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
      const ct = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);
      const key = deriveKey(machineSecret(prefix), salt);
      const decipher = crypto.createDecipheriv(ALGO, key, iv);
      decipher.setAuthTag(tag);
      return decipher.update(ct, undefined, 'utf8') + decipher.final('utf8');
    } catch {
      continue;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface Keychain {
  get(service: string, key: string): string | null;
  set(service: string, key: string, value: string): void;
  delete(service: string, key: string): void;
}

/** Build the composed keychain (native → encrypted-file fallback). */
export function createKeychain(log: FastifyBaseLogger): Keychain {
  const kr = loadKeyring();
  const useNative = kr !== null;

  if (useNative) {
    log.info('Keychain: using native OS keyring');
  } else {
    log.warn('Keychain: native module unavailable — using encrypted-file fallback');
  }

  return {
    get(service: string, key: string): string | null {
      const fetchOne = (svc: string): string | null => {
        if (useNative && kr) {
          try {
            return new kr.Entry(svc, key).getPassword();
          } catch (err) {
            log.warn(
              { err, service: svc, key: '[REDACTED]' },
              'Keychain native get failed; falling back to file',
            );
          }
        }
        const store = readStore();
        const blob = store[`${svc}:${key}`];
        if (!blob) return null;
        return decryptValue(blob);
      };

      const val = fetchOne(service);
      if (val !== null) return val;
      // Seamless migration fallback from legacy service names
      if (service === KC_SERVICE) {
        const legacyVal = fetchOne(KC_SERVICE_LEGACY);
        if (legacyVal !== null) return legacyVal;
        return fetchOne(KC_SERVICE_LEGACY_OLD);
      }
      return null;
    },

    set(service: string, key: string, value: string): void {
      if (useNative && kr) {
        try {
          new kr.Entry(service, key).setPassword(value);
          return;
        } catch (err) {
          log.warn(
            { err, service, key: '[REDACTED]' },
            'Keychain native set failed; falling back to file',
          );
        }
      }
      const store = readStore();
      store[`${service}:${key}`] = encryptValue(value);
      writeStore(store);
    },

    delete(service: string, key: string): void {
      if (useNative && kr) {
        try {
          new kr.Entry(service, key).deletePassword();
          return;
        } catch (err) {
          log.warn(
            { err, service, key: '[REDACTED]' },
            'Keychain native delete failed; falling back to file',
          );
        }
      }
      const store = readStore();
      delete store[`${service}:${key}`];
      writeStore(store);
    },
  };
}

// ---------------------------------------------------------------------------
// Keychain key constants (single source of truth)
// ---------------------------------------------------------------------------
export const KC_SERVICE = 'projectsunflower';
export const KC_SERVICE_LEGACY = 'sunflowerdrive';
export const KC_SERVICE_LEGACY_OLD = 'driveshell';
export const KC_CLIENT_ID = 'client-id';
export const KC_CLIENT_SECRET = 'client-secret';
export function kcTokenKey(permissionId: string): string {
  return `token-${permissionId}`;
}
