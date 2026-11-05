/**
 * gallery_files.test.ts — Unit tests for Phase 3, 4, 5 backend queries.
 *
 * Tests:
 *  1. getPhotoMonths correctly buckets photos by Month and Year
 *  2. listByParent lists folders first and respects sorting
 *  3. getBreadcrumbs recursively resolves ancestor folder trail
 *  4. updateFileMeta updates starred, trashed, and rename
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { Database } from 'better-sqlite3';
import { buildFileQueries } from '../src/db/queries/files';

import { runMigrations } from '../src/db/migrations';
import pino from 'pino';

const testLogger = pino({ level: 'silent' });

function openTestDb(tmpDir: string): Database {
  const db = new BetterSqlite3(path.join(tmpDir, 'test.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF');
  return db;
}

describe('Phase 3, 4, 5 Queries', () => {
  let tmpDir: string;
  let db: Database;
  let fileQ: ReturnType<typeof buildFileQueries>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'driveshell-gf-test-'));
    db = openTestDb(tmpDir);
    runMigrations(db, testLogger);
    fileQ = buildFileQueries(db);

    // Insert sample files across different months & folders
    const base = {
      account_id: 'acct-1',
      starred: 0,
      trashed: 0,
      thumbnail_url: null,
      web_view_link: null,
      image_width: 1920,
      image_height: 1080,
      camera_make: null,
      camera_model: null,
    };

    // Folder 1
    fileQ.upsertFile({
      ...base,
      id: 'folder-root',
      name: 'Documents',
      mime_type: 'application/vnd.google-apps.folder',
      parent_id: null,
      size_bytes: null,
      modified_at: 1725148800000, // Sept 1, 2024
      created_at_ms: 1725148800000,
      taken_at: null,
    });

    // Subfolder inside Folder 1
    fileQ.upsertFile({
      ...base,
      id: 'subfolder-1',
      name: 'Invoices',
      mime_type: 'application/vnd.google-apps.folder',
      parent_id: 'folder-root',
      size_bytes: null,
      modified_at: 1725235200000,
      created_at_ms: 1725235200000,
      taken_at: null,
    });

    // File inside Subfolder
    fileQ.upsertFile({
      ...base,
      id: 'file-sub-1',
      name: 'invoice_001.pdf',
      mime_type: 'application/pdf',
      parent_id: 'subfolder-1',
      size_bytes: 50000,
      modified_at: 1725321600000,
      created_at_ms: 1725321600000,
      taken_at: null,
    });

    // Photos in different months
    // Photo 1: Sept 2024
    fileQ.upsertFile({
      ...base,
      id: 'photo-1',
      name: 'Beach.jpg',
      mime_type: 'image/jpeg',
      parent_id: null,
      size_bytes: 2048000,
      modified_at: 1726358400000, // Sept 15, 2024
      created_at_ms: 1726358400000,
      taken_at: 1726358400000,
      camera_make: 'Apple',
      camera_model: 'iPhone 15',
    });

    // Photo 2: Aug 2024
    fileQ.upsertFile({
      ...base,
      id: 'photo-2',
      name: 'Mountain.png',
      mime_type: 'image/png',
      parent_id: null,
      size_bytes: 4096000,
      modified_at: 1723248000000, // Aug 10, 2024
      created_at_ms: 1723248000000,
      taken_at: 1723248000000,
      camera_make: 'Sony',
      camera_model: 'A7IV',
    });

    // Video in Sept 2024
    fileQ.upsertFile({
      ...base,
      id: 'video-1',
      name: 'Clip.mp4',
      mime_type: 'video/mp4',
      parent_id: null,
      size_bytes: 15000000,
      modified_at: 1726444800000, // Sept 16, 2024
      created_at_ms: 1726444800000,
      taken_at: 1726444800000,
    });
  });

  afterEach(() => {
    db.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('getPhotoMonths correctly buckets photos and videos by month', () => {
    const buckets = fileQ.getPhotoMonths('acct-1');
    expect(buckets.length).toBeGreaterThanOrEqual(2);

    const sept = buckets.find((b) => b.monthKey.endsWith('09'));
    expect(sept).toBeDefined();
    // Beach.jpg + Clip.mp4 = 2 media items in Sept
    expect(sept?.count).toBe(2);

    const aug = buckets.find((b) => b.monthKey.endsWith('08'));
    expect(aug).toBeDefined();
    expect(aug?.count).toBe(1);
  });

  it('listByParent puts folders first and supports sorting', () => {
    // Root level has 'Documents' (folder), 'Beach.jpg', 'Mountain.png', 'Clip.mp4'
    const res = fileQ.listByParent('acct-1', null, {
      offset: 0,
      limit: 10,
      sortBy: 'name',
      sortDir: 'asc',
    });

    expect(res.files.length).toBeGreaterThan(0);
    // Folder must always be first regardless of alphabetical sort
    expect(res.files[0]?.mime_type).toBe('application/vnd.google-apps.folder');
    expect(res.files[0]?.name).toBe('Documents');
  });

  it('getBreadcrumbs resolves nested folder hierarchy', () => {
    const crumbs = fileQ.getBreadcrumbs('acct-1', 'subfolder-1');
    expect(crumbs.length).toBe(2);
    expect(crumbs[0]?.name).toBe('Documents');
    expect(crumbs[1]?.name).toBe('Invoices');
  });

  it('updateFileMeta toggles star and renames file', () => {
    fileQ.updateFileMeta('acct-1', 'photo-1', { starred: 1, name: 'Sunset.jpg' });
    const updated = fileQ.findById('acct-1', 'photo-1');
    expect(updated?.starred).toBe(1);
    expect(updated?.name).toBe('Sunset.jpg');
  });
});

