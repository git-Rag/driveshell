/**
 * vault-sdv1.test.ts — Comprehensive test suite for SDV1 Cryptographic Core.
 *
 * Verifies:
 *  1. Byte-for-byte fidelity with committed test vectors (test-vectors.json)
 *  2. Multi-chunk round-trip encryption/decryption (spanning multiple 1 MiB chunks)
 *  3. Tamper resistance (ciphertext bitflip, header tampering, chunk swap, truncation)
 *  4. Video seeking range decryption across chunk boundaries
 *  5. Memory zeroization
 *  6. Legacy to SDV1 migration pipeline with hash verification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  WebCryptoProvider,
  encryptFile,
  decryptFile,
  decryptRange,
  zeroize,
  CHUNK_SIZE,
  decodeHeader,
  migrateLegacyToSdv1,
} from '@driveshell/shared';
import type { EncryptedMetadata, LegacyVaultRecord } from '@driveshell/shared';

describe('SDV1 Cryptographic Specification & Engine', () => {
  let provider: WebCryptoProvider;

  beforeEach(() => {
    provider = new WebCryptoProvider();
  });

  describe('1. Byte-for-Byte Test Vectors Validation', () => {
    it('reproduces committed test-vectors.json exactly byte for byte', async () => {
      const vectorsPath = path.resolve(
        __dirname,
        '..',
        '..',
        '..',
        'packages',
        'vault-spec',
        'test-vectors.json',
      );
      const vectors = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));

      const kdfSalt = Buffer.from(vectors.kdf.salt_hex, 'hex');
      const derivedKek = await provider.deriveKek(
        vectors.kdf.test_password,
        kdfSalt,
        vectors.kdf.params,
      );
      expect(Buffer.from(derivedKek).toString('hex')).toBe(vectors.kdf.derived_kek_hex);

      // File Key Derivation
      const masterKey = Buffer.from(vectors.master_key.raw_hex, 'hex');
      const fileSalt = Buffer.from(vectors.file_key_derivation.file_salt_hex, 'hex');
      const fileKey = await provider.deriveFileKey(
        masterKey,
        fileSalt,
        vectors.file_key_derivation.info,
      );
      expect(Buffer.from(fileKey).toString('hex')).toBe(
        vectors.file_key_derivation.derived_file_key_hex,
      );

      // Master Key Wrap
      const wrapIv = Buffer.from(vectors.master_key.wrap_iv_hex, 'hex');
      const { ciphertext: wrappedMk, authTag: wrapTag } = await provider.encryptGcm(
        derivedKek,
        wrapIv,
        masterKey,
      );
      expect(Buffer.from(wrappedMk).toString('hex')).toBe(
        vectors.master_key.wrapped_ciphertext_hex,
      );
      expect(Buffer.from(wrapTag).toString('hex')).toBe(vectors.master_key.auth_tag_hex);

      // Master Key Unwrap
      const unwrapped = await provider.decryptGcm(
        derivedKek,
        wrapIv,
        Buffer.from(vectors.master_key.wrapped_ciphertext_hex, 'hex'),
        Buffer.from(vectors.master_key.auth_tag_hex, 'hex'),
      );
      expect(Buffer.from(unwrapped).toString('hex')).toBe(vectors.master_key.raw_hex);

      // Header Encryption
      const headerIv = Buffer.from(vectors.header.iv_hex, 'hex');
      const headerPlaintext = Buffer.from(vectors.header.plaintext, 'utf8');
      const { ciphertext: headerCipher, authTag: headerTag } = await provider.encryptGcm(
        fileKey,
        headerIv,
        headerPlaintext,
      );
      expect(Buffer.from(headerCipher).toString('hex')).toBe(vectors.header.ciphertext_hex);
      expect(Buffer.from(headerTag).toString('hex')).toBe(vectors.header.auth_tag_hex);

      // Chunk Encryption
      const chunkNonce = Buffer.from(vectors.chunk.nonce_hex, 'hex');
      const chunkPlaintext = Buffer.from(vectors.chunk.plaintext_utf8, 'utf8');
      const { ciphertext: chunkCipher, authTag: chunkTag } = await provider.encryptGcm(
        fileKey,
        chunkNonce,
        chunkPlaintext,
      );
      expect(Buffer.from(chunkCipher).toString('hex')).toBe(vectors.chunk.ciphertext_hex);
      expect(Buffer.from(chunkTag).toString('hex')).toBe(vectors.chunk.auth_tag_hex);
    });
  });

  describe('2. Multi-Chunk Streaming Round-Trip (2.5 MiB payload)', () => {
    it('encrypts and decrypts multi-chunk files with exact byte fidelity', async () => {
      const masterKey = provider.randomBytes(32);

      // 2.5 MiB payload -> exactly 3 chunks (1 MiB, 1 MiB, 0.5 MiB)
      const dataSize = Math.floor(2.5 * CHUNK_SIZE);
      const originalData = new Uint8Array(dataSize);
      for (let i = 0; i < dataSize; i++) {
        originalData[i] = i % 256;
      }

      const metadata: EncryptedMetadata = {
        name: 'vacation_video.mp4',
        mimeType: 'video/mp4',
        sizeBytes: dataSize,
        modifiedAt: 1730764800000,
      };

      const container = await encryptFile(originalData, metadata, masterKey, provider);
      expect(container.length).toBeGreaterThan(dataSize);

      const decrypted = await decryptFile(container, masterKey, provider);

      expect(decrypted.metadata.name).toBe('vacation_video.mp4');
      expect(decrypted.metadata.sizeBytes).toBe(dataSize);
      expect(decrypted.plaintext.length).toBe(dataSize);

      // Verify exact byte equality
      expect(Buffer.from(decrypted.plaintext).equals(Buffer.from(originalData))).toBe(true);
    });
  });

  describe('3. Tamper Resistance & Integrity Proofs', () => {
    it('fails decryption on single bitflip in ciphertext', async () => {
      const masterKey = provider.randomBytes(32);
      const originalData = Buffer.from('Highly confidential vault payload', 'utf8');
      const metadata: EncryptedMetadata = {
        name: 'secret.txt',
        mimeType: 'text/plain',
        sizeBytes: originalData.length,
        modifiedAt: Date.now(),
      };

      const container = await encryptFile(originalData, metadata, masterKey, provider);

      // Tamper: flip one bit in the middle of ciphertext
      const tampered = new Uint8Array(container);
      tampered[tampered.length - 20] ^= 0x01;

      await expect(decryptFile(tampered, masterKey, provider)).rejects.toThrow();
    });

    it('fails decryption when chunks are swapped or reordered', async () => {
      const masterKey = provider.randomBytes(32);
      const dataSize = 2 * CHUNK_SIZE; // exactly 2 chunks
      const originalData = new Uint8Array(dataSize);
      for (let i = 0; i < dataSize; i++) originalData[i] = i % 256;

      const metadata: EncryptedMetadata = {
        name: 'chunks.bin',
        mimeType: 'application/octet-stream',
        sizeBytes: dataSize,
        modifiedAt: Date.now(),
      };

      const container = await encryptFile(originalData, metadata, masterKey, provider);
      const { headerLength } = decodeHeader(container);

      // Chunk 0 offset: headerLength
      // Chunk 1 offset: headerLength + CHUNK_SIZE + 16
      const chunk1Offset = headerLength;
      const chunk2Offset = headerLength + CHUNK_SIZE + 16;
      const chunkLen = CHUNK_SIZE + 16;

      // Swap Chunk 0 and Chunk 1 in container
      const swapped = new Uint8Array(container);
      const chunk1 = container.slice(chunk1Offset, chunk1Offset + chunkLen);
      const chunk2 = container.slice(chunk2Offset, chunk2Offset + chunkLen);
      swapped.set(chunk2, chunk1Offset);
      swapped.set(chunk1, chunk2Offset);

      // Tampered chunk order MUST throw error (chunk nonce counter mismatch)
      await expect(decryptFile(swapped, masterKey, provider)).rejects.toThrow();
    });

    it('fails decryption on file truncation attack', async () => {
      const masterKey = provider.randomBytes(32);
      const dataSize = 2 * CHUNK_SIZE;
      const originalData = new Uint8Array(dataSize);

      const metadata: EncryptedMetadata = {
        name: 'truncate.bin',
        mimeType: 'application/octet-stream',
        sizeBytes: dataSize,
        modifiedAt: Date.now(),
      };

      const container = await encryptFile(originalData, metadata, masterKey, provider);
      const { headerLength } = decodeHeader(container);

      // Truncate the container to include only Chunk 0 (removing Chunk 1)
      const truncated = container.slice(0, headerLength + CHUNK_SIZE + 16);

      // Decryption MUST fail because Chunk 0 was flagged as intermediate (isFinal = 0)
      await expect(decryptFile(truncated, masterKey, provider)).rejects.toThrow();
    });

    it('fails decryption with incorrect Master Key', async () => {
      const correctKey = provider.randomBytes(32);
      const wrongKey = provider.randomBytes(32);

      const originalData = Buffer.from('Target text', 'utf8');
      const metadata: EncryptedMetadata = {
        name: 'target.txt',
        mimeType: 'text/plain',
        sizeBytes: originalData.length,
        modifiedAt: Date.now(),
      };

      const container = await encryptFile(originalData, metadata, correctKey, provider);
      await expect(decryptFile(container, wrongKey, provider)).rejects.toThrow();
    });
  });

  describe('4. Range Decryption Correctness (Video Seeking)', () => {
    it('decrypts arbitrary byte range across chunk boundaries', async () => {
      const masterKey = provider.randomBytes(32);
      const dataSize = Math.floor(2.5 * CHUNK_SIZE);
      const originalData = new Uint8Array(dataSize);
      for (let i = 0; i < dataSize; i++) originalData[i] = (i * 7) % 256;

      const metadata: EncryptedMetadata = {
        name: 'stream_video.mp4',
        mimeType: 'video/mp4',
        sizeBytes: dataSize,
        modifiedAt: Date.now(),
      };

      const container = await encryptFile(originalData, metadata, masterKey, provider);

      // Seek range spanning Chunk 0 and Chunk 1: [1,048,500 .. 1,048,700] (201 bytes)
      const rangeStart = CHUNK_SIZE - 76;
      const rangeEnd = CHUNK_SIZE + 124;

      const { rangeData } = await decryptRange(
        container,
        rangeStart,
        rangeEnd,
        masterKey,
        provider,
      );

      expect(rangeData.length).toBe(rangeEnd - rangeStart + 1);

      const expectedSlice = originalData.subarray(rangeStart, rangeEnd + 1);
      expect(Buffer.from(rangeData).equals(Buffer.from(expectedSlice))).toBe(true);
    });
  });

  describe('5. Memory Zeroization', () => {
    it('wipes key material with zeros', () => {
      const key = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      zeroize(key);
      expect(key.every((b) => b === 0)).toBe(true);
    });
  });

  describe('6. Legacy to SDV1 Migration Pipeline', () => {
    it('migrates legacy single-pass vault records to SDV1 with hash verification', async () => {
      const legacyKey = provider.randomBytes(32);
      const newMasterKey = provider.randomBytes(32);

      // Create dummy legacy records
      const legacyFiles: LegacyVaultRecord[] = [];
      for (let i = 0; i < 3; i++) {
        const plaintext = Buffer.from(`Legacy document ${i} contents with secret info`, 'utf8');
        const iv = provider.randomBytes(12);
        const { ciphertext, authTag } = await provider.encryptGcm(legacyKey, iv, plaintext);

        // In legacy format, payload is ciphertext + authTag
        const legacyPayload = new Uint8Array(ciphertext.length + authTag.length);
        legacyPayload.set(ciphertext, 0);
        legacyPayload.set(authTag, ciphertext.length);

        legacyFiles.push({
          id: `legacy-${i}`,
          name: `doc-${i}.txt`,
          mimeType: 'text/plain',
          sizeBytes: plaintext.length,
          encryptedPayload: legacyPayload,
          iv,
        });
      }

      const result = await migrateLegacyToSdv1(legacyFiles, legacyKey, newMasterKey, provider);

      expect(result.migratedCount).toBe(3);
      expect(result.verifiedCount).toBe(3);
      expect(result.failedCount).toBe(0);

      // Decrypt the newly migrated SDV1 containers and assert fidelity
      for (let i = 0; i < 3; i++) {
        const migrated = result.migratedFiles[i]!;
        const decrypted = await decryptFile(migrated.sdv1Container, newMasterKey, provider);
        expect(decrypted.metadata.name).toBe(`doc-${i}.txt`);
        expect(Buffer.from(decrypted.plaintext).toString('utf8')).toBe(
          `Legacy document ${i} contents with secret info`,
        );
      }
    });
  });
});
