# Stage 0: Reconnaissance & Map of Reality

**Date:** November 4, 2026  
**Auditor:** Performance & Application Security Engineering  
**Branch / Commit:** `main` (`9a33609`)  
**Scope:** Full repository (`apps/server`, `apps/web`, `packages/shared`, `src-tauri`)

---

## 1. Clean State Verification & Tooling Execution Baseline

All four core commands were executed in clean state to establish real execution time and stability
baselines:

| Command                  |  Status  | Duration | Real Output / Diagnostics                                                                                                                                                                                                                                                               |
| :----------------------- | :------: | :------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`         | **PASS** |  5.49 s  | Zero errors across `@driveshell/server`, `@driveshell/web`, `@driveshell/shared`.                                                                                                                                                                                                       |
| `pnpm lint` (`eslint .`) | **FAIL** | 23.08 s  | **Fatal crash:** `FATAL ERROR: Committing semi space failed. Allocation failed - JavaScript heap out of memory`. ESLint config ignores are placed at the end without a top-level ignore, causing ESLint to crawl the SQLite directory (`apps/server/data/`) and exhaust V8 heap memory. |
| `npx eslint <src-dirs>`  | **PASS** | 34.27 s  | Targeted execution on `apps/server/src apps/web/src packages/shared/src` succeeds with zero errors and zero warnings.                                                                                                                                                                   |
| `pnpm test`              | **PASS** | 10.75 s  | **37 tests passed across 6 suites** (`vitest`): sync backoff, auth, albums, vault crypto, gallery queries, and scaffold.                                                                                                                                                                |
| `pnpm build`             | **PASS** | 14.84 s  | Vite production client bundle + Fastify TypeScript build compiled cleanly.                                                                                                                                                                                                              |

---

## 2. Codebase & Route Map

### 2.1 Packages & Entry Points

- **`apps/server`** (`@driveshell/server`): Entry point
  [`apps/server/src/index.ts`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/index.ts).
  Starts Fastify on `127.0.0.1`, opens SQLite database with WAL mode, schedules sync, and registers
  routes.
- **`apps/web`** (`@driveshell/web`): Entry point
  [`apps/web/src/main.tsx`](file:///d:/Workspace/GithubRepos/DriveShell/apps/web/src/main.tsx).
  React 19 SPA running with Vite 6.
- **`packages/shared`** (`@driveshell/shared`): TypeScript types, DTO interfaces, and shared
  constants.
- **`src-tauri`**: Desktop shell wrapper written in Rust
  ([`src-tauri/src/main.rs`](file:///d:/Workspace/GithubRepos/DriveShell/src-tauri/src/main.rs),
  [`lib.rs`](file:///d:/Workspace/GithubRepos/DriveShell/src-tauri/src/lib.rs)).

### 2.2 Fastify Route Audit

All routes require the `ds_session` cookie unless noted otherwise.

| Method   | Path                            | Auth / Session |                     Schema Validation                     | Resources Touched                                                                               |
| :------- | :------------------------------ | :------------: | :-------------------------------------------------------: | :---------------------------------------------------------------------------------------------- |
| `POST`   | `/api/setup/credentials`        |    Required    |                 Zod (`CredentialsSchema`)                 | Writes Client ID & Secret to native OS Keychain.                                                |
| `GET`    | `/api/setup/status`             |    Required    |                           None                            | Reads Keychain status & `accounts` table in SQLite.                                             |
| `GET`    | `/api/auth/start`               |    Required    |                      Query (`scope`)                      | PKCE generation, in-memory state store, Google OAuth URL.                                       |
| `GET`    | `/auth/callback`                |   **Exempt**   |                  Query (`code`, `state`)                  | Google token exchange, calls `about.get`, upserts `accounts` table, issues `ds_session` cookie. |
| `GET`    | `/api/auth/me`                  |    Required    |                    Query (`accountId`)                    | Reads user profile from `accounts` table.                                                       |
| `POST`   | `/api/auth/logout`              |    Required    |                    Body (`accountId`)                     | Revokes token via Google API, purges Keychain, deletes account from SQLite.                     |
| `POST`   | `/api/sync/start`               |    Required    |                Body (`accountId`, `force`)                | Triggers full background Drive sync job.                                                        |
| `POST`   | `/api/sync/changes`             |    Required    |                    Body (`accountId`)                     | Triggers incremental Drive sync via `changes.list`.                                             |
| `GET`    | `/api/sync/status`              |    Required    |                    Query (`accountId`)                    | Reads in-memory scheduler state & indexed count.                                                |
| `GET`    | `/api/files`                    |    Required    |              Query (`offset`, `limit`, etc.)              | Reads non-media rows from `files` table.                                                        |
| `GET`    | `/api/files/photos`             |    Required    |    Query (`offset`, `limit`, `type`, `month`, `year`)     | Reads media rows from `files` table ordered by `taken_at`.                                      |
| `GET`    | `/api/files/photos/months`      |    Required    |                    Query (`accountId`)                    | SQL aggregate grouping photos into timeline buckets.                                            |
| `GET`    | `/api/files/search`             |    Required    |             Query (`q`, `limit`) **(No Zod)**             | FTS5 trigram match on `files_fts` / `LIKE` fallback.                                            |
| `GET`    | `/api/files/breadcrumbs`        |    Required    |                    Query (`folderId`)                     | Recursive parent traversal in `files` table.                                                    |
| `GET`    | `/api/files/:fileId`            |    Required    |                     Params (`fileId`)                     | Single file lookup in `files` table.                                                            |
| `PATCH`  | `/api/files/:fileId`            |    Required    |                 Zod (`UpdateFileSchema`)                  | Updates `starred`, `trashed`, or `name` in `files`.                                             |
| `POST`   | `/api/files/folders`            |    Required    |                Zod (`CreateFolderSchema`)                 | Calls Google Drive API to create remote folder.                                                 |
| `GET`    | `/api/media/:fileId/thumb`      |    Required    |                      Query (`size`)                       | Reads disk cache `thumbs/` or fetches remote Drive thumbnail.                                   |
| `GET`    | `/api/media/:fileId/stream`     |    Required    |                     Headers (`Range`)                     | Streams raw file from Drive API with HTTP 206 support.                                          |
| `GET`    | `/api/media/:fileId/download`   |    Required    |                     Params (`fileId`)                     | Direct attachment download from Drive API.                                                      |
| `GET`    | `/api/albums`                   |    Required    |                    Query (`accountId`)                    | Reads `albums` join `album_items` in SQLite.                                                    |
| `POST`   | `/api/albums`                   |    Required    |  Body (`title`, `description`, `coverFileId`, `fileIds`)  | Inserts into `albums` and `album_items`.                                                        |
| `GET`    | `/api/albums/:albumId`          |    Required    |                    Params (`albumId`)                     | Reads album and member photos.                                                                  |
| `PATCH`  | `/api/albums/:albumId`          |    Required    |       Body (`title`, `description`, `coverFileId`)        | Updates album record.                                                                           |
| `DELETE` | `/api/albums/:albumId`          |    Required    |                    Params (`albumId`)                     | Deletes album and cascaded items.                                                               |
| `POST`   | `/api/albums/:albumId/items`    |    Required    |                     Body (`fileIds`)                      | Inserts join rows into `album_items`.                                                           |
| `DELETE` | `/api/albums/:albumId/items`    |    Required    |                     Body (`fileIds`)                      | Deletes join rows from `album_items`.                                                           |
| `GET`    | `/api/vault/status`             |    Required    |                    Query (`accountId`)                    | Reads `vault_settings` (salt, canary ciphertext, IV).                                           |
| `POST`   | `/api/vault/setup`              |    Required    |       Body (`salt`, `canaryCiphertext`, `canaryIv`)       | Inserts or updates `vault_settings`.                                                            |
| `GET`    | `/api/vault/files`              |    Required    |                    Query (`accountId`)                    | Reads `vault_files` metadata (names, sizes, IVs).                                               |
| `POST`   | `/api/vault/files`              |    Required    | Body (`encryptedPayloadBase64`, `iv`, `name`, `mimeType`) | Inserts encrypted BLOB into `vault_files`.                                                      |
| `GET`    | `/api/vault/files/:fileId/data` |    Required    |                     Params (`fileId`)                     | Reads encrypted BLOB from `vault_files` as Base64 JSON.                                         |
| `DELETE` | `/api/vault/files/:fileId`      |    Required    |                     Params (`fileId`)                     | Deletes entry from `vault_files`.                                                               |
| `POST`   | `/api/vault/reset`              |    Required    |                    Query (`accountId`)                    | Deletes all records from `vault_settings` and `vault_files`.                                    |

---

## 3. Database Architecture & Migrations

- **Database File:** `apps/server/data/driveshell.db` (SQLite 3,
  `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`).
- **Migrations Table:** `schema_migrations` (tracks applied version numbers 1 through 4).

### Tables:

1. `accounts`:
   `(id TEXT PRIMARY KEY, email TEXT, display_name TEXT, avatar_url TEXT, access_token TEXT, refresh_token TEXT, token_expires_at INTEGER, sync_token TEXT, full_sync_page_token TEXT, full_sync_stage TEXT, sync_status TEXT, last_sync_at INTEGER, created_at INTEGER, updated_at INTEGER)`
2. `files`:
   `(account_id TEXT, id TEXT, name TEXT, mime_type TEXT, parent_id TEXT, size_bytes INTEGER, modified_at INTEGER, created_at_ms INTEGER, starred INTEGER, trashed INTEGER, thumbnail_url TEXT, web_view_link TEXT, image_width INTEGER, image_height INTEGER, taken_at INTEGER, camera_make TEXT, camera_model TEXT, PRIMARY KEY(account_id, id))`
3. `files_fts`: Virtual FTS5 table created with `trigram` tokenizer indexing `name`. Maintained via
   INSERT/UPDATE/DELETE triggers on `files`.
4. `albums`:
   `(id TEXT PRIMARY KEY, account_id TEXT, title TEXT, description TEXT, cover_file_id TEXT, created_at INTEGER, updated_at INTEGER)`
5. `album_items`: `(album_id TEXT, file_id TEXT, added_at INTEGER, PRIMARY KEY(album_id, file_id))`
6. `vault_settings`:
   `(account_id TEXT PRIMARY KEY, salt TEXT, canary_ciphertext TEXT, canary_iv TEXT, created_at INTEGER, updated_at INTEGER)`
7. `vault_files`:
   `(id TEXT PRIMARY KEY, account_id TEXT, name TEXT, mime_type TEXT, size_bytes INTEGER, encrypted_payload BLOB, iv TEXT, created_at INTEGER)`

---

## 4. System Critical Operations Inventory

- **Native OS Keychain Touchpoints:**
  - File:
    [`apps/server/src/auth/keychain.ts`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/auth/keychain.ts)
  - Implementation: `@napi-rs/keyring` (Windows Credential Manager / macOS Keychain / Linux Secret
    Service).
  - Keys stored: `ds:client_id`, `ds:client_secret`, `ds:token:<account_id>`.
  - Fallback: in-memory `Map` with logged warning if keyring fails. (No encrypted-file fallback
    implemented).
- **Filesystem (`fs` / `node:fs`):**
  - Database:
    [`apps/server/src/db/connection.ts`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/db/connection.ts)
    writes `data/driveshell.db`, `-wal`, `-shm`.
  - Disk Cache:
    [`apps/server/src/routes/media.ts`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/routes/media.ts)
    writes `data/thumbs/<fileId>_s<size>.jpg`.
- **Outbound Network Touchpoints:**
  - File:
    [`apps/server/src/routes/media.ts`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/routes/media.ts)
    line 131 calls global `fetch(driveThumbUrl)` with **no host allowlist, no redirect limits, and
    no timeout**.
  - File:
    [`apps/server/src/sync/drive-api.ts`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/sync/drive-api.ts)
    calls `googleapis.drive('v3')`.
  - File:
    [`apps/server/src/sync/oauth-client.ts`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/sync/oauth-client.ts)
    calls Google OAuth token endpoints via `google-auth-library`.
- **Subprocesses & Dynamic Code:**
  - `child_process`: **None** in application runtime.
  - `eval()` / `new Function()`: **None** in application runtime.
- **Cryptographic Primitives:**
  - Backend: `crypto.randomBytes(16)` (session token), `crypto.timingSafeEqual` (session
    validation), `randomUUID()` for albums/vault IDs.
  - Frontend:
    [`apps/web/src/lib/vault-crypto.ts`](file:///d:/Workspace/GithubRepos/DriveShell/apps/web/src/lib/vault-crypto.ts)
    uses `crypto.subtle` for PBKDF2 (`SHA-256`, 100k rounds) and AES-256-GCM
    (`crypto.subtle.encrypt` / `decrypt`).

---

## 5. Trust Boundary Diagram

```mermaid
graph TD
    subgraph Browser ["Web Frontend Context (Port 5173 / Tauri WebView2)"]
        UI["React 19 UI Components"]
        VCrypto["Web Crypto SubtleCrypto (PBKDF2 100k, AES-GCM)"]
        UI <--> VCrypto
    end

    subgraph ServerBoundary ["Local Fastify Server (Port 3001 Loopback)"]
        SessionGuard["Session & DNS Rebinding Guard (ds_session cookie)"]
        RouteHandlers["Fastify REST Endpoints"]
        SessionGuard --> RouteHandlers
    end

    subgraph LocalStorage ["Local Machine OS & Storage"]
        Keyring["OS Keychain (Windows Credential Manager)"]
        DB[("SQLite 3 driveshell.db (WAL Mode)")]
        ThumbCache[("Disk Cache data/thumbs/*.jpg")]
    end

    subgraph External ["External Untrusted / Google Cloud Boundary"]
        GoogleOAuth["Google OAuth 2.0 (accounts.google.com)"]
        DriveAPI["Google Drive API v3 (googleapis.com)"]
        GoogleCDN["Google Thumbnail CDN (lh3.googleusercontent.com)"]
    end

    UI -->|HTTP / REST (Same-Origin)| SessionGuard
    RouteHandlers <-->|Native Keyring| Keyring
    RouteHandlers <-->|Sync Queries / Transactions| DB
    RouteHandlers <-->|Read / Write Cached JPEGs| ThumbCache
    RouteHandlers -->|Unconstrained fetch (SSRF Risk)| GoogleCDN
    RouteHandlers -->|Token Exchange & Refresh| GoogleOAuth
    RouteHandlers -->|Metadata & Media Stream| DriveAPI

    classDef untrusted fill:#ff9999,stroke:#ff0000,stroke-width:2px;
    class GoogleCDN,DriveAPI,GoogleOAuth untrusted;
```

### Untrusted Data Entry Points:

1. **Google Drive Metadata (`drive.files.list`, `changes.list`):** File names, mime types, and
   `thumbnailLink`s originate from Google Drive and external collaborators.
2. **Drive Media Streams (`drive.files.get`):** Binary content streamed directly from remote files.
3. **HTTP Query Strings & Request Bodies:** FTS search string `q` is unconstrained by Zod.
4. **Outbound Thumbnail Fetch (`media.ts`):** Fetches URLs stored in SQLite without checking
   hostnames against an allowlist.

---

## 6. Dependency & Native Modules Inventory

### 6.1 Native Binary Addons (`.node` files)

1. **`@napi-rs/keyring`** (`2.1.2`): Native N-API wrapper for Windows Credential Manager, macOS
   Keychain, and Linux `libsecret`. **Cannot run on Android** without replacement by Android
   Keystore.
2. **`better-sqlite3`** (`13.0.3`): C++ SQLite 3 addon using `node-gyp`. Synchronous I/O on the main
   Node event loop. **Cannot run on Android** without native Android platform SQLite / Room.

### 6.2 Supply Chain Audit (`pnpm audit --prod`)

- **Found 1 High Severity Vulnerability:**
  - Package: `zod` (`<4.6.6`, currently installed: `3.23.8`).
  - Advisory: [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) — "Zod can
    exhaust memory while validating oversized constrained collections".

---

## 7. Resolution of Suspicions S1–S14

| #       | Suspicion                                                                                                              |                   Status                    | Citation                                                                                                                                                                                                                                                                       | Evidence / Code Finding                                                                                                                                                                                                                                                                                                                                   |
| ------- | ---------------------------------------------------------------------------------------------------------------------- | :-----------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1**  | Vault uses **PBKDF2 with 100k rounds** instead of **Argon2id**. Canary allows trivial offline GPU guessing.            |                **CONFIRMED**                | [`apps/web/src/lib/vault-crypto.ts:12-75`](file:///d:/Workspace/GithubRepos/DriveShell/apps/web/src/lib/vault-crypto.ts#L12-L75)                                                                                                                                               | `const PBKDF2_ITERATIONS = 100_000;`<br>`name: 'PBKDF2', hash: 'SHA-256'`. Canary plaintext is static `'driveshell-vault-verified'`. An attacker with `driveshell.db` can perform high-speed offline GPU cracking against the canary ciphertext.                                                                                                          |
| **S2**  | Plan Phase 8 was a **crypto design review (no code)** before implementation. Code exists without review.               |                **CONFIRMED**                | [`docs/security.md:50-52`](file:///d:/Workspace/GithubRepos/DriveShell/docs/security.md#L50-L52)<br>vs [`apps/web/src/lib/vault-crypto.ts`](file:///d:/Workspace/GithubRepos/DriveShell/apps/web/src/lib/vault-crypto.ts)                                                      | `docs/security.md` states: `> ⚠️ No vault code is written until this section is reviewed and approved.` Yet unreviewed PBKDF2-GCM code was implemented and shipped in `vault-crypto.ts` and `VaultView.tsx`.                                                                                                                                              |
| **S3**  | Vault format is whole-file AES-GCM rather than chunked streaming AEAD; lacks MK layer, recovery key, and version byte. |                **CONFIRMED**                | [`apps/web/src/lib/vault-crypto.ts:80-95`](file:///d:/Workspace/GithubRepos/DriveShell/apps/web/src/lib/vault-crypto.ts#L80-L95)<br>and [`apps/server/migrations/004_vault.sql:9-19`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/migrations/004_vault.sql#L9-L19) | `crypto.subtle.encrypt` is called on the entire `ArrayBuffer`. Memory breaks on multi-GB files. No chunking, no seeking, no version byte, no master key layer (passphrase directly derives file key), and no recovery phrase. In SQLite, original file `name` and `mime_type` are stored in plaintext!                                                    |
| **S4**  | Accounts store "Google Sub IDs" instead of Drive `permissionId` from `about.get` (violates least privilege).           |                 **REFUTED**                 | [`apps/server/src/routes/auth.ts:62-68, 240-248`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/routes/auth.ts#L62-L68)                                                                                                                                          | Scopes requested are strictly `drive.readonly` and `drive.metadata.readonly` (no `openid` or `profile`). Account identity is fetched via `drive.about.get` using `user.permissionId`. Status report incorrectly called it "Google Sub ID".                                                                                                                |
| **S5**  | Media proxy fetches DB URLs (`thumbnail_url`) without host allowlist, redirect bounds, or HTTPS enforcement (SSRF).    |                **CONFIRMED**                | [`apps/server/src/routes/media.ts:131`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/routes/media.ts#L131)                                                                                                                                                      | `const response = await fetch(driveThumbUrl);` fetches arbitrary URLs stored in SQLite without checking if the hostname belongs to Google (`*.googleusercontent.com`). An attacker modifying SQLite or injecting Drive metadata can trigger internal network HTTP calls.                                                                                  |
| **S6**  | Vault thumbnails/previews leak to plaintext disk cache, temp files, or browser cache.                                  |           **PARTIALLY CONFIRMED**           | [`apps/server/src/routes/vault.ts:88-153`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/routes/vault.ts#L88-L153)                                                                                                                                               | Vault files do **not** touch `data/thumbs/` disk cache. However: (a) Vault endpoints (`/api/vault/files`) lack `Cache-Control: no-store`; (b) Original filenames, mime types, and file sizes are stored in **plaintext** in `vault_files` table in SQLite; (c) Decrypted files are converted to `blob:` URLs in memory without revocation on window blur. |
| **S7**  | Fixed ports break when occupied; hardcoded ports in Vite proxy and Tauri break installers.                             |                **CONFIRMED**                | [`apps/web/vite.config.ts:22`](file:///d:/Workspace/GithubRepos/DriveShell/apps/web/vite.config.ts#L22)<br>and [`apps/server/src/index.ts:17`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/index.ts#L17)                                                       | Backend has `findAvailablePort(3001)`. If port 3001 is busy and server moves to 3002, Vite dev proxy (`target: 'http://127.0.0.1:3001'`) fails with 502 Bad Gateway. In Tauri production bundle, `api.ts` makes relative requests (`/api/...`) which fail entirely because no Vite proxy exists in release.                                               |
| **S8**  | Starvation on browser connection limit; missing server-side priority queue & client-side request cancellation.         |                **CONFIRMED**                | [`apps/server/src/routes/media.ts:76`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/routes/media.ts#L76)<br>and [`apps/web/src/features/gallery/GalleryView.tsx`](file:///d:/Workspace/GithubRepos/DriveShell/apps/web/src/features/gallery/GalleryView.tsx)    | Server processes all `/api/media/:fileId/thumb` requests immediately in parallel with zero queuing or coalescing. Gallery grid has no `AbortController` cancellation when tiles scroll out of view.                                                                                                                                                       |
| **S9**  | FTS5 MATCH input unsanitized / unquoted; syntax errors become 500s.                                                    | **PARTIALLY REFUTED / PARTIALLY CONFIRMED** | [`apps/server/src/db/queries/files.ts:356`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/db/queries/files.ts#L356)<br>and [`apps/server/src/routes/files.ts:46-50, 180`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/routes/files.ts#L46-L50)   | Input is quoted as a literal phrase (`"${query.replace(/"/g, '""')}"`), which prevents FTS operators (`AND`, `OR`, `*`, `NEAR`). **However**, `GET /api/files/search` has **no Zod schema** and no length cap, allowing unbounded strings and control chars to reach SQLite.                                                                              |
| **S10** | Tauri config has loose CSP (`unsafe-inline`, `unsafe-eval`), missing sidecar launch code, missing updater keys.        |                **CONFIRMED**                | [`src-tauri/tauri.conf.json:27`](file:///d:/Workspace/GithubRepos/DriveShell/src-tauri/tauri.conf.json#L27)<br>and [`src-tauri/src/lib.rs:14-24`](file:///d:/Workspace/GithubRepos/DriveShell/src-tauri/src/lib.rs#L14-L24)                                                    | CSP contains `'unsafe-inline' 'unsafe-eval'`. Default capabilities grant `shell:default`. `lib.rs` comments claim it spawns the Node server, but the actual Rust code in `lib.rs` contains no process spawning or sidecar management at all!                                                                                                              |
| **S11** | Dev vs prod origin allow-lists: dev loopback regex active in production; GET routes skip Origin checks.                |                **CONFIRMED**                | [`apps/server/src/auth/session.ts:39-40, 70-78`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/auth/session.ts#L39-L40)<br>and [`apps/server/src/index.ts:52`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/index.ts#L52)                         | `LOOPBACK_ORIGIN_REGEX = /^https?:\/\/(127\.0\.0\.1                                                                                                                                                                                                                                                                                                       | localhost)(:\d+)?$/`allows any local port in CORS with credentials. Origin validation is only performed on`POST/PUT/PATCH/DELETE`—sensitive `GET` routes (`/api/vault/files`, `/api/files/photos`) perform zero Origin verification. No environment gating between dev and prod. |
| **S12** | `better-sqlite3` is synchronous; batch sync transactions block the Fastify event loop.                                 |                **CONFIRMED**                | [`apps/server/src/sync/full-sync.ts:86`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/sync/full-sync.ts#L86)<br>and [`apps/server/src/db/queries/files.ts:320-335`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/db/queries/files.ts#L320-L335)  | `fileQ.upsertBatch(rows)` executes a synchronous SQLite transaction on the main Node event loop inserting hundreds of rows per page, stalling HTTP request processing during active sync.                                                                                                                                                                 |
| **S13** | Secrets or personal data committed in git history.                                                                     |      **REFUTED / PARTIALLY CONFIRMED**      | `git log --all --full-history`                                                                                                                                                                                                                                                 | No Google client secrets or tokens were found committed in git history. Database and tokens are ignored in `.gitignore`. The user's git author email (`actualrag@gmail.com`) appears in commit metadata and `DRIVESHELL_CURRENT_STATE.md`.                                                                                                                |
| **S14** | Download/export routes serving Drive content inline without `nosniff` or `attachment` (Stored XSS).                    |                **CONFIRMED**                | [`apps/server/src/routes/media.ts:282`](file:///d:/Workspace/GithubRepos/DriveShell/apps/server/src/routes/media.ts#L282)                                                                                                                                                      | `GET /api/media/:fileId/stream` reflects `reply.header('Content-Type', file.mime_type)` with **no** `Content-Disposition: attachment`. If an attacker-shared file is `text/html` or `image/svg+xml`, opening the stream link executes arbitrary JavaScript under `http://127.0.0.1:3001`.                                                                 |

---

## 8. Discrepancy Analysis (Code vs. Approved Design)

1. **Vault Cryptography & Architecture:**
   - _Design (`docs/security.md`):_ Argon2id (`m=65536, t=3, p=4`), Master Key wrapping layer,
     recovery phrase (256-bit entropy), streaming 1 MiB chunked AEAD with authenticated headers and
     chunk nonces.
   - _Implemented Code:_ PBKDF2 with 100k rounds, no master key layer, static canary string
     (`"driveshell-vault-verified"`), whole-file AES-GCM via Web Crypto SubtleCrypto.
2. **Metadata Leakage in Vault:**
   - _Design:_ Filenames and file sizes encrypted in an opaque metadata block.
   - _Implemented Code:_ `vault_files` table stores plaintext `name`, `mime_type`, and `size_bytes`.
3. **Desktop Sidecar & Packaging:**
   - _Design:_ Fastify server packaged as a sidecar binary, spawned with random port and token
     delivered via stdin/env.
   - _Implemented Code:_ `src-tauri/src/lib.rs` does not spawn any sidecar; relies on a developer
     manually running `pnpm dev`.

---

## 9. Secret & Sensitive Data Scan Report

- **Scanned:** Full commit history (all branches, commits, stashes, and tree paths).
- **Findings (Locations Only):**
  - Commit author email in git log: `actualrag@gmail.com`.
  - Files containing author email: `DRIVESHELL_CURRENT_STATE.md:5`, `src-tauri/Cargo.toml:5`.
  - Tokens / Private Keys: **0 real credentials committed.** OS keychain and `.gitignore`
    successfully prevented leakage.
  - Test files: strictly use `user@example.com` and synthetic mock tokens.

---

## 10. Top 10 Security & Stability Risks (Ranked)

1. **[Critical] Vault Cryptographic Design (Weak KDF & Whole-File AEAD):** PBKDF2 100k rounds with a
   static canary allows offline GPU dictionary attacks. Whole-file encryption crashes browser memory
   on large files and prevents video seeking.
2. **[Critical] Stored XSS via Media Stream Endpoint (`SEC-002`):** `GET /api/media/:fileId/stream`
   serves untrusted Drive files with their raw MIME type (`text/html`, `image/svg+xml`) inline
   without `Content-Disposition: attachment`.
3. **[High] Server-Side Request Forgery (SSRF) in Thumbnail Proxy (`SEC-003`):**
   `GET /api/media/:fileId/thumb` fetches `thumbnail_url` from SQLite via global `fetch()` without a
   hostname allowlist or protocol validation.
4. **[High] Plaintext Metadata Leakage in Vault (`SEC-004`):** Vault file names, MIME types, and
   sizes are stored in plaintext in SQLite `vault_files`.
5. **[High] Missing `Cache-Control: no-store` on Vault Endpoints (`SEC-005`):** Sensitive ciphertext
   payloads and metadata returned from `/api/vault/*` can be cached by browser HTTP cache.
6. **[High] Permissive CORS & Missing Origin Checks on Sensitive GET Routes (`SEC-006`):** Any local
   application running on loopback can issue authenticated GET requests to `/api/vault/files` and
   `/api/files/photos` because Origin checks only guard mutating methods.
7. **[High] Insecure Tauri Configuration (`SEC-007`):** `tauri.conf.json` allows `'unsafe-inline'`
   and `'unsafe-eval'` in its CSP, and grants default shell capabilities without an updater public
   key.
8. **[Medium] Event Loop Blocking via Synchronous Database Transactions (`PERF-001`):**
   `better-sqlite3` runs synchronous multi-row `upsertBatch` transactions on the main event loop
   during sync, freezing API responses.
9. **[Medium] Out-Of-Memory Crash in Linting Tooling (`PERF-002`):** `pnpm lint` crawls
   `apps/server/data/` and exhausts V8 heap memory (exit code 134).
10. **[Medium] Fragile Port Discovery & Broken Production Packaging (`PORT-001`):** Hardcoded port
    3001 in Vite proxy breaks on port conflict; Tauri release binary has no sidecar launch logic.
