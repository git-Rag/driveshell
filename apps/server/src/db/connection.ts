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
 * The DB file lives at `<dataDir>/driveshell.db` where `dataDir` defaults to
 * `./data` relative to the working directory (overridable via DATA_DIR env var).
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

/** Open (or return the already-open) SQLite database and run pending migrations. */
export function openDb(log: FastifyBaseLogger): Db {
  if (_db) return _db;

  const dbPath = path.join(getDataDir(), 'driveshell.db');
  log.info({ dbPath }, 'Opening SQLite database');

  const db = new BetterSqlite3(dbPath);

  // Core pragmas — set before migrations so FK constraints apply during migration
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_size_limit = 67108864'); // 64 MiB WAL cap

  runMigrations(db, log);

  _db = db;
  return db;
}

/** Close the database (called on graceful shutdown). */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
