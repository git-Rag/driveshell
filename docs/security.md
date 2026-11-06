# Project Sunflower — Security Model & Trust Architecture

> **Security Invariants**: Formal adherence to INV-01 through INV-10. **Scope**: Loopback network
> isolation, origin boundaries, session bootstrapping, anti-SSRF guard, stream isolation, and vault
> cryptographic specifications.

---

## 1. Threat Model & Trust Boundaries

Project Sunflower runs locally on the user's workstation as a desktop-native application and
loopback API server.

| Threat / Attack Vector                  |  In Scope?  | Enforcement Mechanism & Controls                                                                                                                                                                                                                                                                                                                                         |
| :-------------------------------------- | :---------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Malicious Web Page Access**           |   **YES**   | Strict CORS, `Host` header enforcement, `Sec-Fetch-Site` cross-site rejection, `Origin` whitelist validation, and `SameSite=Strict` session cookie.                                                                                                                                                                                                                      |
| **DNS Rebinding Attack**                |   **YES**   | `onRequest` hook validates `Host` strictly against `127.0.0.1` / `localhost`. All external or public hostnames return `400 Bad Host header`.                                                                                                                                                                                                                             |
| **Server-Side Request Forgery (SSRF)**  |   **YES**   | Outbound Network Guard (`validateOutboundUrl`, `fetchWithGuard`): HTTPS-only, disallows direct IPs, metadata IP (`169.254.169.254`), non-standard ports; strict domain suffix matching against official Google media hosts; manual redirect inspection (max 3); 10s timeout; 15 MB limit; zero OAuth token forwarding.                                                   |
| **Stored-XSS via Media Stream**         |   **YES**   | Stream isolation: only safe raster images (JPEG, PNG, WebP, AVIF) and media (MP4, WebM, QuickTime, Ogg) served inline. SVG, HTML, PDF, JS force `Content-Disposition: attachment`. All media responses send `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox; default-src 'none'`. Filenames sanitized against CRLF injection and path traversal. |
| **Cross-Site Request Forgery (CSRF)**   |   **YES**   | `SameSite=Strict` session cookie; `Origin` header validation on mutating verbs (`POST`, `PUT`, `PATCH`, `DELETE`) and `/api/vault/*` routes.                                                                                                                                                                                                                             |
| **Token Exfiltration at Rest**          |   **YES**   | OAuth tokens stored in OS Keychain (`sunflowerdrive` service with fallback to legacy `driveshell` service). File fallback encrypted with AES-256-GCM.                                                                                                                                                                                                                    |
| **Vault Snooping via Iframe/Tab**       |   **YES**   | Rejection of `Sec-Fetch-Mode: navigate` on all `/api/vault/*` routes. Cache-Control headers set to `no-store, no-cache, must-revalidate, private`.                                                                                                                                                                                                                       |
| **Local Malware on User Workstation**   | **Partial** | _Limitation documented_: The loopback cookie protects against remote websites executing unauthorized requests. Any local binary under the same OS user can communicate with loopback. For Tauri desktop packaging, tokens should be exchanged via native IPC.                                                                                                            |
| **Google Account Compromise**           |   **NO**    | Out of scope: User's credential security with Google.                                                                                                                                                                                                                                                                                                                    |
| **Compromised Operating System Kernel** |   **NO**    | Out of scope: Hardware/OS compromise invalidates userland trust.                                                                                                                                                                                                                                                                                                         |

---

## 2. Loopback Session Architecture & Trust Model

### 2.1 The Startup Session Token

Upon backend startup, a cryptographically secure 128-bit random token is generated:

```ts
export const SESSION_TOKEN = crypto.randomBytes(16).toString('hex');
```

The token is bound to an `HttpOnly`, `SameSite=Strict` cookie (`ds_session`).

### 2.2 The Web SPA Bootstrap vs. Desktop IPC

- **Web SPA Mode**: During first web page load (`GET /`), the server issues the cookie. This design
  isolates browser tabs from cross-site scripts.
- **Desktop (Tauri) Mode**: In desktop mode, native webview communication is protected by Tauri's
  secure IPC bridge, ensuring that the token never needs to be exposed on an unauthenticated
  bootstrap endpoint.
- **Honest Limitation**: Any local process on the user's machine running as the same user can
  connect to `127.0.0.1:<port>`. The cookie defends against **browser cross-site threats** (drive-by
  web scripts probing localhost), not local malware.

### 2.3 Strict Origin & Sec-Fetch Controls (SEC-006)

All inbound HTTP requests pass through the session security hook
(`apps/server/src/auth/session.ts`):

1. **DNS Rebinding**: Host header must match `/^(127\.0\.0\.1|localhost)(:\d+)?$/`.
2. **Sec-Fetch-Site**: Any request with `sec-fetch-site: cross-site` is rejected with
   `403 Forbidden cross-site request`.
3. **Mutating Route Origin**: State-altering requests (`POST`, `PUT`, `PATCH`, `DELETE`) require
   `Origin` matching `ALLOWED_ORIGIN_REGEX` (`127.0.0.1`, `localhost`, `tauri://localhost`,
   `https?://tauri.localhost`).
4. **Vault Route Isolation**: Requests to `/api/vault/*` reject `sec-fetch-mode: navigate` to
   prevent direct browser navigation, iframe nesting, or tab embedding. Encrypted vault responses
   enforce:
   ```http
   Cache-Control: no-store, no-cache, must-revalidate, private
   Pragma: no-cache
   ```

---

## 3. Media Stream Isolation & Anti-XSS (SEC-002)

To prevent stored-XSS through malicious user files stored on Google Drive (e.g. an attacker
uploading an SVG with embedded `<script>` or an HTML file):

1. **Inline Serving Whitelist (`isSafeInlineMime`)**: Only safe raster images and audio/video
   containers are permitted inline:
   - `image/jpeg`, `image/png`, `image/webp`, `image/avif`
   - `video/mp4`, `video/webm`, `video/quicktime`, `video/ogg`, `video/x-matroska`
   - `audio/mpeg`, `audio/mp4`, `audio/ogg`, `audio/wav`, `audio/webm`, `audio/flac`, `audio/aac`
2. **Mandatory Attachment for Active/Risky Formats**: SVG (`image/svg+xml`), HTML (`text/html`), PDF
   (`application/pdf`), XML (`text/xml`), and JavaScript are **never** rendered inline. They are
   served as:
   ```http
   Content-Type: application/octet-stream
   Content-Disposition: attachment; filename="sanitized_name.ext"
   ```
3. **Header Defenses**: Every stream and thumbnail response includes:
   ```http
   X-Content-Type-Options: nosniff
   Content-Security-Policy: sandbox; default-src 'none'
   ```
4. **Filename Sanitization**: Filenames used in `Content-Disposition` headers are sanitized with
   `sanitizeFilename`:
   ```ts
   name.replace(/[\x00-\x1f\x7f"/\\]/g, '_');
   ```
   This prevents CRLF header injection and directory traversal attacks.

---

## 4. Anti-SSRF Outbound Network Guard (SEC-003, INV-06, INV-07)

When fetching remote media or Google Drive thumbnails, `apps/server/src/utils/outbound-guard.ts`
enforces the following invariants:

1. **Protocol Constraint**: Strictly `https:`. Non-HTTPS schemes (`http:`, `file:`, `data:`, `ftp:`)
   immediately throw `SsrfError`.
2. **IP Address & Localhost Ban**: Direct IPv4 addresses, IPv6 addresses, `localhost`, private
   network ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and cloud instance metadata
   addresses (`169.254.169.254`) are forbidden.
3. **Port & Credential Ban**: Non-standard HTTPS ports (anything other than `443`) and embedded
   userinfo/passwords in URLs are blocked.
4. **Domain Suffix Matching**: Hostnames must end with `.googleusercontent.com` or
   `.googleapis.com`, or match them exactly. Spoofed suffixes (e.g.,
   `googleusercontent.com.evil.com`) are rejected.
5. **Manual Redirect Inspection**: Upstream redirects (`301`, `302`, `303`, `307`, `308`) are
   followed manually hop-by-hop. Every intermediate destination is re-validated through
   `validateOutboundUrl`. Maximum redirect depth is capped at 3 hops.
6. **Resource Exhaustion Guard**:
   - Connection timeout capped at 10 seconds via `AbortController`.
   - Payload buffer size capped at 15 MB. Excess streams are terminated immediately.
7. **Credential Protection**: `fetchWithGuard` **never** forwards OAuth tokens or `Authorization`
   headers to media domains.

---

## 5. OAuth Security & Scope Hygiene (S4)

1. **PKCE (Proof Key for Code Exchange)**:
   - Method: `S256`.
   - `code_verifier`: 32 cryptographically random bytes (43 characters base64url).
   - `code_challenge`: `BASE64URL(SHA256(verifier))`.
2. **State Parameter**:
   - 16 cryptographically random bytes (32 hex characters) generated per flow.
   - Enforces a 10-minute expiry window with automatic TTL cleanup (`purgePkceExpired`).
3. **Loopback Redirect**:
   - `http://127.0.0.1:<port>/auth/callback` exclusively.
4. **Scope Minimization (S4)**:
   - Redundant scopes (`drive.metadata.readonly`) have been removed from `SCOPES.readonly`.
   - Minimal permissions:
     - Read-only: `https://www.googleapis.com/auth/drive.readonly`
     - Full/Modify: `https://www.googleapis.com/auth/drive`
5. **Keychain Security**:
   - Tokens stored in the OS Keychain via `@napi-rs/keyring`.
   - Primary service name: `sunflowerdrive`.
   - Backward-compatible read fallback: `driveshell`.
   - File fallback encrypted with AES-256-GCM.

---

## 6. Vault Cryptographic Design (Stage 4 Architecture — SDV1)

> Full frozen specification available at [`docs/vault-format.md`](./vault-format.md) and test
> vectors at [`packages/vault-spec/test-vectors.json`](../packages/vault-spec/test-vectors.json).

### 6.1 Cryptographic Core: WebCrypto + WASM Argon2id

To guarantee portability across Node.js 22+, modern browsers, Tauri Rust backend, and Android
WebView:

- **KDF**: Argon2id via audited WebAssembly (`m=65536 KiB, t=3, p=4`).
- **Cipher**: AES-256-GCM (256-bit key, 96-bit nonce) via standard `crypto.subtle` (WebCrypto API).
- **Subkey Derivation**: HKDF-SHA256 (RFC 5869) per file with unique 32-byte salts.

### 6.2 Key Hierarchy

```text
User Passphrase ─────────(Argon2id + Salt)─────────▶ Wrapping Key (KEK)
                                                             │
                                                    AES-256-GCM Unwrap
                                                             ▼
                                                      Master Key (MK)
                                                             │
                                                   HKDF-SHA256(MK, Salt)
                                                             ▼
                                                    File Encryption Key
```

### 6.3 Chunked Streaming AEAD Container (`.sdv`)

- **Format**: `SDV1` container with authenticated metadata header.
- **Chunks**: 1 MiB authenticated chunks.
- **Nonce Structure**: `[4 bytes prefix][7 bytes counter BE][1 byte final flag]`. Guarantees
  reordering and truncation defense.
- **Seeking**: Random-access chunk seek arithmetic allows decrypting arbitrary byte-ranges for 4K
  video seeking without loading entire files into memory.
