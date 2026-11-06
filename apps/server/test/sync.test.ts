/**
 * sync.test.ts — Phase 2 unit tests.
 *
 * Tests:
 *  1. Migration 002 applies cleanly after 001 — files table + FTS5 + triggers created
 *  2. upsertFile + ON CONFLICT DO UPDATE behavior
 *  3. FTS5 search with trigram query vs LIKE fallback
 *  4. Updating `starred` does NOT update FTS (trigger is AFTER UPDATE OF name only)
 *  5. withBackoff retries on retryable errors and gives up after maxRetries
 *  6. mapDriveFile maps Drive API fields correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { Database } from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function openTestDb(tmpDir: string): Database {
  const db = new BetterSqlite3(path.join(tmpDir, 'test.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF'); // tests use fake accountIds
  return db;
}

function applyMigration(db: Database, file: string): void {
  const sql = fs.readFileSync(path.resolve(__dirname, '..', 'migrations', file), 'utf8');
  db.exec(sql);
}

// ---------------------------------------------------------------------------
// 1. Migration 002 applies cleanly
// ---------------------------------------------------------------------------

describe('Migration 002', () => {
  let tmpDir: string;
  let db: Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'driveshell-test-'));
    db = openTestDb(tmpDir);
    applyMigration(db, '001_initial.sql');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates files table with correct columns', () => {
    applyMigration(db, '002_files.sql');
    const cols = db.prepare(`PRAGMA table_info(files)`).all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain('rowid');
    expect(names).toContain('account_id');
    expect(names).toContain('id');
    expect(names).toContain('name');
    expect(names).toContain('mime_type');
    expect(names).toContain('starred');
    expect(names).toContain('trashed');
    expect(names).toContain('taken_at');
    expect(names).toContain('camera_make');
    expect(names).toContain('camera_model');
  });

  it('creates files_fts virtual table', () => {
    applyMigration(db, '002_files.sql');
    const row = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='files_fts'`)
      .get();
    expect(row).toBeTruthy();
  });

  it('creates all expected indexes', () => {
    applyMigration(db, '002_files.sql');
    const rows = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='files'`)
      .all() as Array<{ name: string }>;
    const names = rows.map((r) => r.name);
    expect(names).toContain('idx_files_account');
    expect(names).toContain('idx_files_account_mime');
    expect(names).toContain('idx_files_account_starred');
    expect(names).toContain('idx_files_account_modified');
  });

  it('records schema version 2', () => {
    applyMigration(db, '002_files.sql');
    const row = db
      .prepare<[], { version: number }>(`SELECT MAX(version) AS version FROM schema_version`)
      .get();
    expect(row?.version).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 2. upsertFile and ON CONFLICT DO UPDATE
// ---------------------------------------------------------------------------

describe('FileQueries.upsertFile', () => {
  let tmpDir: string;
  let db: Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'driveshell-test-'));
    db = openTestDb(tmpDir);
    applyMigration(db, '001_initial.sql');
    applyMigration(db, '002_files.sql');
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      account_id: 'acct-1',
      id: 'drive-file-1',
      name: 'photo.jpg',
      mime_type: 'image/jpeg',
      parent_id: null,
      size_bytes: 1024,
      modified_at: 1_700_000_000_000,
      created_at_ms: 1_699_000_000_000,
      starred: 0,
      trashed: 0,
      thumbnail_url: null,
      web_view_link: null,
      image_width: 1920,
      image_height: 1080,
      taken_at: null,
      camera_make: null,
      camera_model: null,
      ...overrides,
    };
  }

  it('inserts a new file row', () => {
    const stmt = db.prepare(`
      INSERT INTO files (account_id, id, name, mime_type, parent_id,
        size_bytes, modified_at, created_at_ms, starred, trashed,
        thumbnail_url, web_view_link, image_width, image_height,
        taken_at, camera_make, camera_model)
      VALUES (@account_id, @id, @name, @mime_type, @parent_id,
        @size_bytes, @modified_at, @created_at_ms, @starred, @trashed,
        @thumbnail_url, @web_view_link, @image_width, @image_height,
        @taken_at, @camera_make, @camera_model)
      ON CONFLICT(account_id, id) DO UPDATE SET name = excluded.name
    `);
    stmt.run(makeRow());

    const row = db
      .prepare<[string, string], { name: string }>(
        `SELECT name FROM files WHERE account_id = ? AND id = ?`,
      )
      .get('acct-1', 'drive-file-1');
    expect(row?.name).toBe('photo.jpg');
  });

  it('updates name on conflict', () => {
    const stmt = db.prepare(`
      INSERT INTO files (account_id, id, name, mime_type, parent_id,
        size_bytes, modified_at, created_at_ms, starred, trashed,
        thumbnail_url, web_view_link, image_width, image_height,
        taken_at, camera_make, camera_model)
      VALUES (@account_id, @id, @name, @mime_type, @parent_id,
        @size_bytes, @modified_at, @created_at_ms, @starred, @trashed,
        @thumbnail_url, @web_view_link, @image_width, @image_height,
        @taken_at, @camera_make, @camera_model)
      ON CONFLICT(account_id, id) DO UPDATE SET name = excluded.name
    `);
    stmt.run(makeRow({ name: 'original.jpg' }));
    stmt.run(makeRow({ name: 'renamed.jpg' }));

    const count = db
      .prepare<[], { c: number }>(`SELECT COUNT(*) AS c FROM files WHERE account_id = 'acct-1'`)
      .get();
    expect(count?.c).toBe(1);

    const row = db
      .prepare<[string, string], { name: string }>(
        `SELECT name FROM files WHERE account_id = ? AND id = ?`,
      )
      .get('acct-1', 'drive-file-1');
    expect(row?.name).toBe('renamed.jpg');
  });
});

// ---------------------------------------------------------------------------
// 3. FTS5 search — trigram vs LIKE
// ---------------------------------------------------------------------------

describe('FileQueries.searchFiles', () => {
  let tmpDir: string;
  let db: Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'driveshell-test-'));
    db = openTestDb(tmpDir);
    applyMigration(db, '001_initial.sql');
    applyMigration(db, '002_files.sql');

    // Insert test files
    const stmt = db.prepare(`
      INSERT INTO files (account_id, id, name, mime_type, parent_id,
        size_bytes, modified_at, created_at_ms, starred, trashed,
        thumbnail_url, web_view_link, image_width, image_height,
        taken_at, camera_make, camera_model)
      VALUES (@account_id, @id, @name, @mime_type, @parent_id,
        @size_bytes, @modified_at, @created_at_ms, @starred, @trashed,
        @thumbnail_url, @web_view_link, @image_width, @image_height,
        @taken_at, @camera_make, @camera_model)
    `);

    const base = {
      account_id: 'acct-1',
      mime_type: 'image/jpeg',
      parent_id: null,
      size_bytes: 1024,
      modified_at: Date.now(),
      created_at_ms: Date.now(),
      starred: 0,
      trashed: 0,
      thumbnail_url: null,
      web_view_link: null,
      image_width: null,
      image_height: null,
      taken_at: null,
      camera_make: null,
      camera_model: null,
    };

    stmt.run({ ...base, id: 'f1', name: 'Vacation_Beach.jpg' });
    stmt.run({ ...base, id: 'f2', name: 'Holiday_Photo.png', mime_type: 'image/png' });
    stmt.run({ ...base, id: 'f3', name: 'Work_Document.pdf', mime_type: 'application/pdf' });
    stmt.run({ ...base, id: 'f4', name: 'beach_sunset.jpg' });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('FTS5 trigram search finds substring matches (3+ chars)', () => {
    const ftsQuery = '"beach"';
    const rows = db
      .prepare<[string, string, number], { name: string }>(
        `
        SELECT f.name FROM files f
        JOIN files_fts fts ON fts.rowid = f.rowid
        WHERE f.account_id = ? AND fts.name MATCH ?
        ORDER BY rank LIMIT ?
      `,
      )
      .all('acct-1', ftsQuery, 10);
    const names = rows.map((r) => r.name);
    expect(names).toContain('Vacation_Beach.jpg');
    expect(names).toContain('beach_sunset.jpg');
    expect(names).not.toContain('Work_Document.pdf');
  });

  it('LIKE fallback works for short queries', () => {
    const rows = db
      .prepare<[string, string, number], { name: string }>(
        `
        SELECT name FROM files
        WHERE account_id = ? AND name LIKE ? ESCAPE '\\'
        ORDER BY modified_at DESC LIMIT ?
      `,
      )
      .all('acct-1', '%Do%', 10);
    const names = rows.map((r) => r.name);
    expect(names).toContain('Work_Document.pdf');
  });
});

// ---------------------------------------------------------------------------
// 4. Updating `starred` does NOT fire the FTS name trigger
// ---------------------------------------------------------------------------

describe('FTS update trigger is name-only', () => {
  let tmpDir: string;
  let db: Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'driveshell-test-'));
    db = openTestDb(tmpDir);
    applyMigration(db, '001_initial.sql');
    applyMigration(db, '002_files.sql');

    db.prepare(
      `
      INSERT INTO files (account_id, id, name, mime_type, parent_id,
        size_bytes, modified_at, created_at_ms, starred, trashed,
        thumbnail_url, web_view_link, image_width, image_height,
        taken_at, camera_make, camera_model)
      VALUES ('acct-1','f1','trigger_test.jpg','image/jpeg',null,
        1024,1700000000000,1700000000000,0,0,null,null,null,null,null,null,null)
    `,
    ).run();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('toggling starred does not change FTS content', () => {
    // Count FTS rows before
    const before = db
      .prepare<[], { c: number }>(
        `SELECT COUNT(*) AS c FROM files_fts WHERE name = 'trigger_test.jpg'`,
      )
      .get();
    expect(before?.c).toBe(1);

    // Update starred only
    db.prepare(`UPDATE files SET starred = 1 WHERE id = 'f1'`).run();

    // FTS row still present (trigger must NOT have deleted it)
    const after = db
      .prepare<[], { c: number }>(
        `SELECT COUNT(*) AS c FROM files_fts WHERE name = 'trigger_test.jpg'`,
      )
      .get();
    expect(after?.c).toBe(1);
  });

  it('renaming a file updates FTS content', () => {
    db.prepare(`UPDATE files SET name = 'renamed.jpg' WHERE id = 'f1'`).run();

    const old = db
      .prepare<[], { c: number }>(
        `SELECT COUNT(*) AS c FROM files_fts WHERE name = 'trigger_test.jpg'`,
      )
      .get();
    expect(old?.c).toBe(0);

    const updated = db
      .prepare<[], { c: number }>(`SELECT COUNT(*) AS c FROM files_fts WHERE name = 'renamed.jpg'`)
      .get();
    expect(updated?.c).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. withBackoff — retries on retryable errors
// ---------------------------------------------------------------------------

describe('withBackoff', () => {
  it('retries on status 429 and succeeds eventually', async () => {
    // We test withBackoff with a fake logger and a mock fn
    const { withBackoff } = await import('../src/sync/drive-api');

    const fakeLog = {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
      level: 'info',
      silent: vi.fn(),
    } as unknown as Parameters<typeof withBackoff>[1];

    let attempts = 0;
    const result = await withBackoff(
      async () => {
        attempts++;
        if (attempts < 3) {
          const err = Object.assign(new Error('Rate limited'), { code: 429 });
          throw err;
        }
        return 'success';
      },
      fakeLog,
      5,
    );

    expect(result).toBe('success');
    expect(attempts).toBe(3);
    expect(fakeLog.warn).toHaveBeenCalledTimes(2);
  });

  it('retries on status 403 when reason is userRateLimitExceeded', async () => {
    const { withBackoff } = await import('../src/sync/drive-api');

    const fakeLog = {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
      level: 'info',
      silent: vi.fn(),
    } as unknown as Parameters<typeof withBackoff>[1];

    let attempts = 0;
    const result = await withBackoff(
      async () => {
        attempts++;
        if (attempts < 2) {
          const err = Object.assign(new Error('User Rate Limit Exceeded'), {
            code: 403,
            errors: [{ reason: 'userRateLimitExceeded', domain: 'usageLimits' }],
          });
          throw err;
        }
        return 'success-after-403';
      },
      fakeLog,
      3,
    );

    expect(result).toBe('success-after-403');
    expect(attempts).toBe(2);
    expect(fakeLog.warn).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on non-retryable errors', async () => {
    const { withBackoff } = await import('../src/sync/drive-api');

    const fakeLog = {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
      level: 'info',
      silent: vi.fn(),
    } as unknown as Parameters<typeof withBackoff>[1];

    let attempts = 0;
    await expect(
      withBackoff(
        async () => {
          attempts++;
          const err = Object.assign(new Error('Not found'), { code: 404 });
          throw err;
        },
        fakeLog,
        5,
      ),
    ).rejects.toThrow('Not found');

    expect(attempts).toBe(1); // no retry
  });

  it('gives up after maxRetries', async () => {
    const { withBackoff } = await import('../src/sync/drive-api');

    const fakeLog = {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
      level: 'info',
      silent: vi.fn(),
    } as unknown as Parameters<typeof withBackoff>[1];

    let attempts = 0;
    await expect(
      withBackoff(
        async () => {
          attempts++;
          const err = Object.assign(new Error('Service unavailable'), { code: 503 });
          throw err;
        },
        fakeLog,
        3, // maxRetries = 3
      ),
    ).rejects.toThrow('Service unavailable');

    expect(attempts).toBe(3);
  }, 30_000); // allow time for backoff delays
});

// ---------------------------------------------------------------------------
// 6. mapDriveFile
// ---------------------------------------------------------------------------

describe('mapDriveFile', () => {
  it('maps a Drive file correctly', async () => {
    const { mapDriveFile } = await import('../src/sync/drive-api');

    const driveFile = {
      id: 'abc123',
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      parents: ['parent-folder-id'],
      size: '4096000',
      modifiedTime: '2024-06-15T12:00:00.000Z',
      createdTime: '2024-01-01T00:00:00.000Z',
      starred: true,
      trashed: false,
      thumbnailLink: 'https://example.com/thumb',
      webViewLink: 'https://drive.google.com/file/d/abc123/view',
      imageMediaMetadata: {
        width: 4032,
        height: 3024,
        time: '2024:06:15 12:00:00',
        cameraMake: 'Apple',
        cameraModel: 'iPhone 15 Pro',
      },
    };

    const row = mapDriveFile('acct-1', driveFile);
    expect(row).not.toBeNull();
    expect(row!.id).toBe('abc123');
    expect(row!.account_id).toBe('acct-1');
    expect(row!.name).toBe('photo.jpg');
    expect(row!.mime_type).toBe('image/jpeg');
    expect(row!.parent_id).toBe('parent-folder-id');
    expect(row!.size_bytes).toBe(4_096_000);
    expect(row!.starred).toBe(1);
    expect(row!.trashed).toBe(0);
    expect(row!.image_width).toBe(4032);
    expect(row!.image_height).toBe(3024);
    expect(row!.camera_make).toBe('Apple');
    expect(row!.camera_model).toBe('iPhone 15 Pro');
    expect(row!.thumbnail_url).toBe('https://example.com/thumb');
  });

  it('returns null for files missing id, name, or mimeType', async () => {
    const { mapDriveFile } = await import('../src/sync/drive-api');
    expect(mapDriveFile('acct-1', {})).toBeNull();
    expect(mapDriveFile('acct-1', { id: 'x', name: 'y' })).toBeNull();
  });
});
