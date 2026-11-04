# Sunflower Drive — Performance & Optimization Scoreboard (Stage 5)

> **Optimization Audit Report**: Stage 5 Benchmarks & Measurements  
> **Status**: COMPLETED  
> **Date**: November 4, 2026  
> **Branch**: `hardening/pass-1`  
> **Harness**: `scripts/bench/run-all.ts` across 25k real & 100k synthetic datasets

---

## 1. Executive Summary & Budgets Scoreboard

All core performance targets met or exceeded their performance budgets:

| Target Metric                      |          Budget           |   Baseline (Stage 1)    |      Optimized (Stage 5)      |               Status               |
| :--------------------------------- | :-----------------------: | :---------------------: | :---------------------------: | :--------------------------------: |
| **Server Cold Start** to `/health` |    $< 800 \text{ ms}$     |   $792.8 \text{ ms}$    |    **$745.1 \text{ ms}$**     |       **PASS (Met budget)**        |
| **Thumbnail Cache Hit** (median)   |     $< 20 \text{ ms}$     |    $4.21 \text{ ms}$    |     **$3.85 \text{ ms}$**     | **PASS (5.2x faster than budget)** |
| **Peak Server Throughput**         | $> 5\,000 \text{ req/s}$  | $10\,840 \text{ req/s}$ | **$11\,439.5 \text{ req/s}$** |      **PASS (+599.5 req/s)**       |
| **Sync Event-Loop Delay** (p99)    |     $< 50 \text{ ms}$     |   $0.002 \text{ ms}$    |    **$0.001 \text{ ms}$**     |   **PASS (Near-zero blocking)**    |
| **Initial Web Bundle** (gzip JS)   |    $< 150 \text{ kB}$     |   $98.69 \text{ kB}$    |    **$98.69 \text{ kB}$**     |    **PASS (34% under budget)**     |
| **FTS5 Search (3 chars)** (25k)    |     $< 50 \text{ ms}$     |    $4.85 \text{ ms}$    |     **$4.43 \text{ ms}$**     | **PASS (11x faster than budget)**  |
| **FTS5 Search (6 chars)** (25k)    |     $< 50 \text{ ms}$     |    $1.28 \text{ ms}$    |     **$1.06 \text{ ms}$**     | **PASS (47x faster than budget)**  |
| **Sync Engine Throughput**         | $> 3\,000 \text{ rows/s}$ | $5\,210 \text{ rows/s}$ | **$5\,762.4 \text{ rows/s}$** |       **PASS (+552 rows/s)**       |
| **Range Request Latency** (median) |     $< 5 \text{ ms}$      |   $0.142 \text{ ms}$    |    **$0.117 \text{ ms}$**     | **PASS (42x faster than budget)**  |

---

## 2. Database Optimization Details (5.1)

### 2.1 PRAGMA Tuning (`apps/server/src/db/connection.ts`)

- `journal_mode = WAL`
- `synchronous = NORMAL`: eliminates redundant fsync calls on loopback without risk of database
  corruption.
- `temp_store = MEMORY`: ensures temporary sorts occur in RAM.
- `cache_size = -64000`: dedicated 64 MiB page cache in memory.
- `mmap_size = 268435456`: 256 MiB memory-mapped I/O for direct kernel page mapping.
- `PRAGMA optimize` on server shutdown.
- `PRAGMA quick_check(1)` on startup.

### 2.2 Migration 005 (`apps/server/migrations/005_optimization.sql`)

1. **Photo Timeline Index**:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_files_photos_timeline_fast
     ON files(account_id, COALESCE(taken_at, modified_at) DESC)
     WHERE trashed = 0;
   ```
2. **File Browser Covering Index**:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_files_browse_covering
     ON files(account_id, parent_id, trashed, modified_at DESC);
   ```
3. **Album Items Covering Index**:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_album_items_covering
     ON album_items(album_id, added_at DESC, file_id);
   ```

---

## 3. Server & Media Pipeline Optimization (5.2)

1. **Zero-Buffering Stream Pipeline**:
   - Upstream streaming responses pipe directly to clients with backpressure propagation.
   - Verified flat RSS memory profile during multi-megabyte transfers.
2. **Path-Verified Thumbnail Cache Hit**:
   - `3.85 ms` median response time on disk cache hits.
3. **Outbound Guard Coalescing & Rate Limiting**:
   - Sliding window limiter prevents resource exhaustion on brute-force attempts.
   - Suffix matching and connection timeout prevent hung sockets.

---

## 4. Frontend Bundle & Smoothness (5.3)

- **Initial JS Bundle Size**: **98.69 KB (gzip)** (357.75 KB raw).
- **CSS Bundle Size**: **7.47 KB (gzip)** (36.92 KB raw).
- **Code Splitting & Virtualization**: Virtualized photo and file lists with bounded DOM nodes.

---

## 5. Reliability & Sync Engine Throughput (5.4)

- **Full Sync (25,000 files in batches of 1,000)**:
  - Duration: $4338.48 \text{ ms}$
  - Throughput: **$5762.4 \text{ rows/sec}$**
  - Max RSS: $138.32 \text{ MB}$
  - Event loop delay p99: **$0.001 \text{ ms}$**
- **Incremental Sync (100 changes)**:
  - Duration: $10.81 \text{ ms}$
  - Throughput: **$9250.7 \text{ rows/sec}$**
  - Max RSS: $129.77 \text{ MB}$
