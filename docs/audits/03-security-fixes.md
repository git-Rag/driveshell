# Project Sunflower — Security Audit Stage 3: Security Hardening & Defenses

> **Audit Report**: Stage 3 Implementation & Comprehensive Verification  
> **Status**: COMPLETED — Ready for Gate 3 Review  
> **Date**: November 4, 2026  
> **Branch**: `hardening/pass-1`  
> **Test Suite**: 102 passing tests across 12 test files (0 failures)

---

## 1. Executive Summary

Stage 3 implemented all mandatory system-wide security hardening requirements, establishing
defense-in-depth across input sanitization, filesystem boundaries, environment-based origin
enforcement, log redaction, HTTP header defenses, rate limiting, and CI automation:

1. **FTS5 Input Sanitizer (`fts-sanitizer.ts`)**: Prevents `SqliteError: fts5: syntax error` and FTS
   query injection. Tested against 500 randomized hostile permutations.
2. **Path Safety & Traversal Defense (`path-safety.ts`)**: Strictly confines filesystem operations
   (e.g. thumbnail cache) within base directories. Tested against a comprehensive attack table of 35
   hostile POSIX and Windows traversal vectors.
3. **Sensitive Log Redaction**: Configured Pino logger in Fastify to mask secrets, tokens,
   passwords, and crypto payloads with `[REDACTED]`. Tested with automated assertions.
4. **Production vs. Dev Origin Separation**: Vite dev server origins (`:5173`) are strictly blocked
   in production (`NODE_ENV === 'production'`) while allowing Tauri desktop schemes and loopback
   production ports.
5. **Uniform Security Headers Plugin**: Fastify hook sets `X-Content-Type-Options`,
   `X-Frame-Options`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
   `Referrer-Policy`, and `Permissions-Policy`.
6. **In-Memory Rate Limiter & Backoff**: Added sliding-window rate limiting on
   `/api/setup/credentials` and `/api/vault/*` routes returning `429 Too Many Requests` with
   `Retry-After`.
7. **Security CI Job (`.github/workflows/security.yml`)**: Added automated Gitleaks secret scanning,
   blocking production vulnerability audits, and Semgrep SAST analysis with pinned actions.

---

## 2. Hardening Modules & Code Proof (`file:line`)

### 2.1 SQLite FTS5 Query Sanitizer

- **Source**:
  [`apps/server/src/utils/fts-sanitizer.ts:20-50`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/utils/fts-sanitizer.ts#L20-L50)
- **Integration**:
  [`apps/server/src/db/queries/files.ts#L354-L364`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/db/queries/files.ts#L354-L364)
- **Mechanism**: Strips control characters, parses unicode word tokens, doubles quotes (`"` ->
  `""`), and formats terms as prefix matches (`"token"*`).
- **Proof**:
  [`apps/server/test/fts-sanitizer.test.ts#L43-L91`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/test/fts-sanitizer.test.ts#L43-L91)
  (500 randomized hostile query strings executed against in-memory SQLite FTS5 table with 0 errors).

---

### 2.2 Path Traversal Prevention

- **Source**:
  [`apps/server/src/utils/path-safety.ts#L27-L62`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/utils/path-safety.ts#L27-L62)
- **Integration**:
  [`apps/server/src/routes/media.ts#L115-L122`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/routes/media.ts#L115-L122)
- **Mechanism**: Enforces `path.relative` containment, blocks null bytes (`\0`), blocks alternate
  data streams (`:`), and blocks DOS reserved devices (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`,
  `LPT1-9`).
- **Proof**:
  [`apps/server/test/path-safety.test.ts#L27-L77`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/test/path-safety.test.ts#L27-L77)
  (35 hostile Windows/POSIX test vectors).

---

### 2.3 Logger Sensitive Data Redaction

- **Source**:
  [`apps/server/src/index.ts#L26-L45`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/index.ts#L26-L45)
- **Mechanism**: Configured Pino logger with `redact: { paths: [...], censor: '[REDACTED]' }`
  masking `access_token`, `refresh_token`, `client_secret`, `password`, `code_verifier`, and crypto
  payloads.
- **Proof**:
  [`apps/server/test/logger-redaction.test.ts#L1-L60`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/test/logger-redaction.test.ts#L1-L60).

---

### 2.4 Production vs. Dev Security Config Separation

- **Source**:
  [`apps/server/src/auth/session.ts#L45-L67`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/auth/session.ts#L45-L67)
- **Mechanism**: `isAllowedOrigin` rejects port `5173` when `NODE_ENV === 'production'`.
- **Proof**:
  [`apps/server/test/environment-origin.test.ts#L1-L38`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/test/environment-origin.test.ts#L1-L38).

---

### 2.5 Uniform Defensive Security Headers

- **Source**:
  [`apps/server/src/auth/security-headers.ts#L1-L26`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/auth/security-headers.ts#L1-L26)
- **Integration**:
  [`apps/server/src/index.ts#L70`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/index.ts#L70)
- **Proof**:
  [`apps/server/test/security-headers.test.ts#L1-L50`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/test/security-headers.test.ts#L1-L50).

---

### 2.6 Sensitive Route Rate Limiting & Backoff

- **Source**:
  [`apps/server/src/utils/rate-limiter.ts#L1-L50`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/utils/rate-limiter.ts#L1-L50)
- **Integration**: Mounted on `/api/setup/credentials`
  ([`auth.ts#L93`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/routes/auth.ts#L93))
  and `/api/vault/*`
  ([`vault.ts#L47`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/routes/vault.ts#L47)).
- **Proof**:
  [`apps/server/test/rate-limiter.test.ts#L1-L50`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/test/rate-limiter.test.ts#L1-L50).

---

### 2.7 Security & SAST CI Automation

- **Source**:
  [`.github/workflows/security.yml`](file:///d:/Workspace/GithubRepos/DriveShell/.github/workflows/security.yml)
- **Jobs**:
  - Gitleaks Secret Scanning (full git history).
  - Production Vulnerability Audit (`pnpm audit --prod`).
  - Semgrep Static Application Security Testing.

---

## 3. Accepted Risks & Remaining Security Scope

| Surface / Area                   | Current Status                                      | Notes / Plan                                                                                                                                                                                                    |
| :------------------------------- | :-------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local Host Malware**           | Accepted limitation of loopback server architecture | Remote web attackers cannot access loopback (blocked by CORS, Origin, and Sec-Fetch-Site). Local processes running as the user have socket access. In Tauri release, IPC replaces loopback token bootstrapping. |
| **Vault Cryptographic Redesign** | Deferred to Stage 4                                 | Language-agnostic, frozen-versioned spec with WebCrypto + WASM Argon2id, 1 MiB chunked AEAD, and recovery key. Designed in Stage 4a; implemented in Stage 4b.                                                   |

---

## 4. Verification Evidence

### 4.1 Automated Test Suite (102 passed, 0 failed)

```powershell
pnpm -r test
```

```text
Scope: 3 of 4 workspace projects
apps/web test:  ✓ src/scaffold.test.ts (1 test) 4ms
apps/web test:  ✓ src/vault_crypto.test.ts (1 test) 83ms
apps/web test:  Test Files  2 passed (2) | Tests  2 passed (2)
apps/server test:  ✓ test/sync.test.ts (15 tests) 5651ms
apps/server test:  ✓ test/security.test.ts (17 tests) 367ms
apps/server test:  ✓ test/auth.test.ts (11 tests) 90ms
apps/server test:  ✓ test/albums_vault.test.ts (3 tests) 62ms
apps/server test:  ✓ test/gallery_files.test.ts (4 tests) 74ms
apps/server test:  ✓ test/fts-sanitizer.test.ts (6 tests) 26ms
apps/server test:  ✓ test/path-safety.test.ts (35 tests) 6ms
apps/server test:  ✓ test/logger-redaction.test.ts (1 test) 4ms
apps/server test:  ✓ test/environment-origin.test.ts (4 tests) 1ms
apps/server test:  ✓ test/rate-limiter.test.ts (2 tests) 9ms
apps/server test:  ✓ test/security-headers.test.ts (2 tests) 7ms
apps/server test:  ✓ test/scaffold.test.ts (2 tests) 0ms
apps/server test:  Test Files  12 passed (12) | Tests  102 passed (102)
Done in 12.72s
```

### 4.2 Typecheck, Linter & Production Audit

- `pnpm typecheck` -> Exit code 0
- `pnpm lint` -> Exit code 0 (0 errors)
- `pnpm audit --prod` -> No known vulnerabilities found

---

## 5. GATE 3 STOP

Stage 3 security hardening is complete, backed by 102 passing automated tests and zero
warnings/errors.

**Awaiting user approval at GATE 3 before proceeding to Stage 4 (Vault Hardening: Design First in
Stage 4a).**
