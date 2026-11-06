/**
 * sync-bench.ts — Benchmark full sync and incremental sync throughput against a mock Drive API.
 * Measures: total time, rows/sec, memory (RSS), and event loop delay.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { buildAccountQueries } from '../../apps/server/src/db/queries/accounts';
import { buildFileQueries } from '../../apps/server/src/db/queries/files';
import { mapDriveFile } from '../../apps/server/src/sync/drive-api';
import type { drive_v3 } from 'googleapis';

interface SyncBenchmarkResult {
  syncType: string;
  totalItems: number;
  durationMs: number;
  rowsPerSec: number;
  maxRssMb: number;
  eventLoopP50Ms: number;
  eventLoopP99Ms: number;
}

function generateMockDriveFiles(count: number): drive_v3.Schema$File[] {
  const files: drive_v3.Schema$File[] = [];
  const baseTime = Date.now() - 365 * 24 * 3600 * 1000;

  for (let i = 0; i < count; i++) {
    const isImage = i % 2 === 0;
    files.push({
      id: `mock-drive-file-${i.toString().padStart(6, '0')}`,
      name: isImage ? `IMG_${2000 + i}.jpg` : `Document_${i}.pdf`,
      mimeType: isImage ? 'image/jpeg' : 'application/pdf',
      parents: ['root'],
      size: `${1024 * 100 + (i % 50000)}`,
      modifiedTime: new Date(baseTime + i * 3600000).toISOString(),
      createdTime: new Date(baseTime + i * 3600000).toISOString(),
      starred: i % 20 === 0,
      trashed: false,
      thumbnailLink: isImage ? `https://lh3.googleusercontent.com/mock-thumb/${i}=s220` : undefined,
      webViewLink: `https://drive.google.com/file/d/mock-file-${i}/view`,
      imageMediaMetadata: isImage
        ? {
            width: 4032,
            height: 3024,
            time: new Date(baseTime + i * 3600000).toISOString(),
            cameraMake: 'Apple',
            cameraModel: 'iPhone 15 Pro',
          }
        : undefined,
    });
  }

  return files;
}

function runSyncBenchmark(totalRows = 25000, pageSize = 1000): SyncBenchmarkResult {
  const repoRoot = path.resolve(__dirname, '../../');
  const tempDbDir = path.resolve(repoRoot, 'data/bench/sync-temp');
  fs.mkdirSync(tempDbDir, { recursive: true });
  const tempDbPath = path.join(tempDbDir, 'sync-bench.db');

  if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);

  const db = new Database(tempDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations 001-004
  const migrationsDir = path.resolve(repoRoot, 'apps/server/migrations');
  const migrationFiles = fs.readdirSync(migrationsDir).sort();
  for (const m of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, m), 'utf8');
    db.exec(sql);
  }

  const accountQ = buildAccountQueries(db);
  const fileQ = buildFileQueries(db);

  const accountId = 'sync-bench-account';
  accountQ.upsert({
    id: accountId,
    email: 'bench@example.com',
    display_name: 'Bench User',
    avatar_url: null,
    scope_level: 'readonly',
  });

  const mockFiles = generateMockDriveFiles(totalRows);

  const eld = monitorEventLoopDelay({ resolution: 20 });
  eld.enable();

  const start = performance.now();
  let maxRss = process.memoryUsage().rss;

  // Simulate full sync pagination loop
  let offset = 0;
  while (offset < totalRows) {
    const pageFiles = mockFiles.slice(offset, offset + pageSize);
    const mapped = pageFiles.map((f) => mapDriveFile(accountId, f)).filter((r) => r !== null);
    if (mapped.length > 0) {
      fileQ.upsertBatch(mapped);
    }
    offset += pageSize;
    const currentRss = process.memoryUsage().rss;
    if (currentRss > maxRss) maxRss = currentRss;
  }

  const durationMs = Number((performance.now() - start).toFixed(2));
  eld.disable();

  const eventLoopP50Ms = Number((eld.percentile(50) / 1e6).toFixed(3));
  const eventLoopP99Ms = Number((eld.percentile(99) / 1e6).toFixed(3));
  const rowsPerSec = Number(((totalRows / durationMs) * 1000).toFixed(1));
  const maxRssMb = Number((maxRss / 1024 / 1024).toFixed(2));

  db.close();
  // Cleanup temp bench DB
  try {
    fs.unlinkSync(tempDbPath);
    if (fs.existsSync(`${tempDbPath}-wal`)) fs.unlinkSync(`${tempDbPath}-wal`);
    if (fs.existsSync(`${tempDbPath}-shm`)) fs.unlinkSync(`${tempDbPath}-shm`);
  } catch (err) {
    void err;
  }

  return {
    syncType: `Full Sync (${totalRows.toLocaleString()} rows, batch size ${pageSize})`,
    totalItems: totalRows,
    durationMs,
    rowsPerSec,
    maxRssMb,
    eventLoopP50Ms,
    eventLoopP99Ms,
  };
}

function runIncrementalSyncBenchmark(changesCount = 100): SyncBenchmarkResult {
  const repoRoot = path.resolve(__dirname, '../../');
  const tempDbDir = path.resolve(repoRoot, 'data/bench/sync-temp');
  fs.mkdirSync(tempDbDir, { recursive: true });
  const tempDbPath = path.join(tempDbDir, 'inc-bench.db');

  if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);

  const db = new Database(tempDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const migrationsDir = path.resolve(repoRoot, 'apps/server/migrations');
  for (const m of fs.readdirSync(migrationsDir).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, m), 'utf8'));
  }

  const accountQ = buildAccountQueries(db);
  const fileQ = buildFileQueries(db);
  const accountId = 'inc-bench-account';
  accountQ.upsert({
    id: accountId,
    email: 'inc@example.com',
    display_name: 'Inc User',
    avatar_url: null,
    scope_level: 'readonly',
  });

  // Pre-populate 1000 items
  const mockInitial = generateMockDriveFiles(1000);
  fileQ.upsertBatch(mockInitial.map((f) => mapDriveFile(accountId, f)).filter((r) => r !== null));

  // 100 delta changes
  const deltaChanges = generateMockDriveFiles(changesCount);

  const eld = monitorEventLoopDelay({ resolution: 20 });
  eld.enable();

  const start = performance.now();
  const mapped = deltaChanges.map((f) => mapDriveFile(accountId, f)).filter((r) => r !== null);
  fileQ.upsertBatch(mapped);

  const durationMs = Number((performance.now() - start).toFixed(2));
  eld.disable();

  const eventLoopP50Ms = Number((eld.percentile(50) / 1e6).toFixed(3));
  const eventLoopP99Ms = Number((eld.percentile(99) / 1e6).toFixed(3));
  const rowsPerSec = Number(((changesCount / durationMs) * 1000).toFixed(1));
  const maxRssMb = Number((process.memoryUsage().rss / 1024 / 1024).toFixed(2));

  db.close();
  try {
    fs.unlinkSync(tempDbPath);
    if (fs.existsSync(`${tempDbPath}-wal`)) fs.unlinkSync(`${tempDbPath}-wal`);
    if (fs.existsSync(`${tempDbPath}-shm`)) fs.unlinkSync(`${tempDbPath}-shm`);
  } catch (err) {
    void err;
  }

  return {
    syncType: `Incremental Sync (${changesCount} changes)`,
    totalItems: changesCount,
    durationMs,
    rowsPerSec,
    maxRssMb,
    eventLoopP50Ms,
    eventLoopP99Ms,
  };
}

function main() {
  console.log('🏁 Running Sync Engine Benchmarks...\n');
  const fullRes = runSyncBenchmark(25000, 1000);
  console.log(`=== ${fullRes.syncType} ===`);
  console.log(`  Total Duration:         ${fullRes.durationMs} ms`);
  console.log(`  Throughput:             ${fullRes.rowsPerSec} rows/sec`);
  console.log(`  Max RSS Memory:         ${fullRes.maxRssMb} MB`);
  console.log(`  Event Loop Delay p50:   ${fullRes.eventLoopP50Ms} ms`);
  console.log(`  Event Loop Delay p99:   ${fullRes.eventLoopP99Ms} ms`);

  console.log('\n');
  const incRes = runIncrementalSyncBenchmark(100);
  console.log(`=== ${incRes.syncType} ===`);
  console.log(`  Total Duration:         ${incRes.durationMs} ms`);
  console.log(`  Throughput:             ${incRes.rowsPerSec} rows/sec`);
  console.log(`  Max RSS Memory:         ${incRes.maxRssMb} MB`);
  console.log(`  Event Loop Delay p50:   ${incRes.eventLoopP50Ms} ms`);
  console.log(`  Event Loop Delay p99:   ${incRes.eventLoopP99Ms} ms`);
}

main();
