# DriveShell — Comprehensive Software State Report

**Generated:** November 4, 2026  
**Repository:** `https://github.com/git-Rag/driveshell.git`
(`d:\Workspace\GithubRepos\DriveShell`)  
**Commit:** `9b9f539` (Branch: `main`)  
**Author:** `git-Rag`

---

## 1. Executive Summary

DriveShell is a high-performance, local-first desktop client for Google Drive, engineered
specifically for lightning-fast media browsing, instant photo presentation, and zero-knowledge
private storage. It features a modern dark obsidian (`#09090b`) user interface inspired by Microsoft
OneDrive Photos and Apple Photos, backed by a persistent local SQLite database and native OS
keychain security.

The software indexes 25,000+ files locally in SQLite with FTS5 trigram search, allowing instant
queries in under 5ms without network roundtrips. Media delivery features an instant blur-up
crossfade pipeline, prioritized thumbnail fetching, video range streaming (HTTP 206), album
management, starred favorites, and an end-to-end zero-knowledge Private Vault encrypted with
AES-256-GCM and PBKDF2.

---

## 2. System Architecture & Technology Stack

DriveShell is structured as a pnpm monorepo with workspace isolation, strict TypeScript typing, and
native desktop packaging:

```
DriveShell/
├── apps/
│   ├── server/             # Node.js + Fastify backend API & sync engine
│   └── web/                # React 19 + Vite + Tailwind CSS frontend
├── packages/
│   └── shared/             # Shared TypeScript schemas, DTOs & constants
└── src-tauri/              # Tauri v2 desktop application wrapper (Rust)
```

### Core Technologies

- **Monorepo & Build Tooling:** pnpm 11, Turborepo / npm workspaces, TypeScript 5.6.3 (strict mode),
  ESLint 10, Prettier 3.
- **Backend (`apps/server`):**
  - **Framework:** Fastify 5.1 (lightweight HTTP/1.1 server on port 3000).
  - **Database:** SQLite 3 via `better-sqlite3` (WAL mode enabled, prepared statements, FTS5 trigram
    indexing).
  - **Authentication:** Google OAuth 2.0 (`google-auth-library` + `googleapis` v189).
  - **Secrets & Credentials:** Native OS Keychain via `@napi-rs/keyring` (Windows Credential Manager
    / macOS Keychain / Linux Secret Service).
- **Frontend (`apps/web`):**
  - **Framework:** React 19.0.0, Vite 6.0.1.
  - **Styling:** Tailwind CSS 3.4.14 with custom obsidian dark theme palette (`#09090b`), Lucide
    React icons.
  - **Cryptography:** Web Crypto API (`window.crypto.subtle`) for zero-knowledge client-side
    encryption.
- **Desktop Packaging (`src-tauri`):**
  - Tauri v2 (Rust backend, Windows WebView2 runtime, lightweight native `.exe` build).

---

## 3. SQLite Database Architecture

Located at `apps/server/data/driveshell.db`. Operates with Write-Ahead Logging
(`PRAGMA journal_mode = WAL;`) and synchronous normal mode for maximum throughput and concurrent
read/write isolation.

### Schema Version: 4

Four forward SQL migrations have been implemented and applied:

- `001_initial.sql`: Core accounts, files, sync tokens, and FTS5 full-text search.
- `002_media_metadata.sql`: Image width/height, EXIF camera make/model, capture timestamp
  (`taken_at`).
- `003_albums.sql`: Custom user albums and album-item relationship mapping.
- `004_vault.sql`: Zero-knowledge vault security parameters and encrypted file entries.

### Database Tables Breakdown

| Table Name          | Primary Key          | Description                                         | Key Indexes / Triggers                                                        |
| :------------------ | :------------------- | :-------------------------------------------------- | :---------------------------------------------------------------------------- |
| `schema_migrations` | `version`            | Migration version tracking                          | Ensures idempotent upgrades                                                   |
| `accounts`          | `id` (Google Sub ID) | Authenticated user profiles, email, sync tokens     | `idx_accounts_email`                                                          |
| `files`             | `account_id, id`     | Google Drive indexed files, metadata, EXIF, dates   | `idx_files_parent`, `idx_files_mime`, `idx_files_modified`, `idx_files_taken` |
| `files_fts`         | `rowid`              | SQLite FTS5 trigram full-text search table          | Synchronized via INSERT/UPDATE/DELETE triggers                                |
| `albums`            | `id` (UUID)          | User-created albums (title, description, cover)     | `idx_albums_account`                                                          |
| `album_items`       | `album_id, file_id`  | Join table for many-to-many album items             | `idx_album_items_file`                                                        |
| `vault_settings`    | `account_id`         | Zero-knowledge salt, canary verification ciphertext | Single record per account                                                     |
| `vault_files`       | `id` (UUID)          | Encrypted file metadata, IV, cipher original name   | `idx_vault_files_account`                                                     |

---

## 4. Complete Implementation Status by Phase

### Phase 0: Monorepo Foundation & Tooling (100% Complete)

- Fully configured pnpm workspace (`apps/server`, `apps/web`, `packages/shared`).
- Unified TypeScript project references with `noEmitOnError: true` and strict typechecking.
- ESLint 10 + TypeScript-ESLint + React Hooks plugins.
- Prettier auto-formatting configured with Git Husky pre-commit hooks.
- Vitest suites configured across packages (37 unit tests passing).

### Phase 1: Authentication & OS Keychain (100% Complete)

- Local OAuth 2.0 loopback server with state validation (CSRF protection) and automatic redirect.
- Secure storage of Client ID, Client Secret, and Refresh Token inside Windows Credential Manager
  via `@napi-rs/keyring`.
- Zero plaintext credentials stored on disk or in the database.
- Auto-refresh token lifecycle: Fastify server automatically refreshes expired access tokens without
  user interruption.
- Session endpoints: `GET /api/auth/me`, `POST /api/auth/configure`, `GET /api/auth/google/start`,
  `GET /api/auth/google/callback`, `POST /api/auth/logout`.

### Phase 2: High-Speed Sync Engine & Local Indexing (100% Complete)

- **Full Initial Sync:** Iterates entire Google Drive hierarchy with page-based batch upserts.
- **Incremental Changes Sync:** Uses Google Drive `changes.list` API with stored page tokens to
  synchronize delta updates in real-time.
- **Exponential Backoff:** `withBackoff` utility automatically handles HTTP 429 and 503 rate limits
  with jitter.
- **Trigram FTS5 Search:** Fast substring searching (e.g. searching "2694" instantly finds
  `IMG_2694.HEIC`).
- Live database contains **25,224 files** and **4,778 media items** indexed.

### Phase 3: Gallery Core & Month Grouping (100% Complete)

- Photos & videos strictly filtered using `MEDIA_STRICT_FILTER` (excludes PDFs, zips, code, and
  docs).
- Chronological ordering using EXIF `taken_at` timestamp with fallback to `modified_at`.
- Month timeline buckets (`GET /api/files/photos/months`) group photos by year and month (e.g.
  "September 2026", "August 2026").
- Dynamic filter bar: "All", "Photos", "Videos", "Favorites".
- OneDrive-style right-side timeline scrubber for jumps across years (2026 ... 2009).

### Phase 4: OneDrive Aesthetics & Smooth Zoom Controls (100% Complete)

- Obsidian dark theme (`bg-[#09090b]`, `border-white/10`, `text-white`).
- **Interactive Zoom Slider:** Smooth 4-stop grid sizing:
  - Extra Small (100px thumbnails)
  - Small (150px thumbnails)
  - Medium (220px thumbnails, default)
  - Large (320px thumbnails)
- Rounded photo card corners with smooth CSS transitions (`duration-300`).
- Floating top navigation pill with auto-hide behavior and smooth show/hide on top scroll.
- Completely collapsible sidebar (toggleable via menu button or automatically minimized in gallery
  view).

### Phase 5: High-Performance Lightbox & Media Player (100% Complete)

- **Instant Blur-Up Crossfade:** Renders cached 400px thumbnail with CSS `blur-sm` instantaneously
  while 1200px sharp image loads, eliminating blank white/grey screens.
- **Priority-Driven Loading Pipeline:**
  - Active high-res photo requests `fetchPriority="high"` and `decoding="async"`.
  - Bottom thumbnail strip palette requests `size=400` with `fetchPriority="low"` and
    `loading="lazy"`.
  - Because 400px thumbnails are already in browser memory from the gallery grid, the bottom palette
    consumes **0 new network connections**!
  - Adjacent photo prefetching (next 2 photos, previous photo) is deferred until the active photo
    has finished loading (`highResLoaded === true`), ensuring the clicked photo gets 100% available
    network bandwidth.
- **HEIC / HEIF Full Compatibility:**
  - Google Drive CDN automatically transcodes Apple HEIC photos (`.HEIC` / `image/heic`) to standard
    JPEG on the fly.
  - Server automatically intercepts expired `drive-storage` URLs (HTTP 403), requests a fresh signed
    thumbnail link via authenticated Google Drive API, updates SQLite, saves the valid JPEG buffer
    to disk cache (`data/thumbs/<id>_s<size>.jpg`), and streams standard JPEG to the browser.
- **Video Range Streaming:** HTTP 206 Partial Content support with `Accept-Ranges: bytes` allows
  instant video scrubbing and playback in HTML5 video elements.
- **EXIF Side Drawer:** Keyboard toggle (`I`) displays camera make, camera model, resolution (width
  × height), capture date, and file size.
- **Action Controls:** Favorite toggle (heart), Add to Album modal, 90° image rotation, full-size
  zoom, download, and external link to Google Drive.

### Phase 6: Albums & Favorites (100% Complete)

- **Albums View (`/albums`):**
  - OneDrive-style album cards with automatic cover image resolution (uses the latest photo in the
    album).
  - Photo count badge and last updated timestamp.
  - Create Album modal, Rename Album modal, Delete Album confirmation.
  - Detailed album view with grid, photo count, and "Add Photos" multi-select modal.
- **Favorites View (`/favorites`):**
  - Instant gallery of all starred photos and videos.
  - Direct unstar toggle updates SQLite and Google Drive.
  - Full zoom slider controls and Lightbox support.

### Phase 8: Zero-Knowledge Private Vault (100% Complete)

- **Client-Side Cryptography (`apps/web/src/lib/vault-crypto.ts`):**
  - Key derivation: PBKDF2 using SHA-256 with 100,000 iterations and a cryptographically random
    16-byte salt.
  - Encryption: AES-256-GCM with unique 12-byte initialization vectors (IV) per operation.
  - Passphrase is NEVER transmitted over the network and NEVER stored in SQLite.
- **Canary Password Verification:**
  - Upon setup, encrypts known canary text `"DRIVESHELL_VAULT_CANARY"`.
  - On unlock, attempts decryption of the canary. If authentication tag verification fails, rejects
    password without exposing file keys.
- **Auto-Lock Security:**
  - Configurable auto-lock timer (default: 5 minutes of inactivity).
  - Countdown timer displayed in the UI.
  - On lock, the in-memory `CryptoKey` is completely discarded, and object URLs are revoked from
    memory.
- **Vault File Management:**
  - Add to Vault: encrypts file metadata and registers in `vault_files`.
  - Remove from Vault: decrypts and restores file.
  - In-vault file preview with decrypt-on-demand.

### Phase 9: Instant Search & File Explorer (100% Complete)

- Global search bar with 250ms debounce and instant FTS5 trigram matching.
- Files View with breadcrumb folder navigation (`/root/Folder A/Subfolder B`).
- Non-media file listings with file size formatting, modification dates, and download triggers.

### Phase 10: Tauri v2 Desktop Wrapper (100% Complete)

- Native desktop shell structure configured under `src-tauri/`.
- Rust entry points `src-tauri/src/main.rs` and `lib.rs` configured with Tauri 2.0 plugins.
- Fastify server and Vite frontend communicate through standard local loopback
  `http://127.0.0.1:3000`.
- Scripts: `pnpm desktop:dev` and `pnpm desktop:build`.

---

## 5. Backend REST API Reference

All endpoints run on `http://127.0.0.1:3000`.

### Authentication & Setup

- `POST /api/auth/configure` — Set OAuth Client ID & Secret in native OS keychain.
- `GET /api/auth/google/start` — Initiate Google OAuth consent flow.
- `GET /api/auth/google/callback` — Exchange authorization code for tokens, record in keychain &
  SQLite.
- `GET /api/auth/me` — Return currently authenticated user profile and account ID.
- `POST /api/auth/logout` — Revoke access and purge tokens from keychain.

### Sync Engine

- `POST /api/sync/start` — Trigger full background sync of Google Drive.
- `POST /api/sync/changes` — Trigger incremental changes sync using stored page token.
- `GET /api/sync/status` — Get sync status (indexing state, total files, last sync time).

### Gallery & Files

- `GET /api/files/photos` — Paginated media listing with strict media filtering, date ordering, and
  optional filters (`type=photos|videos|favorites|all`, `month=YYYY-MM`, `year=YYYY`).
- `GET /api/files/photos/months` — Month bucket aggregation for timeline scrubber.
- `GET /api/files` — Paginated non-media file listing for file explorer.
- `GET /api/files/search` — FTS5 trigram search.
- `GET /api/files/breadcrumbs` — Recursive folder hierarchy breadcrumbs.
- `PATCH /api/files/:fileId` — Update metadata (star/favorite, rename, trash).

### Media Delivery & Proxy

- `GET /api/media/:fileId/thumb?size=400` — High-speed cached thumbnail proxy (validates image
  headers, auto-transcodes HEIC to JPEG, caches to disk).
- `GET /api/media/:fileId/stream` — HTTP 206 Partial Content range stream for video/audio.
- `GET /api/media/:fileId/download` — Direct download with `Content-Disposition`.

### Albums

- `GET /api/albums` — List all albums with cover photo and item counts.
- `POST /api/albums` — Create new album.
- `GET /api/albums/:albumId` — Get album details and member photos.
- `PATCH /api/albums/:albumId` — Rename album or update description/cover.
- `DELETE /api/albums/:albumId` — Delete album.
- `POST /api/albums/:albumId/items` — Add photos/videos to album.
- `DELETE /api/albums/:albumId/items` — Remove items from album.

### Private Vault

- `GET /api/vault/settings` — Get salt, IV, and canary ciphertext to initialize client decryption.
- `POST /api/vault/setup` — Initialize vault with salt, canary, and auto-lock timeout.
- `GET /api/vault/files` — List encrypted vault items.
- `POST /api/vault/files` — Add file to encrypted vault.
- `DELETE /api/vault/files/:fileId` — Remove file from vault.

---

## 6. How to Run the Software

### Prerequisites

- Node.js >= 22.0.0
- pnpm >= 9.0.0
- Google Cloud OAuth Credentials (Client ID & Client Secret) with Drive Read/Write scope.

### Development Mode (Web + Server)

Run both backend and frontend concurrently:

```bash
# In the root repository directory:
pnpm dev
```

- **Backend API:** `http://127.0.0.1:3000`
- **Frontend App:** `http://127.0.0.1:5173`

### Run Backend Only

```bash
pnpm --filter @driveshell/server dev
```

### Run Frontend Only

```bash
pnpm --filter @driveshell/web dev
```

### Run Tests & Verification

```bash
# Run all 37 unit test suites
pnpm test

# Run TypeScript typechecker across all packages
pnpm typecheck

# Build all packages for production
pnpm build
```

---

## 7. Future Roadmap & Android Architecture

- **Phase 7: Moments & "On This Day"**:
  - Semantic clustering of photos taken on this calendar date across past years.
  - Multi-account switching with fast account selector in the top bar.
- **Android Mobile App Roadmap**:
  - The DriveShell Fastify backend already adheres strictly to standard REST JSON APIs.
  - When porting to Android, the same API routes can power either:
    1. A React Native / Expo application sharing the `@driveshell/shared` package.
    2. A native Kotlin + Jetpack Compose app utilizing Android Room (SQLite) and Coil for image
       caching.
    3. Tauri Mobile v2 Android build directly targeting the existing web frontend.
