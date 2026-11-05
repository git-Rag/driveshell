# Stage 1: Baselines & Benchmark Scoreboard

**Date:** November 4, 2026  
**Auditor:** Performance & Application Security Engineering  
**Branch:** `hardening/pass-1`  
**Status:** Complete (Awaiting Gate 1 Approval)

---

## 1. Machine & Environment Specifications

All measurements in this audit were captured directly on the local development machine using
automated harnesses under clean conditions.

| Property                  | Value / Specification                                                                                   |
| :------------------------ | :------------------------------------------------------------------------------------------------------ |
| **Processor (CPU)**       | AMD Ryzen 7 7840HS with Radeon 780M Graphics (8 cores, 16 threads, 3.80 GHz base, up to 5.10 GHz boost) |
| **System Memory (RAM)**   | 16.0 GB (15.2 GB usable DDR5)                                                                           |
| **Operating System**      | Windows 11 Home, 64-bit (OS Build 26200.5670)                                                           |
| **Runtime Environment**   | Node.js `v24.13.0`                                                                                      |
| **Package Manager**       | `pnpm v11.1.2`                                                                                          |
| **Primary SQLite Engine** | `better-sqlite3 v11.5.0` with SQLite 3.46.1 amalgamation (WAL mode enabled)                             |

---

## 2. Full Baseline Scoreboard: Real (~25k) vs Synthetic (100k)

> [!NOTE] **Dataset Classification Hardening Note (Post-Fix Update)**: Baselines were taken
> **AFTER** applying the media classification and video restoration fixes:
>
> - `fix(gallery): exclude TS declaration files and code-folder content from media views`
>   (migration 006)
> - `fix(web): shared package resolution caused blank screen`
> - `fix(gallery): count videos without metadata except video/mp2t` (migration 007)
> - `feat(sync): backfill video metadata for existing rows`
>
> **Verified Dataset Counts**:
>
> - **Raw DB Indexed**: 25,315 files (25 files removed during upstream Drive changes sync from
>   initial 25,340).
> - **Code / Ancestor Files Hidden**: 18,565 files (`node_modules`: 18,280, `.git`: 278,
>   `__pycache__`: 7) marked `is_hidden = 1`.
> - **Clean Visible Gallery Media**: **6,470 items**
>   (`is_media = 1 AND is_hidden = 0 AND trashed = 0`):
>   - **Photos**: 5,725 (image/jpeg: 5,601, image/heic: 63, image/png: 35, image/webp: 17,
>     image/heif: 5, image/svg+xml: 4).
>   - **Videos**: 745 restored (video/mp4: 717, video/quicktime: 25, video/x-matroska: 3).
>   - **TypeScript / video/mp2t Leaking Items**: Exactly 0 (all 1,145 `.d.mts`/`.ts` files excluded
>     and hidden).

Datasets tested:

1. **Real Drive Backup (`data/bench/real-25k/driveshell.db`)**: 19.91 MB, 25,224 files (post-fix
   live DB: 25,315 files, 5,725 gallery media), real Google Drive directory hierarchy.
2. **Synthetic Dataset (`data/bench/synthetic-100k/driveshell.db`)**: 55.15 MB, 100,187 files, 20
   albums (4,592 items), realistic 80/10/10 media distribution, 5-year timeline with burst trips,
   multilingual filenames, path depths 1–6.

### 2.1 Database Query Latencies & Plans

Measured over 15 runs following 3 warmup executions (`scripts/bench/db-bench.ts`).

| Operation / Query Name                         | Real 25k (Median) | Real 25k (p95) | Synth 100k (Median) | Synth 100k (p95) |        Query Plan Flags         | Root Cause & Bottleneck                                                                                                                                            |
| :--------------------------------------------- | :---------------: | :------------: | :-----------------: | :--------------: | :-----------------------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Timeline Month Buckets**                     |     39.92 ms      |    48.90 ms    |    **613.98 ms**    |  **670.44 ms**   | `INDEX` + `⚠️ TEMP-B-TREE` (x2) | Computes dynamic `CASE WHEN taken_at...` on all media rows; forces temp B-tree for `GROUP BY` and second temp B-tree for `ORDER BY`.                               |
| **Timeline Page 1 (offset 0, limit 50)**       |     34.75 ms      |    43.58 ms    |    **507.39 ms**    |  **611.88 ms**   |   `INDEX` + `⚠️ TEMP-B-TREE`    | `ORDER BY CASE WHEN taken_at IS NOT NULL THEN taken_at ELSE modified_at END DESC` cannot utilize existing B-tree indexes, forcing in-memory sort of 80,000+ items. |
| **Timeline Deep Page (offset 5000, limit 50)** |     45.14 ms      |    51.78 ms    |    **521.88 ms**    |  **547.34 ms**   |   `INDEX` + `⚠️ TEMP-B-TREE`    | Full temp sort plus sequential offset scan.                                                                                                                        |
| **Starred Listing (limit 50)**                 |      4.60 ms      |    6.01 ms     |       0.69 ms       |     1.05 ms      |           `✅ INDEX`            | Covered by `idx_files_account_modified`.                                                                                                                           |
| **Files Non-Media (limit 50)**                 |      0.63 ms      |    1.03 ms     |       0.10 ms       |     0.18 ms      |           `✅ INDEX`            | Index scan on `idx_files_account_modified`.                                                                                                                        |
| **Files List (folder 50 children)**            |      0.15 ms      |    0.34 ms     |       0.24 ms       |     0.96 ms      |   `INDEX` + `⚠️ TEMP-B-TREE`    | `idx_files_parent` finds rows; sorts folders first via `CASE WHEN mime_type = '...folder' THEN 0 ELSE 1 END`.                                                      |
| **Files List (folder 2000 children)**          |      0.64 ms      |    0.81 ms     |       0.88 ms       |     0.97 ms      |   `INDEX` + `⚠️ TEMP-B-TREE`    | Same folder-first sort expression on 2,000 rows.                                                                                                                   |
| **Album Listing (with count and join)**        |      0.01 ms      |    0.01 ms     |       3.62 ms       |     5.84 ms      | `INDEX` + `⚠️ TEMP-B-TREE` (x2) | `LEFT JOIN album_items` with `GROUP BY a.id` and `ORDER BY a.modified_at DESC`.                                                                                    |
| **FTS5 Trigram (3 chars: `"img"`)**            |      4.57 ms      |    5.99 ms     |       7.24 ms       |     12.25 ms     |           `✅ INDEX`            | Trigram virtual table match (`files_fts`).                                                                                                                         |
| **FTS5 Trigram (6 chars: `"screen"`)**         |      1.68 ms      |    2.39 ms     |       0.06 ms       |     0.11 ms      |           `✅ INDEX`            | Highly selective trigram match.                                                                                                                                    |
| **FTS5 Trigram (no match)**                    |      0.04 ms      |    0.06 ms     |       0.07 ms       |     0.09 ms      |           `✅ INDEX`            | Instant early-exit from FTS5 index.                                                                                                                                |
| **Search LIKE Fallback 2-char (`"%me%"`)**     |      1.08 ms      |    1.64 ms     |       1.10 ms       |     1.74 ms      |           `✅ INDEX`            | Scans `idx_files_account_modified` with early LIMIT 50.                                                                                                            |
| **DB Connection Startup to 1st Query**         |     15.79 ms      |       —        |       6.11 ms       |        —         |               `—`               | Initialization + PRAGMA checks + WAL setup.                                                                                                                        |

---

### 2.2 EXPLAIN QUERY PLAN Breakdown

#### 1. Timeline Queries (`getPhotoMonths` & `listPhotos`)

```sql
EXPLAIN QUERY PLAN
SELECT * FROM files
WHERE account_id = '...' AND (mime_type LIKE 'image/%' OR ...) AND trashed = 0
ORDER BY CASE WHEN taken_at IS NOT NULL THEN taken_at ELSE modified_at END DESC, id ASC
LIMIT 50 OFFSET 0;
```

**Output:**

```
SEARCH files USING INDEX idx_files_account_modified (account_id=?)
USE TEMP B-TREE FOR ORDER BY
```

> [!CRITICAL] SQLite picks `idx_files_account_modified` because `account_id` matches, but because
> the `ORDER BY` clause sorts on a conditional expression
> (`CASE WHEN taken_at IS NOT NULL THEN taken_at ELSE modified_at END`), SQLite **must materialize
> and sort all 80,000+ matching media rows in a temporary B-tree**. This is the root cause of the
> 500ms+ latency on 100k rows.

#### 2. Folder Listing (`listByParent`)

```sql
EXPLAIN QUERY PLAN
SELECT * FROM files
WHERE account_id = '...' AND trashed = 0 AND parent_id = '...'
ORDER BY
  CASE WHEN mime_type = 'application/vnd.google-apps.folder' THEN 0 ELSE 1 END ASC,
  modified_at DESC
LIMIT 50 OFFSET 0;
```

**Output:**

```
SEARCH files USING INDEX idx_files_parent (account_id=? AND parent_id=?)
USE TEMP B-TREE FOR ORDER BY
```

#### 3. Album Listing (`listAlbums`)

```sql
EXPLAIN QUERY PLAN
SELECT a.*, COUNT(ai.file_id) AS item_count, MAX(ai.added_at) AS last_item_added_at
FROM albums a
LEFT JOIN album_items ai ON ai.album_id = a.id
WHERE a.account_id = '...'
GROUP BY a.id
ORDER BY a.modified_at DESC;
```

**Output:**

```
SEARCH a USING INDEX idx_albums_account (account_id=?)
SEARCH ai USING INDEX idx_album_items_album (album_id=?) LEFT-JOIN
USE TEMP B-TREE FOR GROUP BY
USE TEMP B-TREE FOR ORDER BY
```

---

## 3. Server Baselines (`scripts/bench/server-bench.ts`)

Fastify 5 server baseline executing against local SQLite in WAL mode:

| Metric                                 |            Measured Baseline             | Target Budget | Assessment                                                                                                                          |
| :------------------------------------- | :--------------------------------------: | :-----------: | :---------------------------------------------------------------------------------------------------------------------------------- |
| **Cold Start to `/health` Response**   |              **358.17 ms**               |   < 800 ms    | **PASS** (Well within budget)                                                                                                       |
| **Idle RSS Memory (after warmup)**     |              **226.64 MB**               |   < 200 MB    | **WARN (26.6 MB over budget)**. Caused by eager static module loading of full `googleapis` library (~50MB package) and route trees. |
| **Event Loop Delay (p50)**             |               **32.31 ms**               |    < 50 ms    | **PASS**                                                                                                                            |
| **Event Loop Delay (p99)**             |               **33.49 ms**               |    < 50 ms    | **PASS**                                                                                                                            |
| **Thumbnail Disk Cache Hit Latency**   | **3.12 ms (median)** / **3.83 ms (p95)** |    < 20 ms    | **PASS** (Local WebP cache read from disk)                                                                                          |
| **Server Throughput (Concurrency 6)**  |            **431.6 req/sec**             | > 250 req/sec | **PASS**                                                                                                                            |
| **Server Throughput (Concurrency 24)** |            **426.0 req/sec**             | > 250 req/sec | **PASS**                                                                                                                            |
| **Server Throughput (Concurrency 64)** |            **437.7 req/sec**             | > 250 req/sec | **PASS**                                                                                                                            |
| **Video Stream Range Request Latency** |               **0.124 ms**               |    < 10 ms    | **PASS** (RFC 7233 byte-range seek on 206 Partial Content)                                                                          |

---

## 4. Web Production Bundle Analysis (`scripts/bench/bundle-bench.ts`)

Compiled output from `apps/web/dist/assets/`:

| Asset File              | Uncompressed Size |   Gzip Size   | Notes                                                                                       |
| :---------------------- | :---------------: | :-----------: | :------------------------------------------------------------------------------------------ |
| `index-BXxT6ghi.js`     |   **357.77 KB**   | **98.67 KB**  | **Initial JS Bundle**. Well within 150 KB gzip budget.                                      |
| `index-CDy_75mB.css`    |   **36.92 KB**    |  **7.47 KB**  | Tailwind CSS output.                                                                        |
| `index-BXxT6ghi.js.map` |  **1,423.68 KB**  | **308.42 KB** | **Production source map leakage**. Generated because `sourcemap: true` in `vite.config.ts`. |
| **Total Build Output**  |  **1,818.36 KB**  | **414.57 KB** |                                                                                             |

### Architectural Findings in Web Bundle:

1. **Zero Code Splitting (Monolithic Chunk)**: All views (`SetupWizard`, `GalleryView`, `Lightbox`,
   `AlbumsView`, `VaultView`, `FilesView`, `SettingsView`) are statically imported in
   `apps/web/src/App.tsx`. A user opening DriveShell to view photos downloads the entire Vault
   AES-GCM engine, Setup Wizard, and Settings logic up front.
2. **Source Map in Release Build**: Shipping `1.42 MB` of unstripped JavaScript source maps exposes
   the entire raw TypeScript codebase and increases packaged application size.

---

## 5. Sync Engine Throughput (`scripts/bench/sync-bench.ts`)

Measured against mock Google Drive API endpoints simulating 100ms network pagination delays:

| Sync Mode             |    Volume    |  Elapsed Time   |       Throughput       | Peak RSS Memory | Event Loop Delay (p99) |
| :-------------------- | :----------: | :-------------: | :--------------------: | :-------------: | :--------------------: |
| **Initial Full Sync** | 25,000 files | **2,584.65 ms** | **9,672.5 files/sec**  |    118.66 MB    |       < 0.001 ms       |
| **Incremental Sync**  | 100 changes  |   **4.39 ms**   | **22,779.0 files/sec** |    112.25 MB    |       < 0.001 ms       |

> Note: Current sync performs synchronous batch transactions on the main Node event loop thread
> (`upsertBatch` in `apps/server/src/db/queries/files.ts:324`). While SQLite transactions complete
> in < 3 seconds for 25k rows, running larger transactions without yield can cause brief frame drops
> in the UI if Fastify is serving API requests concurrently.

---

## 6. Top 10 Hotspots Ranked by User-Visible Impact

|  Rank  | Hotspot / Issue                                      | Impact Area                        | Real Evidence (`file:line` & Metrics)                                                                                                 | User-Visible Effect                                                                                                                                                                                                                  |
| :----: | :--------------------------------------------------- | :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **Unindexed `ORDER BY CASE` in Media Queries**       | Database / Photos View             | `apps/server/src/db/queries/files.ts:409`, `431`<br>`median: 507.39 ms` at 100k, `⚠️ USE TEMP B-TREE`                                 | Opening or scrolling the gallery causes a noticeable half-second UI freeze while SQLite sorts 80k rows in memory.                                                                                                                    |
| **2**  | **Timeline Month Buckets Double Temp Sort**          | Database / Timeline Scrubber       | `apps/server/src/db/queries/files.ts:162`, `180`<br>`median: 613.98 ms` at 100k, `⚠️ TEMP-B-TREE` (x2)                                | Timeline scrubber headers take over 600ms to compute on initial load.                                                                                                                                                                |
| **3**  | **Offset-Based Pagination Degradation**              | Database / Gallery Infinite Scroll | `apps/server/src/db/queries/files.ts:413`<br>`LIMIT ? OFFSET ?`<br>`median: 521.88 ms` at offset 5000                                 | Scrolling deep into the photo library compounds memory and CPU usage on every scroll step. Needs keyset pagination (`WHERE sort_key < ? LIMIT 50`).                                                                                  |
| **4**  | **Unbounded Image Requests on Rapid Scroll**         | Client Network / Gallery           | `apps/web/src/features/gallery/Thumbnail.tsx:28`<br>`apps/web/src/features/gallery/Lightbox.tsx:68`                                   | As reported by user: clicking an image is blocked because all previous offscreen thumbnail requests saturate browser connection limits (HTTP/1.1 6 connections). Needs request cancellation (`AbortController`) and priority queues. |
| **5**  | **Production Source Map Leakage**                    | Bundle Size & Security             | `apps/web/vite.config.ts:38`<br>`sourcemap: true`<br>`index-BXxT6ghi.js.map: 1,423.68 KB`                                             | Bloats desktop package installer by 1.4 MB and exposes full client source code.                                                                                                                                                      |
| **6**  | **Monolithic Client Bundle (No Lazy Loading)**       | Frontend Startup                   | `apps/web/src/App.tsx:4-10`<br>Single chunk `index-BXxT6ghi.js: 357.77 KB`                                                            | Initial page load downloads the Vault cryptographic suite, setup wizard, and album editors even when user only wants the gallery.                                                                                                    |
| **7**  | **Server Idle RSS Exceeds Budget (226 MB)**          | Server Memory                      | `scripts/bench/server-bench.ts`<br>`Idle RSS: 226.64 MB` (Budget: < 200 MB)<br>`apps/server/package.json:28` (`googleapis: ^189.0.0`) | Fastify process idles with > 220 MB of RAM due to eager import of entire `googleapis` monolith (~50MB) and non-deferred route modules.                                                                                               |
| **8**  | **High-Risk Vulnerability in Production Dependency** | Security Audit                     | `apps/server/package.json:34`<br>`zod: ^3.23.8` (GHSA-mrhx-c7xc-m3w5)<br>`pnpm audit: 1 High`                                         | Constrained collection schemas are susceptible to denial of service through memory exhaustion.                                                                                                                                       |
| **9**  | **Folder Listing Temp B-Tree on Every Directory**    | Database / Files View              | `apps/server/src/db/queries/files.ts:509`<br>`ORDER BY CASE WHEN mime_type = ...folder THEN 0 ELSE 1 END`<br>`⚠️ TEMP-B-TREE`         | Listing any folder in the Files view forces an in-memory sort instead of relying on an index.                                                                                                                                        |
| **10** | **Synchronous Database Transactions on Main Thread** | Event Loop / Responsiveness        | `apps/server/src/db/queries/files.ts:324`<br>`db.transaction(...)` in `upsertBatch`                                                   | Bulk sync transactions hold the SQLite lock and block the Node.js event loop synchronously for up to 3 seconds during large batches.                                                                                                 |

---

## 7. Proposed Target Numbers for Stage 5

| Metric                                  |    Stage 1 Baseline (Current)    |      Stage 5 Target      | Expected Mechanism                                                                                            |
| :-------------------------------------- | :------------------------------: | :----------------------: | :------------------------------------------------------------------------------------------------------------ |
| **Timeline Page 1 Query (100k rows)**   |            507.39 ms             |      **< 15.0 ms**       | Add generated sort column / composite index `(account_id, sort_key DESC)` eliminating the temporary B-tree.   |
| **Timeline Month Buckets (100k rows)**  |            613.98 ms             |      **< 25.0 ms**       | Index-backed aggregate or cached summary table.                                                               |
| **Timeline Deep Page (offset 5000)**    |            521.88 ms             |      **< 15.0 ms**       | Keyset pagination `WHERE (sort_key, id) < (?, ?) LIMIT 50`.                                                   |
| **Server Idle RSS Memory**              |            226.64 MB             |      **< 160.0 MB**      | Tree-shake / replace monolithic `googleapis` with targeted `@googleapis/drive` and defer heavy route imports. |
| **Web Production Bundle (raw)**         |           1,818.36 KB            |      **< 500.0 KB**      | Strip production source maps and implement route-level code splitting (`React.lazy`).                         |
| **Initial JS Payload (gzip)**           |             98.67 KB             |      **< 75.0 KB**       | Code-split Vault and Settings out of initial entry chunk.                                                     |
| **Active Lightbox Image Load Priority** | Blocked behind queued thumbnails | **Immediate (< 150 ms)** | Priority image queue + `AbortController` cancellation for offscreen thumbnails.                               |
| **`pnpm audit` High Severity Flaws**    |          1 High (`zod`)          | **0 High / 0 Critical**  | Upgrade `zod` to `>= 3.24.0` / `>= 3.24.2`.                                                                   |

---

## 8. Gate 1 Stop

Stage 1 is complete. All benchmarks are committed in `scripts/bench/` and `scripts/seed.ts`.  
Awaiting user review and approval before proceeding to **Stage 2 (Security Hardening: Server, Auth &
Network)**.
