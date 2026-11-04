# 9. Private Vault Zero-Knowledge Encryption Architecture & Threat Model

Date: 2026-11-04 Status: Accepted

## Context

DriveShell provides a Private Vault feature allowing users to store sensitive files, personal
documents, and private photos with client-side encryption. Because DriveShell synchronizes metadata
and allows storage, a rigorous cryptographic architecture is required to guarantee zero-knowledge
privacy.

## Threat Model & Security Goals

1. **Compromised Host / Remote Storage**: If SQLite databases or remote storage backends are
   exfiltrated, attackers must not be able to read plaintext data or verify passphrase guesses
   without brute-force computation against key derivation functions.
2. **Zero-Knowledge**: The master passphrase and derived encryption keys MUST NEVER be sent over the
   network, written to SQLite, stored in cookies, or saved in `localStorage`.
3. **Hardware-Accelerated Authenticated Encryption**: Plaintext must be protected against tampering
   and bit-flipping attacks using AEAD (Authenticated Encryption with Associated Data).
4. **Transient In-Memory Lifetime**: The master key exists exclusively in transient memory
   (`CryptoKey`) and is wiped upon manual lock, window closure, or 5 minutes of user inactivity.
5. **Cross-Platform & Mobile Readiness**: Cryptographic operations rely on standard Web Crypto API
   primitives (`SubtleCrypto`), ensuring 100% portability to Tauri Desktop (Windows/macOS/Linux) and
   upcoming Tauri Mobile (Android/iOS).

## Cryptographic Design

### 1. Key Derivation (PBKDF2-HMAC-SHA256)

- **Algorithm**: PBKDF2 (`PBKDF2-HMAC-SHA256`)
- **Salt**: 32 cryptographically secure random bytes generated via `crypto.getRandomValues()`.
- **Iteration Count**: 100,000 iterations (OWASP recommendation).
- **Derived Key**: 256-bit AES-GCM key (`length: 256`, non-extractable).

### 2. Symmetric Authenticated Encryption (AES-256-GCM)

- **Algorithm**: AES-256-GCM.
- **Initialization Vector (IV)**: 12 bytes (96 bits) uniquely generated for every encryption
  operation via CSPRNG (`crypto.getRandomValues`). An IV is NEVER reused.
- **Authentication Tag**: 128-bit authentication tag appended to the ciphertext ensuring ciphertext
  integrity and authenticity.

### 3. Zero-Knowledge Canary Verification

To verify whether an entered passphrase is valid without transmitting or storing it:

1. During setup, the client derives the master key and encrypts a constant canary string:
   `"driveshell-vault-verified"` with a unique 12-byte IV.
2. The server stores only `{ salt, canaryCiphertext, canaryIv }`.
3. When unlocking, the client derives the candidate key and attempts to decrypt the canary
   ciphertext. If decryption succeeds and matches the constant, the key is confirmed authentic. If
   the passphrase is wrong, GCM authentication tag verification fails immediately.

### 4. Auto-Lock Lifecycle

- A 300-second (5-minute) countdown timer is reset on keyboard/mouse events.
- On expiration or explicit user lock:
  - `vaultKey` state is set to `null`.
  - All temporary in-memory blob URLs (`URL.revokeObjectURL`) are revoked.
  - The UI resets to the locked view.

## Consequences

- Guaranteed zero-knowledge confidentiality.
- Resistant against tampering and replay attacks.
- Portable across web, desktop, and mobile runtimes without native binary dependencies.
