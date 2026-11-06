# Sunflower Drive — Security Audit Stage 2: Server, Auth & Network

> **Audit Report**: Stage 2 Implementation & Verification  
> **Status**: COMPLETED — Ready for Gate 2 Review  
> **Date**: November 4, 2026  
> **Branch**: `hardening/pass-1`  
> **Test Suite**: 52 passing tests (0 failures)

---

## 1. Executive Summary

In Stage 2, all server-side and network-boundary security vulnerabilities identified in Stage 0 were
resolved and backed by automated tests:

1. **SEC-001 (DNS Rebinding)**: `Host` header strictly constrained to loopback (`127.0.0.1` and
   `localhost`).
2. **SEC-002 (Stored XSS on Media Stream)**: Stored-XSS completely mitigated. Inline streaming
   strictly restricted to safe raster images (JPEG, PNG, WebP, AVIF) and audio/video containers.
   SVG, HTML, PDF, and JavaScript always force `Content-Disposition: attachment`. Hardened with
   `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox; default-src 'none'`.
3. **SEC-003 (SSRF via Thumbnail Fetch)**: Implemented `outbound-guard.ts` enforcing HTTPS-only,
   IP/localhost ban, metadata IP (`169.254.169.254`) ban, port 443 only, strict
   `.googleusercontent.com` / `.googleapis.com` suffix matching, manual hop-by-hop redirect
   inspection (max 3 hops), 10s timeout, 15 MB payload limit, and confirmed zero OAuth token
   forwarding.
4. **SEC-006 (Origin / CORS / CSRF)**: Added `Sec-Fetch-Site: cross-site` 403 rejection across all
   routes. Added `Origin` validation against `ALLOWED_ORIGIN_REGEX` on all mutating routes (`POST`,
   `PUT`, `PATCH`, `DELETE`) and `/api/vault/*`.
5. **SEC-005 (Vault Route Cache-Control)**: Added `onSend` hook on vault routes setting
   `Cache-Control: no-store, no-cache, must-revalidate, private` and `Pragma: no-cache`. Rejection
   of direct navigation (`sec-fetch-mode: navigate`).
6. **S4 (OAuth Scope Minimization)**: Removed redundant `drive.metadata.readonly` from scopes.
7. **S2 (Input Validation)**: Added Zod schemas for query parameters and JSON payloads across
   `files.ts`, `albums.ts`, and `vault.ts`.
8. **Dependency Audit (GHSA-mrhx-c7xc-m3w5)**: Upgraded `zod` to `^4.6.7`, bringing
   `pnpm audit --prod` from 1 High vulnerability to **0 vulnerabilities**.

---

## 2. Vulnerability Remediations & Code Proof (`file:line`)

### 2.1 SEC-001 & SEC-006: DNS Rebinding, Sec-Fetch-Site, and Origin Guard

- **File**: `apps/server/src/auth/session.ts:40-112`
- **Before**: Only checked `LOOPBACK_ORIGIN_REGEX` on mutating requests without `Sec-Fetch-Site`
  inspection; vault routes were not guarded against browser navigation.
- **After**:

```ts
// apps/server/src/auth/session.ts:40-112
export const ALLOWED_ORIGIN_REGEX =
  /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?|tauri:\/\/localhost|https?:\/\/tauri\.localhost)$/;

// 1. DNS rebinding protection
const host = req.headers['host'] ?? '';
if (!LOOPBACK_HOST_REGEX.test(host)) {
  req.log.warn({ host }, 'Rejected: Host header does not match loopback');
  void reply.code(400).send({ error: 'Bad Host header' });
  return;
}

// 2. Sec-Fetch-Site check — reject cross-site requests
const secFetchSite = req.headers['sec-fetch-site'];
if (secFetchSite === 'cross-site') {
  req.log.warn({ secFetchSite, path }, 'Rejected: Cross-site fetch detected');
  void reply.code(403).send({ error: 'Forbidden cross-site request' });
  return;
}

// 3. Origin check on state-mutating requests (POST, PUT, PATCH, DELETE)
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const origin = req.headers['origin'];
if (MUTATING.has(method ?? '')) {
  if (origin && !ALLOWED_ORIGIN_REGEX.test(origin)) {
    req.log.warn({ origin, path }, 'Rejected: Forbidden origin on mutating route');
    void reply.code(403).send({ error: 'Forbidden origin' });
    return;
  }
}

// 4. Strict Vault Route Protection (/api/vault/*)
if (path.startsWith('/api/vault')) {
  const secFetchMode = req.headers['sec-fetch-mode'];
  if (secFetchMode === 'navigate') {
    req.log.warn({ path }, 'Rejected: Direct navigation forbidden on vault route');
    void reply.code(403).send({ error: 'Forbidden direct navigation on vault routes' });
    return;
  }
  if (origin && !ALLOWED_ORIGIN_REGEX.test(origin)) {
    req.log.warn({ origin, path }, 'Rejected: Forbidden origin on vault route');
    void reply.code(403).send({ error: 'Forbidden origin on vault route' });
    return;
  }
}
```

---

### 2.2 SEC-002: Stored-XSS Mitigation & Media Isolation

- **File**: `apps/server/src/routes/media.ts:16-47, 309-325`
- **Before**: Stream route forwarded upstream `file.mime_type` and served inline without
  content-security headers; filenames in Content-Disposition were not sanitized.
- **After**:

```ts
// apps/server/src/routes/media.ts:16-47
export const SAFE_INLINE_MIME_PATTERNS = [
  /^image\/(jpeg|png|webp|avif)$/i,
  /^audio\/(mpeg|mp4|ogg|wav|webm|flac|aac)$/i,
  /^video\/(mp4|webm|quicktime|ogg|x-matroska)$/i,
];

export function isSafeInlineMime(mime: string): boolean {
  if (!mime) return false;
  const lower = mime.toLowerCase().trim();
  if (
    lower.includes('svg') ||
    lower.includes('html') ||
    lower.includes('xml') ||
    lower.includes('javascript')
  ) {
    return false;
  }
  return SAFE_INLINE_MIME_PATTERNS.some((p) => p.test(lower));
}

export function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\x00-\x1f\x7f"/\\]/g, '_');
}

// apps/server/src/routes/media.ts:310-325 (GET /api/media/:fileId/stream)
const safeInline = isSafeInlineMime(file.mime_type);
if (safeInline) {
  reply.header('Content-Type', file.mime_type);
  reply.header('Content-Disposition', 'inline');
} else {
  reply.header('Content-Type', 'application/octet-stream');
  reply.header('Content-Disposition', `attachment; filename="${sanitizeFilename(file.name)}"`);
}

reply.header('X-Content-Type-Options', 'nosniff');
reply.header('Content-Security-Policy', "sandbox; default-src 'none'");
reply.header('Cache-Control', 'private, max-age=86400');
```

---

### 2.3 SEC-003: Anti-SSRF Outbound Network Guard

- **File**: `apps/server/src/utils/outbound-guard.ts:27-187`
- **Before**: Naked `fetch(driveThumbUrl)` directly contacted whatever URL was stored in the
  database.
- **After**:

```ts
// apps/server/src/utils/outbound-guard.ts:27-73
export function validateOutboundUrl(rawUrl: string): URL {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'https:') {
    throw new SsrfError(`Forbidden protocol: '${parsed.protocol}'. Only HTTPS is permitted.`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  const isIpv6 = hostname.includes(':') || hostname.startsWith('[') || hostname.endsWith(']');
  if (isIpv4 || isIpv6 || hostname === 'localhost') {
    throw new SsrfError(`Direct IP address or localhost access is forbidden: ${hostname}`);
  }

  if (parsed.port && parsed.port !== '443') {
    throw new SsrfError(`Non-standard HTTPS port forbidden: ${parsed.port}`);
  }
  if (parsed.username || parsed.password) {
    throw new SsrfError('Embedded credentials in URL are forbidden');
  }

  const isAllowedHost =
    ALLOWED_EXACT_HOSTS.includes(hostname) ||
    ALLOWED_DOMAIN_SUFFIXES.some((suffix) => hostname.endsWith(suffix));

  if (!isAllowedHost) {
    throw new SsrfError(
      `Forbidden destination host: '${hostname}'. Only official Google media domains are permitted.`,
    );
  }
  return parsed;
}
```

Integrated with manual hop-by-hop redirect validation, 10s abort timer, 15 MB chunk limiter, and
zero authorization forwarding in `fetchWithGuard`.

---

### 2.4 SEC-005: Vault Cache Control

- **File**: `apps/server/src/routes/vault.ts:51-54`
- **Implementation**:

```ts
app.addHook('onSend', async (_req, reply) => {
  void reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  void reply.header('Pragma', 'no-cache');
});
```

---

### 2.5 S4: Scope Minimization

- **File**: `apps/server/src/routes/auth.ts:62-65`
- **Before**: Included `https://www.googleapis.com/auth/drive.metadata.readonly` alongside
  `drive.readonly`.
- **After**:

```ts
export const SCOPES: Record<ScopeLevel, string[]> = {
  readonly: ['https://www.googleapis.com/auth/drive.readonly'],
  full: ['https://www.googleapis.com/auth/drive'],
};
```

---

### 2.6 S2: Input Validation with Zod

- **Files**:
  - `apps/server/src/routes/files.ts:21-65`: `PhotosQuerySchema`, `ListQuerySchema`,
    `BrowseQuerySchema`, `SearchQuerySchema`.
  - `apps/server/src/routes/albums.ts:15-31`: `CreateAlbumSchema`, `UpdateAlbumSchema`,
    `AddItemsSchema` (with bounded `.max(1000)`).
  - `apps/server/src/routes/vault.ts:16-43`: `VaultSetupSchema`, `VaultUploadSchema`,
    `VaultFileParamsSchema`.

---

### 2.7 Production Dependency Vulnerabilities

- **Command**: `pnpm audit --prod`
- **Result**:

```text
No known vulnerabilities found
```

(Upgraded `zod` to `^4.6.7` in `apps/server` and `packages/shared`, patching GHSA-mrhx-c7xc-m3w5).

---

## 3. Honest Loopback Trust Model Assessment

| Surface                        | Protection Guarantee                                                                                                                                                                                                                                                | Honest Limitation                                                                                                                                                                                                                  |
| :----------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web Browser / Remote Sites** | **Complete Isolation**: A malicious website cannot issue requests to localhost (`Sec-Fetch-Site: cross-site` 403), cannot forge mutating requests (Origin check 403), cannot bypass CORS, and cannot embed vault pages in iframes (`Sec-Fetch-Mode: navigate` 403). | None within standard browser security sandbox.                                                                                                                                                                                     |
| **Local System Processes**     | **Partial Protection**: The session cookie (`ds_session`) is minted on `GET /` and stored in browser memory.                                                                                                                                                        | Any local process running under the user's OS account can bind to loopback and call `GET /` to obtain a session cookie. For Tauri desktop packaging, tokens must be transferred via native IPC rather than a public HTTP endpoint. |

---

## 4. Verification Evidence

### 4.1 Automated Security Unit Tests

- **Command**: `pnpm -r test`
- **Output**:

```text
Scope: 3 of 4 workspace projects
packages/shared test: Done
apps/web test:  ✓ src/scaffold.test.ts (1 test) 3ms
apps/web test:  ✓ src/vault_crypto.test.ts (1 test) 72ms
apps/web test:  Test Files  2 passed (2) | Tests  2 passed (2)
apps/server test:  ✓ test/sync.test.ts (15 tests) 5571ms
apps/server test:  ✓ test/security.test.ts (17 tests) 392ms
apps/server test:  ✓ test/auth.test.ts (11 tests) 96ms
apps/server test:  ✓ test/albums_vault.test.ts (3 tests) 71ms
apps/server test:  ✓ test/gallery_files.test.ts (4 tests) 76ms
apps/server test:  ✓ test/scaffold.test.ts (2 tests) 1ms
apps/server test:  Test Files  6 passed (6) | Tests  52 passed (52)
Done in 12.07s
```

### 4.2 Typecheck & Lint Verification

- **Typecheck**: `pnpm typecheck` -> **Exit code 0** (all 3 workspace packages pass).
- **Linter**: `pnpm lint` -> **Exit code 0** (0 errors).
- **Audit**: `pnpm audit --prod` -> **0 vulnerabilities**.

---

## 5. GATE 2 STOP

Stage 2 is fully implemented and verified. All requirements have been fulfilled with automated test
proof and zero lint or type errors.

**Awaiting user approval at GATE 2 before proceeding to Stage 3 (Database & Storage Optimization).**
