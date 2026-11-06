# DriveShell — Audit & Hardening Progress

**Last Updated:** November 5, 2026  
**Current Stage:** Stage 7 (Final Acceptance, Verification & Audit Scoreboard) — COMPLETE  
**Branch:** `hardening/pass-1`  
**Status:** Complete

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
  - [x] **GATE 2**: Approved by user.

- [x] **Stage 3: Security Hardening & Defenses (System-Wide)**
  - [x] SQLite FTS5 query sanitizer (`fts-sanitizer.ts`) and 500-permutation hostile fuzz test
  - [x] Path safety containment helper (`path-safety.ts`) and 35-vector hostile traversal table
  - [x] Fastify/Pino log redaction configuration and automated censoring test
        (`logger-redaction.test.ts`)
  - [x] Production vs. Dev security config separation and test (`environment-origin.test.ts`)
  - [x] Uniform defensive security headers plugin and snapshot test (`security-headers.test.ts`)
  - [x] In-memory rate limiting and backoff guard on sensitive routes (`rate-limiter.test.ts`)
  - [x] Security CI workflow (`.github/workflows/security.yml`) with Gitleaks, Audit, and Semgrep
  - [x] Deliverable `docs/audits/03-security-fixes.md`
  - [x] **GATE 3**: Approved by user.

- [x] **Stage 4a: Cryptographic Architecture & Design Gate**
  - [x] Frozen SDV1 specification in `docs/vault-format.md`
  - [x] Deterministic cryptographic test vectors in `packages/vault-spec/test-vectors.json`
  - [x] Pure core architecture comparison (Node server vs. WebCrypto browser)
  - [x] Multi-chunk AEAD streaming design (1 MiB chunks, deterministic nonces)
  - [x] Updated `docs/security.md` with master key wrapping, recovery key, and isolation rules
  - [x] **GATE 4a**: Approved by user.

- [x] **Stage 4b: Cryptographic Implementation & Test Suite**
  - [x] Pure WebCrypto provider in `packages/shared/src/vault/webcrypto-provider.ts`
  - [x] Binary container format parser and serializer in `packages/shared/src/vault/format.ts`
  - [x] Streaming AEAD chunked encrypt/decrypt engine in `packages/shared/src/vault/vault-engine.ts`
  - [x] Legacy migration helper in `packages/shared/src/vault/migration.ts`
  - [x] Cryptographic verification suite in `apps/server/test/vault-sdv1.test.ts` (9 tests passing:
        test vectors, bitflip, truncation, chunk swap, wrong key, boundary seeking, zeroization)
  - [x] Deliverable `docs/audits/04-vault.md`
  - [x] **GATE 4b**: Approved by user.

- [x] **Stage 5: Optimization (Measured)**
  - [x] Compound expression index for photo timeline queries (`idx_files_photos_timeline_fast`)
  - [x] Covering index for file browser navigation (`idx_files_browse_covering`)
  - [x] Migration 005 applied (`apps/server/migrations/005_optimization.sql`)
  - [x] SQLite PRAGMA performance tuning: `synchronous = NORMAL`, `temp_store = MEMORY`,
        `cache_size = -64000`, `mmap_size = 268435456`, `quick_check(1)`, `PRAGMA optimize`
  - [x] Query rewrite in `apps/server/src/db/queries/files.ts` to use
        `COALESCE(taken_at, modified_at)`
  - [x] Verified zero temp B-Tree sorts on timeline queries across 25k real & 100k synthetic DB
  - [x] Server cold start: 745.1 ms (budget < 800 ms)
  - [x] Peak throughput: 11,439.5 req/s (budget > 5,000 req/s)
  - [x] Web bundle size: 98.69 KB gzip (budget < 150 KB)
  - [x] Deliverable `docs/audits/05-optimization.md`
  - [x] **GATE 5**: Ready for sign-off.

- [x] **Stage 6: Portability & Release Engineering Readiness**
  - [x] Codebase module classification (Pure Logic vs Node-Bound vs UI)
  - [x] Native dependency matrix: Windows Desktop (Tauri) vs Android
  - [x] Platform abstraction seams (`SecretKeyStore`, `DatabaseConnection`, `HttpClient`)
  - [x] Android architecture options analysis (Option A, B, C; recommended path)
  - [x] Mobile security invariants: Scoped Storage, Keystore, Biometric unlock, `FLAG_SECURE`
  - [x] Dual-installer specification: NSIS (`.exe`) vs WiX (`.msi`)
  - [x] Tauri sidecar lifecycle, ephemeral loopback port discovery, and token passing
  - [x] Code signing pipeline (Azure Trusted Signing / Cloud HSM)
  - [x] **Windows NSIS Installer Packaging Complete**: Produced `Project-Sunflower-Setup-1.0.0.exe`
        (SHA-256: `20cdf13edbaa6b5eb2989bd715ea6ea643e6c4507434458314daf3012fdfa406`)
  - [x] Deliverable `docs/portability.md`
  - [x] Deliverable `docs/release-engineering.md`
  - [x] **GATE 6**: Ready for sign-off.

- [x] **Stage 7: Final Acceptance, Verification & Audit Scoreboard**
  - [x] Workspace clean build and verification (`pnpm typecheck`, `pnpm lint`, `pnpm -r test`,
        `pnpm build`, `pnpm audit --prod`)
  - [x] Final benchmark run and scoreboard consolidation
  - [x] Deliverable `docs/audits/07-final-report.md`
  - [x] Update `README.md` with final audit & performance badges
  - [x] Final commit and merge readiness report

- [x] **Hardening Pass 1: Video Playback, Smoothness & Timeline Jump**
  - [x] **Part A: Video Streaming & Codec Fallback**
    - [x] Video stream diagnosis across 6 real video files with byte-level range SHA-256 parity
          verification
    - [x] Fixed RFC 7233 range status 416 handling and client abort cleanup in
          `apps/server/src/routes/media.ts`
    - [x] Added Tier 1 unsupported browser codec fallback panel in `PhotoLightbox.tsx` with negative
          session caching
    - [x] Designed Tier 2 local transcoding pipeline in `docs/portability.md`
    - [x] Enforced video UX constraints (poster thumbnail tiles, `preload="metadata"`, src cleanup
          on close, volume persistence)
  - [x] **Part B: Lag, Smoothness & 429 Storm Elimination**
    - [x] Dev & Preview benchmarks across ~5,700 items (13.5k DOM nodes, 110 long tasks, 2,054
          requests fired)
    - [x] Identified and eliminated top 5 performance hotspots (unbounded DOM, layout reflow,
          request flooding, CSS overhead, $O(N^2)$ tile searches)
    - [x] Implemented section-level virtualization in `VirtualMonthSection.tsx` and memoized
          `GalleryTile.tsx`
    - [x] Replaced synchronous `getBoundingClientRect()` reflows with passive `IntersectionObserver`
    - [x] Diagnosed user console screenshot: fast-scroll network saturation + unthrottled
          `ensureSession()` cascading retries
    - [x] Implemented 1.5s session cooldown guard in `apps/web/src/lib/api.ts` and bundled
          `apps/web/public/favicon.ico`
    - [x] Verified post-virtualization metrics: -76% during-scroll DOM nodes, -63% heap, -44% frame
          drops
  - [x] **Part C: Timeline Jump Feature**
    - [x] Designed Timeline Jump specification in `docs/design/timeline-jump.md`
    - [x] Created pure month key helpers and unit tests in
          `packages/shared/src/media/timeline-helpers.ts`
    - [x] Implemented filter-aware `photoMonthsStmt` query in SQLite backend
          (`/api/files/months?filter=media`)
    - [x] Created `TimelineJumpPopover.tsx` with 4x3 month grid, year selector, keyboard navigation
          (G, Home, End, Esc, Arrows)
    - [x] Verified with unit tests and Playwright E2E spec (`apps/web/e2e/timeline-jump.spec.ts`)
  - [x] **Part D: Monorepo Verification & Audit Wrap-Up**
    - [x] Clean monorepo typecheck (3 of 3 projects)
    - [x] Full test suite execution (155 tests passing across shared, server, web)
    - [x] Playwright E2E test suite passing (4 of 4 tests)
    - [x] Production build clean (`shared`, `server`, `web`)
    - [x] Deliverable `docs/audits/01b-video-and-scroll.md` completed
    - [x] Updated `CHANGELOG.md` with hardening pass-1 entries

---

## Log of Completed Commits

- `f5aaa19` —
  `chore(tooling): add top-level ESLint ignores for data and build artifacts to prevent OOM`
- `7191b56` —
  `test(bench): establish Stage 1 baseline harness, synthetic 100k seed, and audit scoreboard`
- `577e43d` — `chore(branding): rename project to Sunflower Drive and commit Grand README`
- `7408f1d` — `feat(security): close SEC-001, SEC-002, SEC-003, SEC-006 and harden server routes`
- `088c653` —
  `feat(security): complete Stage 3 hardening with FTS sanitizer, path safety, rate limiting, and security CI`
- `8da9c5e` —
  `docs(vault): establish frozen SDV1 cryptographic specification and deterministic test vectors`
- `c5ca0af` — `feat(vault): implement pure SDV1 cryptographic core and test suite`
- `77a5e87` — `feat(perf): complete Stage 5 optimization and Stage 6 portability audit`
- `232de78` — `docs(audit): publish Stage 7 final verification report and audit scoreboard`
- `d30b58b` — `feat(ui): complete OneDrive-style UI enhancement pass for Sunflower Drive`
- `5beb574` — `fix(server,ui): isolate vault rate limiter and restore original sleek blue theme`
- `59bb093` — `fix(gallery): exclude TS declaration files and code-folder content from media views`
- `1dad3bf` — `chore: fix pre-commit hook`
- `9f25926` — `fix(web): shared package resolution caused blank screen`
- `b275167` — `fix(gallery): count videos without metadata except video/mp2t`
- `2417cb3` — `feat(sync): backfill video metadata for existing rows`
- `b3cd646` — `docs(audit): update Stage 1 baselines for corrected dataset and restored videos`
- `9ddc7b7` — `fix(media): improve video stream range handling and browser codec fallback`
- `bfe3d0a` — `perf(web): virtualize gallery grid and eliminate scroll reflow thrashing`
- `2d81a12` — `feat(gallery): add timeline jump month popover and filter-aware quick jump`
- `07917af` — `docs: record hardening pass-1 video, virtualization, and timeline jump results`
- `4a000a5` — `feat(media): implement Tier 2 on-demand FFmpeg video transcoding and caching`
- `[HEAD]` — `feat(desktop): package Windows NSIS release installer via Tauri v2`
