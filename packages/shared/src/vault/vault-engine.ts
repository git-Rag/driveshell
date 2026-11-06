/**
 * vault-engine.ts — Pure SDV1 Encryption, Decryption, Chunk Streaming, and Zeroization Engine.
 */

import {
  CHUNK_SIZE,
  TAG_LENGTH,
  SALT_LENGTH,
  NONCE_LENGTH,
  constructChunkNonce,
  encodeHeader,
  decodeHeader,
  getChunkOffset,
} from './format';
import type { EncryptedMetadata, VaultCryptoProvider } from './types';

const FILE_KEY_INFO = 'sunflower-vault-v1-file-key';

/**
 * Zeroize memory by overwriting a typed array with zeros.
 */
export function zeroize(buffer: Uint8Array): void {
  buffer.fill(0);
}

/**
 * Wraps the Master Key with the Key Encryption Key (KEK) using AES-256-GCM.
 */
export async function wrapMasterKey(
  masterKey: Uint8Array,
  kek: Uint8Array,
  provider: VaultCryptoProvider,
): Promise<{ wrappedKey: Uint8Array; iv: Uint8Array; authTag: Uint8Array }> {
  const iv = provider.randomBytes(NONCE_LENGTH);
  const { ciphertext, authTag } = await provider.encryptGcm(kek, iv, masterKey);
  return { wrappedKey: ciphertext, iv, authTag };
}

/**
 * Unwraps the Master Key using the Key Encryption Key (KEK).
 */
export async function unwrapMasterKey(
  wrappedKey: Uint8Array,
  iv: Uint8Array,
  authTag: Uint8Array,
  kek: Uint8Array,
  provider: VaultCryptoProvider,
): Promise<Uint8Array> {
  return provider.decryptGcm(kek, iv, wrappedKey, authTag);
}

/**
 * Encrypts a full file into the SDV1 container format with authenticated 1 MiB chunks.
 */
export async function encryptFile(
  plaintext: Uint8Array,
  metadata: EncryptedMetadata,
  masterKey: Uint8Array,
  provider: VaultCryptoProvider,
): Promise<Uint8Array> {
  // 1. Generate per-file salt and derive file subkey
  const fileSalt = provider.randomBytes(SALT_LENGTH);
  const fileKey = await provider.deriveFileKey(masterKey, fileSalt, FILE_KEY_INFO);

  // 2. Encrypt metadata header
  const enc = new TextEncoder();
  const metadataPlaintext = enc.encode(JSON.stringify(metadata));
  const headerIv = provider.randomBytes(NONCE_LENGTH);
  const { ciphertext: metadataCiphertext, authTag: headerAuthTag } = await provider.encryptGcm(
    fileKey,
    headerIv,
    metadataPlaintext,
  );

  const headerBytes = encodeHeader({
    magic: 0x53445631,
    version: 1,
    fileSalt,
    headerIv,
    metadataCiphertext,
    headerAuthTag,
  });

  // 3. Process plaintext in 1 MiB chunks
  const totalLength = plaintext.length;
  const numChunks = Math.max(1, Math.ceil(totalLength / CHUNK_SIZE));
  const randomPrefix = fileKey.subarray(0, 4);

  const encryptedChunks: Uint8Array[] = [];

  for (let i = 0; i < numChunks; i++) {
    const chunkStart = i * CHUNK_SIZE;
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, totalLength);
    const chunkPlaintext = plaintext.subarray(chunkStart, chunkEnd);
    const isFinal = i === numChunks - 1;

    const chunkNonce = constructChunkNonce(randomPrefix, i, isFinal);
    const { ciphertext, authTag } = await provider.encryptGcm(fileKey, chunkNonce, chunkPlaintext);

    // Encrypted chunk buffer = ciphertext + 16B auth tag
    const fullChunk = new Uint8Array(ciphertext.length + TAG_LENGTH);
    fullChunk.set(ciphertext, 0);
    fullChunk.set(authTag, ciphertext.length);

    encryptedChunks.push(fullChunk);
  }

  // 4. Assemble container buffer: Header + Chunks
  let totalOutputSize = headerBytes.length;
  for (const chunk of encryptedChunks) {
    totalOutputSize += chunk.length;
  }

  const container = new Uint8Array(totalOutputSize);
  container.set(headerBytes, 0);

  let writeOffset = headerBytes.length;
  for (const chunk of encryptedChunks) {
    container.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }

  return container;
}

/**
 * Decrypts an SDV1 container into original plaintext and metadata.
 */
export async function decryptFile(
  container: Uint8Array,
  masterKey: Uint8Array,
  provider: VaultCryptoProvider,
): Promise<{ metadata: EncryptedMetadata; plaintext: Uint8Array }> {
  // 1. Decode and verify header
  const { header, headerLength } = decodeHeader(container);
  const fileKey = await provider.deriveFileKey(masterKey, header.fileSalt, FILE_KEY_INFO);

  const decryptedMetadataBytes = await provider.decryptGcm(
    fileKey,
    header.headerIv,
    header.metadataCiphertext,
    header.headerAuthTag,
  );

  const dec = new TextDecoder();
  const metadata = JSON.parse(dec.decode(decryptedMetadataBytes)) as EncryptedMetadata;

  // 2. Decrypt chunks
  const randomPrefix = fileKey.subarray(0, 4);
  const payloadBytes = container.subarray(headerLength);
  const decryptedChunks: Uint8Array[] = [];

  let readOffset = 0;
  let chunkIndex = 0;

  while (readOffset < payloadBytes.length) {
    const remainingBytes = payloadBytes.length - readOffset;
    const currentChunkSize = Math.min(CHUNK_SIZE + TAG_LENGTH, remainingBytes);

    if (currentChunkSize < TAG_LENGTH) {
      throw new Error('Truncated chunk detected');
    }

    const chunkPayload = payloadBytes.subarray(readOffset, readOffset + currentChunkSize);
    const ciphertext = chunkPayload.subarray(0, chunkPayload.length - TAG_LENGTH);
    const authTag = chunkPayload.subarray(chunkPayload.length - TAG_LENGTH);

    const isFinal = readOffset + currentChunkSize === payloadBytes.length;
    const chunkNonce = constructChunkNonce(randomPrefix, chunkIndex, isFinal);

    const chunkPlaintext = await provider.decryptGcm(fileKey, chunkNonce, ciphertext, authTag);
    decryptedChunks.push(chunkPlaintext);

    readOffset += currentChunkSize;
    chunkIndex++;
  }

  // 3. Assemble plaintext
  let totalPlaintextLen = 0;
  for (const chunk of decryptedChunks) {
    totalPlaintextLen += chunk.length;
  }

  const fullPlaintext = new Uint8Array(totalPlaintextLen);
  let writeOffset = 0;
  for (const chunk of decryptedChunks) {
    fullPlaintext.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }

  return { metadata, plaintext: fullPlaintext };
}

/**
 * Decrypts an arbitrary byte range [start, end] from an SDV1 container.
 * Performs fast chunk-boundary seeking without loading or decrypting the entire file.
 */
export async function decryptRange(
  container: Uint8Array,
  start: number,
  end: number,
  masterKey: Uint8Array,
  provider: VaultCryptoProvider,
): Promise<{ metadata: EncryptedMetadata; rangeData: Uint8Array }> {
  const { header, headerLength } = decodeHeader(container);
  const fileKey = await provider.deriveFileKey(masterKey, header.fileSalt, FILE_KEY_INFO);

  const decryptedMetadataBytes = await provider.decryptGcm(
    fileKey,
    header.headerIv,
    header.metadataCiphertext,
    header.headerAuthTag,
  );

  const dec = new TextDecoder();
  const metadata = JSON.parse(dec.decode(decryptedMetadataBytes)) as EncryptedMetadata;

  const totalSize = metadata.sizeBytes;
  const safeEnd = Math.min(end, totalSize - 1);
  if (start > safeEnd || start < 0) {
    throw new Error(`Invalid range request: [${start}, ${end}] for file size ${totalSize}`);
  }

  const startChunk = Math.floor(start / CHUNK_SIZE);
  const endChunk = Math.floor(safeEnd / CHUNK_SIZE);
  const totalChunks = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
  const randomPrefix = fileKey.subarray(0, 4);

  const decryptedChunkBuffers: Uint8Array[] = [];

  for (let c = startChunk; c <= endChunk; c++) {
    const chunkFileOffset = getChunkOffset(headerLength, c);
    const isFinal = c === totalChunks - 1;
    const expectedPlaintextSize = isFinal ? totalSize - c * CHUNK_SIZE : CHUNK_SIZE;
    const chunkEncryptedSize = expectedPlaintextSize + TAG_LENGTH;

    const chunkData = container.subarray(chunkFileOffset, chunkFileOffset + chunkEncryptedSize);
    const ciphertext = chunkData.subarray(0, chunkData.length - TAG_LENGTH);
    const authTag = chunkData.subarray(chunkData.length - TAG_LENGTH);

    const chunkNonce = constructChunkNonce(randomPrefix, c, isFinal);
    const chunkPlaintext = await provider.decryptGcm(fileKey, chunkNonce, ciphertext, authTag);
    decryptedChunkBuffers.push(chunkPlaintext);
  }

  // Combine decrypted chunks
  let totalCombined = 0;
  for (const buf of decryptedChunkBuffers) {
    totalCombined += buf.length;
  }
  const combined = new Uint8Array(totalCombined);
  let offset = 0;
  for (const buf of decryptedChunkBuffers) {
    combined.set(buf, offset);
    offset += buf.length;
  }

  // Slice to exact byte offsets relative to the start of startChunk
  const sliceStart = start - startChunk * CHUNK_SIZE;
  const sliceEnd = sliceStart + (safeEnd - start + 1);

  return {
    metadata,
    rangeData: combined.subarray(sliceStart, sliceEnd),
  };
}
