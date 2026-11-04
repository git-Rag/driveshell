/**
 * Forward-only migration runner.
 *
 * Rules:
 *  - Reads SQL files from `apps/server/migrations/` in filename order.
 *  - Each file is a single transaction.  If it throws, the migration is rolled back
 *    and the process exits.  We never leave the DB in a half-applied state.
 *  - Tracks the highest version applied in the `schema_version` table.
 *  - Migration 001 bootstraps `schema_version` itself, so the table is always
 *    present after the first run.
 */

import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { FastifyBaseLogger } from 'fastify';

/** Extract the integer version from a filename like `001_initial.sql` → 1. */
function fileVersion(filename: string): number {
  const m = /^(\d+)_/.exec(filename);
  if (!m || !m[1])
    throw new Error(`Migration filename does not start with an integer: ${filename}`);
  return parseInt(m[1], 10);
}

/** Return the highest version already applied, or 0 if `schema_version` does not exist. */
function currentVersion(db: Database.Database): number {
  const tableExists = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table' AND name='schema_version'`,
    )
    .get();
  if (!tableExists) return 0;

  const row = db
    .prepare<[], { version: number }>(`SELECT MAX(version) AS version FROM schema_version`)
    .get();
  return row?.version ?? 0;
}

export function runMigrations(db: Database.Database, log: FastifyBaseLogger): void {
  const migrationsDir = path.resolve(__dirname, '..', '..', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // lexicographic = numeric because filenames are zero-padded

  const applied = currentVersion(db);
  log.info({ applied }, 'DB migration check');

  for (const file of files) {
    const version = fileVersion(file);
    if (version <= applied) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    log.info({ version, file }, 'Applying migration');

    // Each migration file runs in a single transaction.
    const migrate = db.transaction(() => {
      db.exec(sql);
    });
    migrate();

    log.info({ version }, 'Migration applied');
  }
}
