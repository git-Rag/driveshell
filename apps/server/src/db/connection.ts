/**
 * SQLite connection singleton.
 *
 * Settings:
 *  - WAL mode for concurrent reads while a write is in progress.
 *  - `foreign_keys = ON`  — required by the schema; album_items and thumb_cache
 *    rows that have no FK must be explicitly cleaned up on account delete.
 *  - `busy_timeout = 5000` — wait up to 5 s before returning SQLITE_BUSY.
 *  - `journal_size_limit`  — cap WAL file growth.
 *
 * The DB file lives at `<dataDir>/sunflower.db` where `dataDir` defaults to
 * `./data` relative to the working directory (overridable via DATA_DIR env var).
 * Legacy `driveshell.db` databases are migrated automatically on startup.
 */

import path from 'node:path';
import fs from 'node:fs';
import BetterSqlite3 from 'better-sqlite3';
import type { FastifyBaseLogger } from 'fastify';
import { runMigrations } from './migrations';

export type Db = BetterSqlite3.Database;

let _db: Db | null = null;

export function getDataDir(): string {
  const dir = process.env['DATA_DIR'] ?? path.resolve(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Get path to the SQLite database file, handling legacy migration if needed. */
export function getDbPath(log?: FastifyBaseLogger): string {
  const dataDir = getDataDir();
  const primaryDb = path.join(dataDir, 'sunflower.db');
  const legacyDb = path.join(dataDir, 'driveshell.db');

  if (!fs.existsSync(primaryDb) && fs.existsSync(legacyDb)) {
    try {
      fs.renameSync(legacyDb, primaryDb);
      if (fs.existsSync(legacyDb + '-wal')) fs.renameSync(legacyDb + '-wal', primaryDb + '-wal');
      if (fs.existsSync(legacyDb + '-shm')) fs.renameSync(legacyDb + '-shm', primaryDb + '-shm');
      log?.info('Migrated legacy driveshell.db to sunflower.db');
    } catch {
      // In case of filesystem lock, fallback to legacyDb
      return legacyDb;
    }
  }

  return fs.existsSync(primaryDb) || !fs.existsSync(legacyDb) ? primaryDb : legacyDb;
}

/** Open (or return the already-open) SQLite database and run pending migrations. */
export function openDb(log: FastifyBaseLogger): Db {
  if (_db) return _db;

  const dbPath = getDbPath(log);
  log.info({ dbPath }, 'Opening SQLite database');

  const db = new BetterSqlite3(dbPath);

  // Core performance and integrity pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -64000'); // 64 MiB page cache
  db.pragma('mmap_size = 268435456'); // 256 MiB memory-mapped I/O
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_size_limit = 67108864'); // 64 MiB WAL cap

  // Quick integrity verification on startup
  const check = db.pragma('quick_check(1)', { simple: true });
  if (check !== 'ok') {
    log.error({ check }, 'SQLite quick_check reported an issue');
  }

  runMigrations(db, log);

  _db = db;
  return db;
}

/** Close the database (called on graceful shutdown). */
export function closeDb(): void {
  if (_db) {
    try {
      _db.pragma('optimize');
    } catch {
      // ignore errors during shutdown optimize
    }
    _db.close();
    _db = null;
  }
}
