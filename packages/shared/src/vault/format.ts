/**
 * format.ts — Binary container encoding, header serialization, and chunk nonce framing for SDV1.
 */

import type { SDV1Header } from './types';

export const SDV1_MAGIC = 0x53445631; // ASCII "SDV1"
export const SDV1_VERSION = 1;
export const CHUNK_SIZE = 1024 * 1024; // 1 MiB (1,048,576 bytes)
export const TAG_LENGTH = 16;
export const NONCE_LENGTH = 12;
export const SALT_LENGTH = 32;

/**
 * Constructs a deterministic 12-byte (96-bit) chunk nonce:
 *  [4 bytes: Random file prefix]
 *  [7 bytes: Monotonic chunk index (big-endian)]
 *  [1 byte:  Final chunk flag (0x01 = final, 0x00 = intermediate)]
 */
export function constructChunkNonce(
  randomPrefix: Uint8Array,
  chunkIndex: number,
  isFinal: boolean,
): Uint8Array {
  const nonce = new Uint8Array(NONCE_LENGTH);

  // 1. First 4 bytes: random per-file prefix
  nonce.set(randomPrefix.subarray(0, 4), 0);

  // 2. Next 7 bytes: big-endian chunk index
  // JavaScript numbers safely represent integers up to 2^53 - 1
  let indexVal = BigInt(chunkIndex);
  for (let i = 10; i >= 4; i--) {
    nonce[i] = Number(indexVal & 0xffn);
    indexVal >>= 8n;
  }

  // 3. Final byte: termination flag (defends against truncation)
  nonce[11] = isFinal ? 0x01 : 0x00;

  return nonce;
}

/**
 * Serializes the SDV1 container header into a binary buffer:
 *  - 4 bytes: Magic ("SDV1")
 *  - 2 bytes: Version (1)
 *  - 32 bytes: File Salt
 *  - 12 bytes: Header IV
 *  - 4 bytes: Metadata ciphertext length
 *  - N bytes: Metadata ciphertext
 *  - 16 bytes: Header Auth Tag
 */
export function encodeHeader(header: SDV1Header): Uint8Array {
  const metaLen = header.metadataCiphertext.length;
  const totalLength = 4 + 2 + SALT_LENGTH + NONCE_LENGTH + 4 + metaLen + TAG_LENGTH;
  const buffer = new Uint8Array(totalLength);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  let offset = 0;

  // Magic
  view.setUint32(offset, SDV1_MAGIC, false);
  offset += 4;

  // Version
  view.setUint16(offset, SDV1_VERSION, false);
  offset += 2;

  // File Salt (32 bytes)
  buffer.set(header.fileSalt, offset);
  offset += SALT_LENGTH;

  // Header IV (12 bytes)
  buffer.set(header.headerIv, offset);
  offset += NONCE_LENGTH;

  // Metadata Ciphertext Length (4 bytes)
  view.setUint32(offset, metaLen, false);
  offset += 4;

  // Metadata Ciphertext
  buffer.set(header.metadataCiphertext, offset);
  offset += metaLen;

  // Header Auth Tag (16 bytes)
  buffer.set(header.headerAuthTag, offset);

  return buffer;
}

/**
 * Parses and validates an SDV1 container header from a binary buffer.
 */
export function decodeHeader(buffer: Uint8Array): { header: SDV1Header; headerLength: number } {
  if (buffer.length < 4 + 2 + SALT_LENGTH + NONCE_LENGTH + 4 + TAG_LENGTH) {
    throw new Error('Buffer too small to contain SDV1 header');
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 0;

  // Check Magic
  const magic = view.getUint32(offset, false);
  offset += 4;
  if (magic !== SDV1_MAGIC) {
    throw new Error(`Invalid vault magic bytes: 0x${magic.toString(16)}. Expected SDV1.`);
  }

  // Check Version
  const version = view.getUint16(offset, false);
  offset += 2;
  if (version !== SDV1_VERSION) {
    throw new Error(`Unsupported vault format version: ${version}. Supported: ${SDV1_VERSION}.`);
  }

  // File Salt
  const fileSalt = buffer.slice(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;

  // Header IV
  const headerIv = buffer.slice(offset, offset + NONCE_LENGTH);
  offset += NONCE_LENGTH;

  // Metadata Length
  const metaLen = view.getUint32(offset, false);
  offset += 4;

  if (buffer.length < offset + metaLen + TAG_LENGTH) {
    throw new Error('Incomplete metadata payload in header');
  }

  // Metadata Ciphertext
  const metadataCiphertext = buffer.slice(offset, offset + metaLen);
  offset += metaLen;

  // Header Auth Tag
  const headerAuthTag = buffer.slice(offset, offset + TAG_LENGTH);
  offset += TAG_LENGTH;

  return {
    header: {
      magic,
      version,
      fileSalt,
      headerIv,
      metadataCiphertext,
      headerAuthTag,
    },
    headerLength: offset,
  };
}

/**
 * Computes file byte offset for a specific chunk index $C_i$:
 * Offset(C_i) = HeaderLength + C_i * (1 MiB + 16 bytes Tag)
 */
export function getChunkOffset(headerLength: number, chunkIndex: number): number {
  return headerLength + chunkIndex * (CHUNK_SIZE + TAG_LENGTH);
}
