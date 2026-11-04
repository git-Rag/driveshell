# DriveShell — Security Model

> This document covers the threat model, security controls for the localhost application, and the
> vault cryptographic design. The vault crypto section must be reviewed and approved by the product
> owner before any vault code is written (Phase 8).

---

## 1. Threat model

DriveShell runs entirely on the user's machine. It is not a multi-user web application.

| Threat                                                    | In scope? | Control                                                                                         |
| --------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| Malicious website reading Drive data via the local server | ✓         | Strict CORS, `Host`/`Origin` header validation, session cookie (`HttpOnly SameSite=Strict`)     |
| DNS rebinding attack                                      | ✓         | Validate `Host` header is exactly `127.0.0.1:<port>`; reject `localhost` and any other hostname |
| Another local process making API calls                    | ✓         | Per-launch random session token (128-bit) in `HttpOnly SameSite=Strict` cookie                  |
| CSRF                                                      | ✓         | `SameSite=Strict` cookie; `Origin` header check on mutating requests                            |
| Token exfiltration from disk                              | ✓         | Tokens stored in OS keychain; encrypted-file fallback with AES-256-GCM                          |
| Path traversal via file IDs                               | ✓         | File IDs are sanitized/hashed before use as cache paths                                         |
| XSS in the web UI                                         | ✓         | React escapes by default; CSP headers; no `dangerouslySetInnerHTML` without review              |
| Supply chain (malicious npm package)                      | ✓         | `pnpm audit` in CI; Dependabot; lockfile committed                                              |
| Malware on the user's machine while the vault is unlocked | ✗         | Out of scope: cannot protect against a compromised OS                                           |
| Google account compromise                                 | ✗         | Out of scope: user's Google security responsibility                                             |
| Physical access to the machine                            | ✗         | Out of scope                                                                                    |

## 2. Session token

A cryptographically random 128-bit token is generated each time the server starts (using
`crypto.randomBytes(16).toString('hex')`). It is delivered to the web UI as an
`HttpOnly SameSite=Strict` cookie named `ds-session` on the first load. All `/api/*` routes validate
this cookie server-side. The token is never logged, never stored to disk, and is lost on server
restart (requiring a page reload).

**Exception:** `GET /auth/callback` does not require the session token because it must be reachable
by the browser redirect from Google. It is protected instead by PKCE code verifier + `state`
parameter validation.

## 3. OAuth security

- **PKCE** (S256 method): `code_verifier` generated with 32 random bytes,
  `code_challenge = BASE64URL(SHA256(verifier))`.
- **State parameter**: 16 random bytes stored server-side for the duration of the OAuth flow;
  verified on callback.
- **Redirect URI**: loopback (`http://127.0.0.1:<port>/auth/callback`) only. Desktop app type in
  Google Cloud Console — no client secret transport to a redirect URI.
- **Offline access**: refresh tokens stored in the OS keychain, never in plain text.
- **`invalid_grant`**: marks the account `needs_reauth`; never crashes the server.

## 4. Vault cryptographic design (DRAFT — awaiting Phase 8 review)

> ⚠️ No vault code is written until this section is reviewed and approved.

### Goals

- Files are encrypted before upload to Drive.
- Google (or anyone with Drive access) cannot read vault file contents or names.
- Password change does not require re-encrypting every file.
- Multi-GB videos can be encrypted and decrypted in a streaming, constant-memory fashion.
- Vault videos can be seeked (random-access decryption of a byte range).

### Non-goals

- Protecting against the user's own OS (malware, compromised system).
- Hiding the existence of the vault folder on Drive (Drive shows the folder; contents are opaque).

### Key hierarchy

```
password ──(Argon2id)──▶ wrapping_key ──(AES-256-GCM unwrap)──▶ master_key (MK)
recovery_phrase ────────(AES-256-GCM unwrap)──────────────────▶ master_key (MK)
MK + per-file-salt ──(HKDF-SHA256)──▶ file_key
file_key + chunk_index ──▶ chunk_nonce
```

### Password wrapping (vault setup)

1. Generate `MK`: `crypto.randomBytes(32)` (256 bits).
2. Generate `kdf_salt`: `crypto.randomBytes(32)`.
3. Derive `wrapping_key = Argon2id(password, kdf_salt, params)`.
   - Recommended params (adjust to ~200–500 ms on target hardware): `m=65536, t=3, p=4`.
   - Store `{m, t, p, kdf_salt}` in `vault_meta.kdf_params` (JSON, plaintext — salt is not secret).
4. Encrypt: `{ciphertext, tag, iv} = AES-256-GCM(wrapping_key, MK)`. Store as
   `vault_meta.wrapped_master_key`.
5. Generate recovery phrase: `crypto.randomBytes(32).toString('base64url')` (43 characters, ~256
   bits entropy). Display once; never store plaintext. Derive
   `recovery_key = SHA-256(recovery_phrase)`. Store `AES-256-GCM(recovery_key, MK)` as
   `vault_meta.wrapped_by_recovery`.

### File encryption (streaming, chunked AEAD)

Each vault file is encrypted as a sequence of **1 MiB chunks**, each independently authenticated.

**File header (plaintext):**

```
[4 bytes: format_version=1]
[32 bytes: file_salt (random)]
[8 bytes: total_plaintext_length]
[1 byte: flags]
```

**Per-file key:**

```
file_key = HKDF-SHA256(ikm=MK, salt=file_salt, info="driveshell-file-v1", length=32)
```

**Per-chunk encryption:**

```
chunk_nonce = file_salt[0..11] XOR (chunk_index as big-endian uint64, zero-padded to 12 bytes)
chunk_ciphertext = AES-256-GCM(file_key, chunk_nonce, chunk_plaintext, aad=chunk_index_be64)
```

The final chunk has a flag bit in its AAD to prevent truncation attacks.

**Encrypted file format on Drive:**

```
[header][chunk_0_len(4)][chunk_0_ciphertext+tag][chunk_1_len(4)][chunk_1_ciphertext+tag]...
```

**Random-access reads (for video seeking):** Given a byte range `[start, end]` in plaintext
coordinates:

1. Compute `first_chunk = start / CHUNK_SIZE`, `last_chunk = end / CHUNK_SIZE`.
2. Download only the byte range covering those chunks from Drive (`Range` header on `files.get`).
3. Decrypt each chunk independently (each has its own nonce derived from its index).

### Metadata encryption

File names and metadata (size, MIME type, original path) are encrypted with the same `file_key`
derivation, stored as a small AEAD blob in `vault_items.enc_meta`. Drive sees only the Drive file ID
(a random UUID we assign at upload time).

### Encrypted thumbnails

A small JPEG/WebP preview (max 512px on the long side) is generated locally by `sharp` before
upload, encrypted as a single chunk, and stored in `data/vault-thumbs/<hash>`. Never uploaded to
Drive. The thumb key is derived from `MK` with `info="driveshell-thumb-v1"`.

### Key lifecycle

- `MK` lives only in server memory while the vault is unlocked.
- On lock: `crypto.randomFillSync(mkBuffer)` zeroes the buffer (best-effort — JS GC may still hold
  copies).
- Auto-lock: configurable idle timeout (default 15 minutes) + on window close / server shutdown.
- Unlock rate limiting: exponential backoff after 5 failed attempts; max 10 attempts before a hard
  lockout requiring app restart.
- Never log passwords, keys, plaintext file names, or plaintext metadata in vault code paths.

### Versioning

`format_version` in the file header allows future changes to the encryption scheme without breaking
existing files.

### Honest limits

- Forgotten password + no recovery phrase = permanent data loss. No backdoor.
- Vault protects against Google/anyone with Drive access reading your files.
- It does not protect against malware on your own machine while the vault is unlocked.
- It does not hide the existence of the vault folder in Drive.
