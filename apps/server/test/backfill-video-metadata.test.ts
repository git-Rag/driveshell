import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import pino from 'pino';
import type { drive_v3 } from 'googleapis';
import { runMigrations } from '../src/db/migrations';
import { buildAccountQueries } from '../src/db/queries/accounts';
import { buildFileQueries } from '../src/db/queries/files';
import { runBackfillVideoMetadata } from '../src/sync/backfill-video-metadata';
import type { EmitFn, SyncProgressEvent } from '../src/sync/full-sync';
import type { Keychain } from '../src/auth/keychain';

interface TestFileRow {
  id: string;
  duration_ms: number | null;
  image_width: number | null;
  image_height: number | null;
  is_media: number;
}

const testLogger = pino({ level: 'silent' });

describe('Video Metadata Backfill Worker', () => {
  let db: BetterSqlite3.Database;
  const accountId = 'acc_test_video';

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    runMigrations(db, testLogger);

    db.prepare(
      `
      INSERT INTO accounts (id, email, display_name, status, created_at)
      VALUES (?, 'test@example.com', 'Test User', 'ok', unixepoch() * 1000)
    `,
    ).run(accountId);
  });

  afterEach(() => {
    db.close();
  });

  it('backfills duration, width, height and recomputes is_media', async () => {
    // Insert unbackfilled videos
    const now = Date.now();
    db.prepare(
      `
      INSERT INTO files (id, account_id, name, mime_type, size_bytes, modified_at, created_at_ms, is_media, duration_ms, image_width, image_height)
      VALUES
        ('v1', ?, 'holiday.mp4', 'video/mp4', 1000, ?, ?, 1, NULL, NULL, NULL),
        ('v2', ?, 'clip.MTS', 'video/mp2t', 2000, ?, ?, 0, NULL, NULL, NULL)
    `,
    ).run(accountId, now, now, accountId, now, now);

    const mockDrive = {
      files: {
        get: vi.fn().mockImplementation(({ fileId }: { fileId: string }) => {
          if (fileId === 'v1') {
            return Promise.resolve({
              data: {
                id: 'v1',
                videoMediaMetadata: { durationMillis: '30000', width: 1920, height: 1080 },
              },
            });
          }
          if (fileId === 'v2') {
            return Promise.resolve({
              data: {
                id: 'v2',
                videoMediaMetadata: { durationMillis: '15000', width: 1440, height: 1080 },
              },
            });
          }
          return Promise.reject(new Error('Not found'));
        }),
      },
    } as unknown as drive_v3.Drive;

    const accountQ = buildAccountQueries(db);
    const fileQ = buildFileQueries(db);
    const mockKeychain = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    const progressEvents: SyncProgressEvent[] = [];
    const emit: EmitFn = (ev) => progressEvents.push(ev);

    const stats = await runBackfillVideoMetadata(
      accountId,
      db,
      mockKeychain as unknown as Keychain,
      accountQ,
      fileQ,
      3001,
      testLogger,
      emit,
      { driveOverride: mockDrive, concurrency: 2 },
    );

    expect(stats.total).toBe(2);
    expect(stats.processed).toBe(2);
    expect(stats.succeeded).toBe(2);

    const v1 = db.prepare('SELECT * FROM files WHERE id = ?').get('v1') as TestFileRow;
    expect(v1.duration_ms).toBe(30000);
    expect(v1.image_width).toBe(1920);
    expect(v1.image_height).toBe(1080);
    expect(v1.is_media).toBe(1);

    const v2 = db.prepare('SELECT * FROM files WHERE id = ?').get('v2') as TestFileRow;
    expect(v2.duration_ms).toBe(15000);
    expect(v2.image_width).toBe(1440);
    expect(v2.image_height).toBe(1080);
    // clip.MTS now has metadata -> is_media recomputed to 1!
    expect(v2.is_media).toBe(1);
  });

  it('handles missing metadata by recording duration_ms = 0 to prevent infinite restart loop', async () => {
    const now = Date.now();
    db.prepare(
      `
      INSERT INTO files (id, account_id, name, mime_type, size_bytes, modified_at, created_at_ms, is_media, duration_ms)
      VALUES
        ('v_nometa', ?, 'audio_video.mp4', 'video/mp4', 1000, ?, ?, 1, NULL)
    `,
    ).run(accountId, now, now);

    const mockDrive = {
      files: {
        get: vi.fn().mockResolvedValue({
          data: {
            id: 'v_nometa',
            // Drive returns empty metadata
          },
        }),
      },
    } as unknown as drive_v3.Drive;

    const accountQ = buildAccountQueries(db);
    const fileQ = buildFileQueries(db);
    const mockKeychain = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };

    const stats = await runBackfillVideoMetadata(
      accountId,
      db,
      mockKeychain as unknown as Keychain,
      accountQ,
      fileQ,
      3001,
      testLogger,
      undefined,
      { driveOverride: mockDrive },
    );

    expect(stats.succeeded).toBe(1);
    const row = db.prepare('SELECT * FROM files WHERE id = ?').get('v_nometa') as TestFileRow;
    expect(row.duration_ms).toBe(0);
    expect(row.image_width).toBeNull();
    // holiday.mp4 without metadata is still media under corrected rule
    expect(row.is_media).toBe(1);

    // On second run (simulating app restart), this row is NOT selected again
    const statsRestart = await runBackfillVideoMetadata(
      accountId,
      db,
      mockKeychain as unknown as Keychain,
      accountQ,
      fileQ,
      3001,
      testLogger,
      undefined,
      { driveOverride: mockDrive },
    );
    expect(statsRestart.total).toBe(0);
    expect(statsRestart.processed).toBe(0);
  });

  it('retries on HTTP 429 rate limit with backoff and succeeds', async () => {
    const now = Date.now();
    db.prepare(
      `
      INSERT INTO files (id, account_id, name, mime_type, size_bytes, modified_at, created_at_ms, is_media, duration_ms)
      VALUES ('v_rate', ?, 'rate_limit.mp4', 'video/mp4', 500, ?, ?, 1, NULL)
    `,
    ).run(accountId, now, now);

    let callCount = 0;
    const mockDrive = {
      files: {
        get: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            const err = Object.assign(new Error('Rate limit exceeded'), { status: 429 });
            return Promise.reject(err);
          }
          return Promise.resolve({
            data: {
              id: 'v_rate',
              videoMediaMetadata: { durationMillis: '45000', width: 1280, height: 720 },
            },
          });
        }),
      },
    } as unknown as drive_v3.Drive;

    const accountQ = buildAccountQueries(db);
    const fileQ = buildFileQueries(db);
    const mockKeychain = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };

    const stats = await runBackfillVideoMetadata(
      accountId,
      db,
      mockKeychain as unknown as Keychain,
      accountQ,
      fileQ,
      3001,
      testLogger,
      undefined,
      { driveOverride: mockDrive },
    );

    expect(callCount).toBe(2);
    expect(stats.succeeded).toBe(1);
    const row = db.prepare('SELECT * FROM files WHERE id = ?').get('v_rate') as TestFileRow;
    expect(row.duration_ms).toBe(45000);
    expect(row.image_width).toBe(1280);
  });

  it('resumes cleanly across simulated restarts (partial completion)', async () => {
    const now = Date.now();
    db.prepare(
      `
      INSERT INTO files (id, account_id, name, mime_type, size_bytes, modified_at, created_at_ms, is_media, duration_ms)
      VALUES
        ('v_part1', ?, 'part1.mp4', 'video/mp4', 100, ?, ?, 1, NULL),
        ('v_part2', ?, 'part2.mp4', 'video/mp4', 100, ?, ?, 1, NULL),
        ('v_part3', ?, 'part3.mp4', 'video/mp4', 100, ?, ?, 1, NULL)
    `,
    ).run(accountId, now, now, accountId, now, now, accountId, now, now);

    // Simulate partial run: v_part1 already processed before crash/restart
    db.prepare('UPDATE files SET duration_ms = 12000, image_width = 1920 WHERE id = ?').run(
      'v_part1',
    );

    const mockDrive = {
      files: {
        get: vi.fn().mockImplementation(({ fileId }: { fileId: string }) => {
          return Promise.resolve({
            data: {
              id: fileId,
              videoMediaMetadata: { durationMillis: '10000', width: 1920, height: 1080 },
            },
          });
        }),
      },
    } as unknown as drive_v3.Drive;

    const accountQ = buildAccountQueries(db);
    const fileQ = buildFileQueries(db);
    const mockKeychain = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };

    // Should only query remaining 2 rows (v_part2, v_part3)
    const stats = await runBackfillVideoMetadata(
      accountId,
      db,
      mockKeychain as unknown as Keychain,
      accountQ,
      fileQ,
      3001,
      testLogger,
      undefined,
      { driveOverride: mockDrive },
    );

    expect(stats.total).toBe(2);
    expect(stats.processed).toBe(2);
    expect(stats.succeeded).toBe(2);

    const remainingUnbackfilled = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM files WHERE account_id = ? AND mime_type LIKE 'video/%' AND duration_ms IS NULL
    `,
      )
      .get(accountId) as { count: number };
    expect(remainingUnbackfilled.count).toBe(0);
  });
});
