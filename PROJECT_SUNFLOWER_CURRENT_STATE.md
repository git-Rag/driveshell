# Project Sunflower — Comprehensive Software State Report

**Generated:** November 6, 2026  
**Repository:** `https://github.com/git-Rag/thesunflowerproject.git`  
**Commit:** `1eeeb23` (Branch: `main`, Tag: `v1.0.0`)  
**Product Name:** Project Sunflower  
**Author:** `git-Rag`

---

## 1. Executive Summary

**Project Sunflower** is a high-performance, local-first photo suite and Google Drive desktop client
engineered for instant timeline navigation, local metadata indexing, hardware-accelerated media
streaming, and zero-knowledge private vault storage. It features a modern dark obsidian (`#09090b`)
user interface inspired by Microsoft OneDrive Photos and Apple Photos, backed by a persistent local
SQLite database (`sunflower.db`) and native OS keychain security.

The application indexes 25,000+ files locally in SQLite with FTS5 trigram search, allowing instant
queries in under 1ms without network roundtrips. Media delivery features an instant blur-up
crossfade pipeline, prioritized thumbnail fetching, video range streaming (HTTP 206), on-demand Tier
2 FFmpeg video transcoding (HEVC/H.265 to H.264/AAC with FastStart), album management, starred
favorites, timeline month jumping, and an end-to-end zero-knowledge Private Vault implementing the
**SDV1** specification (Argon2id + AES-256-GCM + HKDF-SHA256 chunked streaming AEAD).

---

## 2. System Architecture & Technology Stack

Project Sunflower is structured as a pnpm monorepo with workspace isolation, strict TypeScript
typing, and native desktop packaging:

```
project-sunflower/
├── android/                # Capacitor 8 native Android application (Gradle, Platform 36)
├── apps/
│   ├── server/             # Node.js + Fastify backend API, sync engine & transcoder
│   └── web/                # React 19 + Vite + Tailwind CSS frontend
├── packages/
│   ├── shared/             # Shared TypeScript schemas, DTOs & SDV1 crypto core
│   └── vault-spec/         # Language-agnostic SDV1 test vectors
└── src-tauri/              # Tauri v2 desktop application wrapper (Rust)
```

### Core Technologies

- **Monorepo & Build Tooling:** pnpm 10 workspaces, TypeScript 5.6.3 (strict mode, 0 errors), ESLint
  9/10, Prettier 3, Vitest 2.1.9 (172 tests passing).
- **Backend (`apps/server`):**
  - **Framework:** Fastify 5.1 (lightweight loopback server with strict origin validation).
  - **Database:** SQLite 3 via `better-sqlite3` (`sunflower.db` with WAL mode, prepared statements,
    covering indexes, and FTS5 trigram search).
  - **Authentication:** Google OAuth 2.0 PKCE flow (`google-auth-library` + `googleapis`).
  - **Secrets & Credentials:** Native OS Keychain via `@napi-rs/keyring` (Windows Credential Manager
    / macOS Keychain / Linux Secret Service) with AES-256-GCM encrypted-file fallback.
  - **Transcoder:** Tier 2 FFmpeg video transcoding with disk caching and HTTP 206 range seeking.
- **Frontend (`apps/web`):**
  - **Framework:** React 19.0.0, Vite 6.4.5 (production bundle: 108.61 KB gzip JS, 9.10 KB gzip
    CSS).
  - **Styling:** Tailwind CSS 3.4.14 with obsidian dark theme palette (`#09090b`), Lucide React
    icons.
  - **Cryptography:** Web Crypto API (`crypto.subtle`) for zero-knowledge client-side SDV1
    encryption.
- **Desktop Packaging (`src-tauri`):**
  - Tauri v2 (Rust desktop wrapper, Windows WebView2 runtime, self-contained NSIS installer bundling
    Node.js 22 runtime and Fastify server).

---

## 3. SQLite Database Architecture

Located at `<dataDir>/sunflower.db` (defaults to `%LOCALAPPDATA%\ProjectSunflower\data\sunflower.db`
in production desktop mode). Operates with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) and
synchronous normal mode for maximum throughput and concurrent read/write isolation.

### Schema Version: 7

Seven forward SQL migrations have been implemented and applied:

- `001_initial.sql`: Core accounts, files, sync tokens, and FTS5 full-text search.
- `002_files.sql`: Media dimensions, EXIF camera make/model, capture timestamp (`taken_at`).
- `003_albums.sql`: Custom user albums and album-item relationship mapping.
- `004_vault.sql`: Zero-knowledge vault security parameters and encrypted file entries.
- `005_optimization.sql`: High-speed compound timeline indexes (`idx_files_photos_timeline_fast`)
  eliminating temporary B-tree sorts.
- `006_media_classification.sql`: Strict media classification filtering out non-media files.
- `007_video_classification.sql`: Video MIME-type classification and metadata backfill tracking.

---

## 4. Complete Implementation Status

### Verification Metrics

- **Automated Tests:** **172 passed, 0 failed** across 24 test suites (`packages/shared`: 7,
  `apps/web`: 14, `apps/server`: 151).
- **TypeScript Strict Check:** `pnpm typecheck` exits with **0 errors**.
- **Production Web Bundle:** 108.61 KB gzip JS (`dist/assets/index-*.js`), 9.10 KB gzip CSS.
- **Windows Desktop Installer:** `Project-Sunflower-Setup-1.0.0.exe` (**26.41 MiB**, SHA-256:
  `063E8E31D7AA81CFB220797FF16A905DC64A042E655BB17B21D22AB1D5F4ADFA`).
- **Android Mobile Package:** `Project-Sunflower-1.0.0-debug.apk` (**4.60 MiB / 4,823,870 bytes**,
  SHA-256: `C0FA653B8DECB426FC2758BA4264361523AC13F872B71FED166C05FBDE7BE1C6`).
- **Production Dependency Audit:** `pnpm audit --prod` exits with **0 vulnerabilities**.

### Completed Feature Sets

1. **Authentication & OS Keychain:**
   - Loopback OAuth 2.0 PKCE flow with CSRF state validation.
   - Secure storage in OS Keychain (`projectsunflower` service with migration fallbacks).
2. **Resilient Sync Engine:**
   - Resumable full & incremental sync with Google Drive changes API.
   - SSE status stream with automatic keepalive and reconnection backoff.
   - Exponential backoff with jitter on HTTP 429/403 rate limits.
3. **High-Performance Gallery & Timeline:**
   - Chronological month grouping with dynamic filter bar (All, Photos, Videos, Favorites).
   - Smooth 4-stop zoom slider (Extra Small to Large).
   - Month Chip Popover with 4×3 grid and dynamic year scrubber.
4. **Media Player & Video Transcoding:**
   - Instant blur-up crossfade pipeline with priority-driven loading.
   - Native HTTP 206 partial content range seeking.
   - Tier 2 FFmpeg on-demand transcoding for HEVC/H.265 and AVCHD.
   - In-lightbox codec detection with direct download/drive fallback.
5. **Private Vault (SDV1 Cryptography):**
   - Specification-grade chunked streaming AEAD with Argon2id, AES-256-GCM, and HKDF-SHA256.
   - Byte-for-byte verified against deterministic reference test vectors.
   - In-memory zeroization upon vault lock.
6. **Desktop Release Packaging:**
   - Tauri v2 + Fastify loopback sidecar architecture.
   - Per-user NSIS standalone installer with automatic background server lifecycle management.
7. **Mobile Android Packaging (Capacitor 8):**
   - Native Gradle project (`android/`) targeting Android 14+ (Platform 36, Min SDK 24).
   - Zero-transcoder native hardware decoding via Android MediaCodec in WebView (native HEVC/H.265,
     AVC, VP9, AV1 playback).
   - Edge-to-edge layout with safe-area notch insets and obsidian dark theme status bar (`#09090b`).
   - Google OAuth PKCE deep linking (`com.projectsunflower.app://oauth2redirect`).
   - Debug APK generated: `Project-Sunflower-1.0.0-debug.apk` (**4.60 MiB / 4,823,870 bytes**,
     SHA-256: `C0FA653B8DECB426FC2758BA4264361523AC13F872B71FED166C05FBDE7BE1C6`).
