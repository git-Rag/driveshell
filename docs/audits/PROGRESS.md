# DriveShell — Audit & Hardening Progress

**Last Updated:** November 4, 2026  
**Current Stage:** Stage 1 (Baselines & Benchmark Harness)  
**Branch:** `hardening/pass-1`  
**Status:** In Progress

---

## Approved Gate 0 Decisions & Policies

- **Q1 Vault Redesign:** Approved for pure core architecture (Argon2id + Master Key + 1 MiB chunked
  AEAD + recovery key). Stage 4a design gate mandatory. Evaluates where crypto runs (browser
  WebCrypto vs Node server), recommending pure core on WebCrypto + WASM Argon2id.
- **Q2 SEC-002 (Stored XSS on Stream):** Inline streaming restricted strictly to safe raster images
  (no SVG) and video/audio. Everything else `Content-Disposition: attachment; filename=...`. Enforce
  `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox; default-src 'none'`.
- **Q3 Outbound Guard (SSRF):** Hostname matching by exact parsed suffix (never substring), HTTPS
  only, every redirect hop inspected, max 3 redirects, 10s timeout, size cap. Check whether
  thumbnail fetch forwards OAuth token.
- **Q4 Port / Token Architecture:** Port discovery via `data/.port` for dev; no token on disk. Tauri
  release: Rust spawns backend, picks port, delivers token via stdin/env, delivers base URL + token
  to webview via IPC. Bearer token header planned for Tauri (since `tauri://localhost` to
  `127.0.0.1` is cross-site).
- **Q5 ESLint Ignores:** Add top-level global ignores (`data/**`, `apps/server/data/**`,
  `**/dist/**`, `src-tauri/target/**`). Completed in commit `f5aaa19`.

### Severity Recalibrations:

- **SEC-002 (Stream XSS):** Recalibrated to **High**.
- **SEC-003 (Thumbnail SSRF):** Recalibrated to **Medium** (raised to High if token is forwarded).
- **SEC-005 (Vault Cache-Control):** Recalibrated to **Medium**.
- **SEC-006 (CORS & GET Origin):** Recalibrated to **Medium** (Cross-origin pages cannot read
  without CORS, but SameSite ignores ports so a page on another localhost port sends the cookie.
  Mitigate with exact-origin match in prod + `Sec-Fetch-Site` check on ALL methods including GET,
  plus Origin required on vault routes).
- **NEW FINDING (Cookie Bootstrap Route):** The cookie bootstrap route issues a session to any local
  process. The token only defends against remote web pages, not local malware. Documented in
  `docs/security.md`.
- **S4 (OAuth Scopes):** Refuted. Also drop redundant `drive.metadata.readonly` since
  `drive.readonly` covers it.
- **S10 (Tauri Phase 10):** Phase 10 is NOT done (no sidecar spawn in `lib.rs`).
- **S13 (Secret Scan):** Downgraded to **Info**.

---

## Stage Checklist

- [x] **Stage 0: Recon (Read-only)**
  - [x] Create `docs/audits/PROGRESS.md`
  - [x] Monorepo verification (`typecheck`, `lint`, `test`, `build`) & timing baseline
  - [x] Codebase & Entry Points Map
  - [x] Fastify Routes & Schema Audit
  - [x] Trust Boundary & Data Flow Diagram
  - [x] Dependency & Native Addon Inventory
  - [x] Verification of Suspicions S1–S14 (with `file:line` proof)
  - [x] Architectural Discrepancy Analysis
  - [x] Secret & Sensitive Data Scan (Locations only)
  - [x] Deliverable `docs/audits/00-recon.md`
  - [x] **GATE 0**: Approved by user with corrections.

- [x] **Stage 1: Baselines & Benchmark Harness**
  - [x] Safety backup of real database (`apps/server/data/backups/20261104-222432/`)
  - [x] Check if thumbnail proxy forwards OAuth token (SEC-003 confirmed Medium, no token forwarded)
  - [x] Build reusable benchmark harness in `scripts/bench/` and `scripts/seed.ts`
  - [x] Database benchmarks: EXPLAIN QUERY PLAN & execution times (25k real + 100k synthetic)
  - [x] Server benchmarks: cold start, RSS, event loop delay, thumbnail latency, throughput
  - [x] Web benchmarks: bundle size by chunk, initial JS/CSS gzip, source map analysis
  - [x] Sync benchmarks: full & incremental sync against mock Drive
  - [x] Deliverable `docs/audits/01-baselines.md`
  - [x] **GATE 1**: Approved by user.

- [x] **Stage 2: Security Hardening (Server, Auth & Network)**
  - [x] DNS rebinding protection (SEC-001) in `session.ts`
  - [x] Stream route stored-XSS & isolation (SEC-002) in `media.ts`
  - [x] Anti-SSRF Outbound Network Guard (SEC-003) in `outbound-guard.ts`
  - [x] CSRF, Sec-Fetch-Site, Origin checks, and Vault Route Protection (SEC-006) in `session.ts`
  - [x] Vault Cache-Control headers (SEC-005) in `vault.ts`
  - [x] OAuth Scope hygiene & redundant scope removal (S4) in `auth.ts`
  - [x] Input validation with Zod schemas (S2) in `files.ts`, `albums.ts`, `vault.ts`
  - [x] Production audit fix (GHSA-mrhx-c7xc-m3w5): upgraded `zod` to `^4.6.7`
  - [x] 15 new security unit tests in `apps/server/test/security.test.ts` (total: 52 passing tests)
  - [x] Updated `docs/security.md` with trust model, SSRF invariants, and isolation headers
  - [x] Deliverable `docs/audits/02-security-server.md`
  - [x] **GATE 2**: Ready for user review.

---

## Log of Completed Commits

- `f5aaa19` —
  `chore(tooling): add top-level ESLint ignores for data and build artifacts to prevent OOM`
- `7191b56` —
  `test(bench): establish Stage 1 baseline harness, synthetic 100k seed, and audit scoreboard`
- `577e43d` — `chore(branding): rename project to Sunflower Drive and commit Grand README`
