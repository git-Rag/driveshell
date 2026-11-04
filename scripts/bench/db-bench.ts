/**
 * db-bench.ts — Benchmark database queries and query plans against SQLite datasets.
 *
 * Usage:
 *   npx tsx scripts/bench/db-bench.ts
 *
 * Measures:
 *   - Median and p95 latency across >= 10 runs
 *   - EXPLAIN QUERY PLAN for each query (flags SCAN and temp B-tree sorts)
 *   - DB file size and WAL size
 *   - Startup latency to first query
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

interface BenchResult {
  queryName: string;
  plan: string[];
  hasTableScan: boolean;
  hasTempBTree: boolean;
  runs: number;
  medianMs: number;
  p95Ms: number;
}

interface DatasetReport {
  datasetName: string;
  dbPath: string;
  dbSizeBytes: number;
  walSizeBytes: number;
  startupMs: number;
  results: BenchResult[];
}

function calculateMedian(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function calculateP95(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[idx]!;
}

function benchmarkQuery(
  db: Database.Database,
  queryName: string,
  sql: string,
  params: (string | number)[],
  iterations = 15,
): BenchResult {
  // 1. Get EXPLAIN QUERY PLAN
  const planRows = db
    .prepare<any[], { id: number; parent: number; notused: number; detail: string }>(
      `EXPLAIN QUERY PLAN ${sql}`,
    )
    .all(...params);

  const plan = planRows.map((r) => r.detail);
  const hasTableScan = plan.some(
    (d) => d.includes('SCAN') && !d.includes('SCAN fts') && !d.includes('COVERING INDEX'),
  );
  const hasTempBTree = plan.some((d) => d.includes('USE TEMP B-TREE'));

  // 2. Measure execution times (warmup 3 runs + measured 15 runs)
  const stmt = db.prepare(sql);
  for (let i = 0; i < 3; i++) {
    stmt.all(...params);
  }

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    stmt.all(...params);
    const dur = performance.now() - start;
    times.push(dur);
  }

  return {
    queryName,
    plan,
    hasTableScan,
    hasTempBTree,
    runs: iterations,
    medianMs: Number(calculateMedian(times).toFixed(3)),
    p95Ms: Number(calculateP95(times).toFixed(3)),
  };
}

export function runDbBenchmark(datasetName: string, relativeDbPath: string): DatasetReport {
  const repoRoot = path.resolve(__dirname, '../../');
  const fullPath = path.resolve(repoRoot, relativeDbPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Database file not found: ${fullPath}`);
  }

  const stat = fs.statSync(fullPath);
  const walPath = `${fullPath}-wal`;
  const walStat = fs.existsSync(walPath) ? fs.statSync(walPath) : null;

  // Startup time to first query
  const startupStart = performance.now();
  const db = new Database(fullPath, { readonly: true });
  db.pragma('journal_mode = WAL');
  const accountRow = db.prepare<{ id: string }>('SELECT id FROM accounts LIMIT 1').get() as
    { id: string } | undefined;
  const accountId = accountRow?.id ?? 'seed-account-001';
  db.prepare('SELECT 1').get();
  const startupMs = Number((performance.now() - startupStart).toFixed(3));

  const results: BenchResult[] = [];

  // Q1: Timeline Month Buckets
  const Q_MONTHS = `
    SELECT
      strftime('%Y-%m', datetime(
        CASE WHEN taken_at IS NOT NULL THEN taken_at / 1000 ELSE modified_at / 1000 END,
        'unixepoch'
      )) AS monthKey,
      COUNT(*) AS count,
      MAX(CASE WHEN taken_at IS NOT NULL THEN taken_at ELSE modified_at END) AS latestTime
    FROM files
    WHERE account_id = ?
      AND (
        mime_type LIKE 'image/%'
        OR mime_type LIKE 'video/%'
        OR lower(name) LIKE '%.jpg'
        OR lower(name) LIKE '%.jpeg'
        OR lower(name) LIKE '%.png'
        OR lower(name) LIKE '%.gif'
        OR lower(name) LIKE '%.webp'
        OR lower(name) LIKE '%.heic'
        OR lower(name) LIKE '%.heif'
      )
      AND trashed = 0
    GROUP BY monthKey
    ORDER BY latestTime DESC
  `;
  results.push(benchmarkQuery(db, 'Timeline Month Buckets', Q_MONTHS, [accountId]));

  // Q2: Timeline Page (First Page, Offset 0, Limit 50)
  const Q_PAGE_FIRST = `
    SELECT *
    FROM files
    WHERE account_id = ?
      AND (
        mime_type LIKE 'image/%'
        OR mime_type LIKE 'video/%'
        OR lower(name) LIKE '%.jpg'
        OR lower(name) LIKE '%.jpeg'
        OR lower(name) LIKE '%.png'
        OR lower(name) LIKE '%.gif'
        OR lower(name) LIKE '%.webp'
        OR lower(name) LIKE '%.heic'
        OR lower(name) LIKE '%.heif'
      )
      AND trashed = 0
    ORDER BY
      CASE WHEN taken_at IS NOT NULL THEN taken_at ELSE modified_at END DESC,
      id ASC
    LIMIT 50 OFFSET 0
  `;
  results.push(
    benchmarkQuery(db, 'Timeline Page 1 (offset 0, limit 50)', Q_PAGE_FIRST, [accountId]),
  );

  // Q3: Timeline Deep Page (Offset 5000, Limit 50)
  const Q_PAGE_DEEP = `
    SELECT *
    FROM files
    WHERE account_id = ?
      AND (
        mime_type LIKE 'image/%'
        OR mime_type LIKE 'video/%'
        OR lower(name) LIKE '%.jpg'
        OR lower(name) LIKE '%.jpeg'
        OR lower(name) LIKE '%.png'
        OR lower(name) LIKE '%.gif'
        OR lower(name) LIKE '%.webp'
        OR lower(name) LIKE '%.heic'
        OR lower(name) LIKE '%.heif'
      )
      AND trashed = 0
    ORDER BY
      CASE WHEN taken_at IS NOT NULL THEN taken_at ELSE modified_at END DESC,
      id ASC
    LIMIT 50 OFFSET 5000
  `;
  results.push(
    benchmarkQuery(db, 'Timeline Deep Page (offset 5000, limit 50)', Q_PAGE_DEEP, [accountId]),
  );

  // Q4: Starred Listing
  const Q_STARRED = `
    SELECT * FROM files
    WHERE account_id = ? AND starred = 1 AND trashed = 0
    ORDER BY modified_at DESC
    LIMIT 50 OFFSET 0
  `;
  results.push(benchmarkQuery(db, 'Starred Listing (limit 50)', Q_STARRED, [accountId]));

  // Q5: Files Non-Media Listing
  const Q_NON_MEDIA = `
    SELECT * FROM files
    WHERE account_id = ?
      AND mime_type NOT LIKE 'image/%'
      AND mime_type NOT LIKE 'video/%'
      AND trashed = 0
    ORDER BY modified_at DESC
    LIMIT 50 OFFSET 0
  `;
  results.push(benchmarkQuery(db, 'Files Non-Media (limit 50)', Q_NON_MEDIA, [accountId]));

  // Q5b: Folder with 50 children
  const folder50Row = db
    .prepare<[string], { parent_id: string }>(
      `
    SELECT parent_id FROM files
    WHERE account_id = ? AND parent_id IS NOT NULL
    GROUP BY parent_id
    HAVING COUNT(*) BETWEEN 40 AND 60
    LIMIT 1
  `,
    )
    .get(accountId);
  const folder50Id = folder50Row?.parent_id ?? 'folder-synth-50';

  const Q_FOLDER_50 = `
    SELECT * FROM files
    WHERE account_id = ? AND trashed = 0 AND parent_id = ?
    ORDER BY
      CASE WHEN mime_type = 'application/vnd.google-apps.folder' THEN 0 ELSE 1 END ASC,
      modified_at DESC
    LIMIT 50 OFFSET 0
  `;
  results.push(
    benchmarkQuery(db, 'Files List (folder 50 children)', Q_FOLDER_50, [accountId, folder50Id]),
  );

  // Q5c: Folder with 2000 children
  const folder2000Row = db
    .prepare<[string], { parent_id: string }>(
      `
    SELECT parent_id FROM files
    WHERE account_id = ? AND parent_id IS NOT NULL
    GROUP BY parent_id
    ORDER BY COUNT(*) DESC
    LIMIT 1
  `,
    )
    .get(accountId);
  const folder2000Id = folder2000Row?.parent_id ?? 'folder-synth-2000';

  const Q_FOLDER_2000 = `
    SELECT * FROM files
    WHERE account_id = ? AND trashed = 0 AND parent_id = ?
    ORDER BY
      CASE WHEN mime_type = 'application/vnd.google-apps.folder' THEN 0 ELSE 1 END ASC,
      modified_at DESC
    LIMIT 50 OFFSET 0
  `;
  results.push(
    benchmarkQuery(db, 'Files List (folder 2000 children)', Q_FOLDER_2000, [
      accountId,
      folder2000Id,
    ]),
  );

  // Q6: Album Listing with item count and cover
  const Q_ALBUMS = `
    SELECT
      a.*,
      COUNT(ai.file_id) AS item_count,
      MAX(ai.added_at) AS last_item_added_at
    FROM albums a
    LEFT JOIN album_items ai ON ai.album_id = a.id
    WHERE a.account_id = ?
    GROUP BY a.id
    ORDER BY a.modified_at DESC
  `;
  results.push(benchmarkQuery(db, 'Album Listing (with count and join)', Q_ALBUMS, [accountId]));

  // Q7: FTS Trigram Search (3 chars: "img")
  const Q_FTS_3 = `
    SELECT f.*
    FROM files f
    JOIN files_fts fts ON fts.rowid = f.rowid
    WHERE f.account_id = ? AND fts.name MATCH '"img"'
    ORDER BY rank
    LIMIT 50
  `;
  results.push(benchmarkQuery(db, 'FTS5 Search 3-char ("img")', Q_FTS_3, [accountId]));

  // Q8: FTS Trigram Search (6 chars: "screen")
  const Q_FTS_6 = `
    SELECT f.*
    FROM files f
    JOIN files_fts fts ON fts.rowid = f.rowid
    WHERE f.account_id = ? AND fts.name MATCH '"screen"'
    ORDER BY rank
    LIMIT 50
  `;
  results.push(benchmarkQuery(db, 'FTS5 Search 6-char ("screen")', Q_FTS_6, [accountId]));

  // Q9: FTS Trigram Search (no match: "xyznotfound999")
  const Q_FTS_NONE = `
    SELECT f.*
    FROM files f
    JOIN files_fts fts ON fts.rowid = f.rowid
    WHERE f.account_id = ? AND fts.name MATCH '"xyznotfound999"'
    ORDER BY rank
    LIMIT 50
  `;
  results.push(benchmarkQuery(db, 'FTS5 Search (no match)', Q_FTS_NONE, [accountId]));

  // Q10: LIKE Fallback (2 chars: "%me%")
  const Q_LIKE_2 = `
    SELECT * FROM files
    WHERE account_id = ? AND name LIKE '%me%' ESCAPE '\\'
    ORDER BY modified_at DESC
    LIMIT 50
  `;
  results.push(benchmarkQuery(db, 'Search LIKE fallback 2-char ("%me%")', Q_LIKE_2, [accountId]));

  db.close();

  return {
    datasetName,
    dbPath: fullPath,
    dbSizeBytes: stat.size,
    walSizeBytes: walStat?.size ?? 0,
    startupMs,
    results,
  };
}

function main() {
  console.log('🏁 Running Database Query Benchmarks...\n');
  const realReport = runDbBenchmark('Real Drive (~25k)', 'data/bench/real-25k/driveshell.db');
  console.log(
    `=== Dataset: ${realReport.datasetName} (${(realReport.dbSizeBytes / 1024 / 1024).toFixed(2)} MB, startup ${realReport.startupMs} ms) ===`,
  );
  for (const r of realReport.results) {
    const scanBadge = r.hasTableScan ? '⚠️ SCAN' : '✅ INDEX';
    const btreeBadge = r.hasTempBTree ? '⚠️ TEMP-B-TREE' : '';
    console.log(
      `  ${r.queryName.padEnd(42)} median: ${r.medianMs.toFixed(2).padStart(7)} ms | p95: ${r.p95Ms.toFixed(2).padStart(7)} ms | ${scanBadge} ${btreeBadge}`,
    );
    for (const p of r.plan) {
      console.log(`     └─ ${p}`);
    }
  }

  console.log('\n');
  const synthReport = runDbBenchmark('Synthetic (100k)', 'data/bench/synthetic-100k/driveshell.db');
  console.log(
    `=== Dataset: ${synthReport.datasetName} (${(synthReport.dbSizeBytes / 1024 / 1024).toFixed(2)} MB, startup ${synthReport.startupMs} ms) ===`,
  );
  for (const r of synthReport.results) {
    const scanBadge = r.hasTableScan ? '⚠️ SCAN' : '✅ INDEX';
    const btreeBadge = r.hasTempBTree ? '⚠️ TEMP-B-TREE' : '';
    console.log(
      `  ${r.queryName.padEnd(42)} median: ${r.medianMs.toFixed(2).padStart(7)} ms | p95: ${r.p95Ms.toFixed(2).padStart(7)} ms | ${scanBadge} ${btreeBadge}`,
    );
    for (const p of r.plan) {
      console.log(`     └─ ${p}`);
    }
  }
}

main();
