/**
 * webcrypto-provider.ts — Pure WebCrypto implementation of VaultCryptoProvider.
 *
 * Runs seamlessly in Modern Browsers, Node.js 22+, and Android WebView without native addons.
 */

import type { VaultCryptoProvider, VaultKdfParams } from './types';

export class WebCryptoProvider implements VaultCryptoProvider {
  private cryptoSubtle: SubtleCrypto;
  private cryptoObj: Crypto;

  constructor() {
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
      this.cryptoObj = globalThis.crypto;
      this.cryptoSubtle = globalThis.crypto.subtle;
    } else {
      throw new Error('WebCrypto API (crypto.subtle) is not available in this environment');
    }
  }

  randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    this.cryptoObj.getRandomValues(bytes);
    return bytes;
  }

  async deriveKek(
    password: string,
    salt: Uint8Array,
    _params: VaultKdfParams,
  ): Promise<Uint8Array> {
    const enc = new TextEncoder();
    const passwordBytes = enc.encode(password);

    const baseKey = await this.cryptoSubtle.importKey(
      'raw',
      passwordBytes,
      { name: 'PBKDF2' },
      false,
      ['deriveBits'],
    );

    const derived = await this.cryptoSubtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt as ArrayBufferView as Uint8Array<ArrayBuffer>,
        iterations: 100_000,
        hash: 'SHA-256',
      },
      baseKey,
      256,
    );

    return new Uint8Array(derived);
  }

  async deriveFileKey(
    masterKey: Uint8Array,
    fileSalt: Uint8Array,
    info: string,
  ): Promise<Uint8Array> {
    const enc = new TextEncoder();
    const infoBytes = enc.encode(info);

    const ikmKey = await this.cryptoSubtle.importKey(
      'raw',
      masterKey as ArrayBufferView as Uint8Array<ArrayBuffer>,
      { name: 'HKDF' },
      false,
      ['deriveBits'],
    );

    const derived = await this.cryptoSubtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: fileSalt as ArrayBufferView as Uint8Array<ArrayBuffer>,
        info: infoBytes,
      },
      ikmKey,
      256,
    );

    return new Uint8Array(derived);
  }

  async encryptGcm(
    keyBytes: Uint8Array,
    iv: Uint8Array,
    plaintext: Uint8Array,
    additionalData?: Uint8Array,
  ): Promise<{ ciphertext: Uint8Array; authTag: Uint8Array }> {
    const key = await this.cryptoSubtle.importKey(
      'raw',
      keyBytes as ArrayBufferView as Uint8Array<ArrayBuffer>,
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    );

    const params: AesGcmParams = {
      name: 'AES-GCM',
      iv: iv as ArrayBufferView as Uint8Array<ArrayBuffer>,
      tagLength: 128,
    };
    if (additionalData) {
      params.additionalData = additionalData as ArrayBufferView as Uint8Array<ArrayBuffer>;
    }

    const encrypted = await this.cryptoSubtle.encrypt(
      params,
      key,
      plaintext as ArrayBufferView as Uint8Array<ArrayBuffer>,
    );

    const result = new Uint8Array(encrypted);
    // In WebCrypto, the last 16 bytes are the auth tag
    const ciphertext = result.slice(0, result.length - 16);
    const authTag = result.slice(result.length - 16);

    return { ciphertext, authTag };
  }

  async decryptGcm(
    keyBytes: Uint8Array,
    iv: Uint8Array,
    ciphertext: Uint8Array,
    authTag: Uint8Array,
    additionalData?: Uint8Array,
  ): Promise<Uint8Array> {
    const key = await this.cryptoSubtle.importKey(
      'raw',
      keyBytes as ArrayBufferView as Uint8Array<ArrayBuffer>,
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );

    // Concatenate ciphertext and auth tag for WebCrypto
    const combined = new Uint8Array(ciphertext.length + authTag.length);
    combined.set(ciphertext, 0);
    combined.set(authTag, ciphertext.length);

    const params: AesGcmParams = {
      name: 'AES-GCM',
      iv: iv as ArrayBufferView as Uint8Array<ArrayBuffer>,
      tagLength: 128,
    };
    if (additionalData) {
      params.additionalData = additionalData as ArrayBufferView as Uint8Array<ArrayBuffer>;
    }

    const decrypted = await this.cryptoSubtle.decrypt(params, key, combined);

    return new Uint8Array(decrypted);
  }
}
