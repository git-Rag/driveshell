import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { isRealMedia, HIDDEN_FOLDER_NAMES } from '@driveshell/shared';
import { runMigrations } from '../src/db/migrations';
import { buildFileQueries } from '../src/db/queries/files';
import pino from 'pino';

const testLogger = pino({ level: 'silent' });

describe('Media Classification & Junk Code Exclusion', () => {
  describe('isRealMedia (pure shared function)', () => {
    it('isObject.d.mts as video/mp2t, no metadata -> not media', () => {
      const result = isRealMedia({
        name: 'isObject.d.mts',
        mime_type: 'video/mp2t',
        duration_ms: null,
        image_width: null,
        image_height: null,
      });
      expect(result).toBe(false);
    });

    it('foo.ts as video/mp2t, no metadata -> not media', () => {
      const result = isRealMedia({
        name: 'foo.ts',
        mime_type: 'video/mp2t',
        duration_ms: null,
        image_width: null,
        image_height: null,
      });
      expect(result).toBe(false);
    });

    it('clip.MTS as video/mp2t WITH duration/width/height -> media', () => {
      const result = isRealMedia({
        name: 'clip.MTS',
        mime_type: 'video/mp2t',
        duration_ms: 14500,
        image_width: 1920,
        image_height: 1080,
      });
      expect(result).toBe(true);
    });

    it('IMG_2694.HEIC -> media', () => {
      const result = isRealMedia({
        name: 'IMG_2694.HEIC',
        mime_type: 'image/heic',
      });
      expect(result).toBe(true);
    });

    it('holiday.mp4 with metadata -> media', () => {
      const result = isRealMedia({
        name: 'holiday.mp4',
        mime_type: 'video/mp4',
        duration_ms: 32000,
        image_width: 3840,
        image_height: 2160,
      });
      expect(result).toBe(true);
    });

    it('holiday.mp4 without metadata -> not media', () => {
      const result = isRealMedia({
        name: 'holiday.mp4',
        mime_type: 'video/mp4',
        duration_ms: null,
        image_width: null,
        image_height: null,
      });
      expect(result).toBe(false);
    });

    it('TS declaration variations (.d.ts, .d.mts, .d.cts) without metadata are never media', () => {
      expect(isRealMedia({ name: 'types.d.ts', mime_type: 'video/mp2t' })).toBe(false);
      expect(isRealMedia({ name: 'index.d.cts', mime_type: 'video/mp2t' })).toBe(false);
      expect(isRealMedia({ name: 'trace-mapping.d.mts', mime_type: 'video/mp2t' })).toBe(false);
    });
  });

  describe('Database Hidden Folder Exclusion & Photos Filtering', () => {
    let db: BetterSqlite3.Database;

    beforeEach(() => {
      db = new BetterSqlite3(':memory:');
      runMigrations(db, testLogger);
    });

    afterEach(() => {
      db.close();
    });

    it('file under node_modules ancestor -> hidden, excluded from Photos, searchable in Files', () => {
      const fileQ = buildFileQueries(db);
      const accountId = 'acc_test_123';
      const now = Date.now();

      // 1. Create account
      db.prepare(`
        INSERT INTO accounts (id, email, display_name, created_at)
        VALUES (?, 'user@example.com', 'Test User', ?)
      `).run(accountId, now);

      // 2. Create folder tree:
      // - root (Photos)
      //   - IMG_2694.HEIC (image)
      //   - holiday.mp4 (video with metadata)
      // - root (Project)
      //   - node_modules (folder)
      //     - nested-pkg (folder)
      //       - isObject.d.mts (TS declaration reported as video/mp2t)
      //       - logo.png (code icon)
      fileQ.upsertFile({
        account_id: accountId,
        id: 'folder_photos',
        name: 'Photos',
        mime_type: 'application/vnd.google-apps.folder',
        parent_id: null,
        size_bytes: null,
        modified_at: now,
        created_at_ms: now,
        starred: 0,
        trashed: 0,
        thumbnail_url: null,
        web_view_link: null,
        image_width: null,
        image_height: null,
        taken_at: null,
        camera_make: null,
        camera_model: null,
        is_media: 0,
        is_hidden: 0,
      });

      fileQ.upsertFile({
        account_id: accountId,
        id: 'file_heic',
        name: 'IMG_2694.HEIC',
        mime_type: 'image/heic',
        parent_id: 'folder_photos',
        size_bytes: 2500000,
        modified_at: now,
        created_at_ms: now,
        starred: 0,
        trashed: 0,
        thumbnail_url: 'https://lh3.googleusercontent.com/photo-thumb',
        web_view_link: null,
        image_width: 4032,
        image_height: 3024,
        taken_at: now - 100000,
        camera_make: 'Apple',
        camera_model: 'iPhone 15 Pro',
        is_media: 1,
        is_hidden: 0,
      });

      fileQ.upsertFile({
        account_id: accountId,
        id: 'file_video',
        name: 'holiday.mp4',
        mime_type: 'video/mp4',
        parent_id: 'folder_photos',
        size_bytes: 50000000,
        modified_at: now,
        created_at_ms: now,
        starred: 1,
        trashed: 0,
        thumbnail_url: 'https://lh3.googleusercontent.com/video-thumb',
        web_view_link: null,
        image_width: 1920,
        image_height: 1080,
        duration_ms: 45000,
        taken_at: now - 50000,
        camera_make: null,
        camera_model: null,
        is_media: 1,
        is_hidden: 0,
      });

      fileQ.upsertFile({
        account_id: accountId,
        id: 'folder_node_modules',
        name: 'node_modules',
        mime_type: 'application/vnd.google-apps.folder',
        parent_id: null,
        size_bytes: null,
        modified_at: now,
        created_at_ms: now,
        starred: 0,
        trashed: 0,
        thumbnail_url: null,
        web_view_link: null,
        image_width: null,
        image_height: null,
        taken_at: null,
        camera_make: null,
        camera_model: null,
        is_media: 0,
        is_hidden: 0,
      });

      fileQ.upsertFile({
        account_id: accountId,
        id: 'folder_nested',
        name: 'nested-pkg',
        mime_type: 'application/vnd.google-apps.folder',
        parent_id: 'folder_node_modules',
        size_bytes: null,
        modified_at: now,
        created_at_ms: now,
        starred: 0,
        trashed: 0,
        thumbnail_url: null,
        web_view_link: null,
        image_width: null,
        image_height: null,
        taken_at: null,
        camera_make: null,
        camera_model: null,
        is_media: 0,
        is_hidden: 0,
      });

      fileQ.upsertFile({
        account_id: accountId,
        id: 'file_is_object',
        name: 'isObject.d.mts',
        mime_type: 'video/mp2t',
        parent_id: 'folder_nested',
        size_bytes: 1200,
        modified_at: now,
        created_at_ms: now,
        starred: 0,
        trashed: 0,
        thumbnail_url: null,
        web_view_link: null,
        image_width: null,
        image_height: null,
        taken_at: null,
        camera_make: null,
        camera_model: null,
        is_media: 0,
        is_hidden: 0,
      });

      fileQ.upsertFile({
        account_id: accountId,
        id: 'file_code_logo',
        name: 'logo.png',
        mime_type: 'image/png',
        parent_id: 'folder_nested',
        size_bytes: 4000,
        modified_at: now,
        created_at_ms: now,
        starred: 0,
        trashed: 0,
        thumbnail_url: 'https://lh3.googleusercontent.com/logo-thumb',
        web_view_link: null,
        image_width: 64,
        image_height: 64,
        taken_at: null,
        camera_make: null,
        camera_model: null,
        is_media: 1, // image/png is media by itself
        is_hidden: 0,
      });

      // 3. Recompute hidden flags (simulating post-sync CTE)
      const changed = fileQ.recomputeHiddenFiles();
      expect(changed).toBeGreaterThan(0);

      // 4. Verify hidden status
      const isObjectRow = fileQ.findById(accountId, 'file_is_object');
      expect(isObjectRow?.is_hidden).toBe(1);
      expect(isObjectRow?.hidden_reason).toBe('descendant_of_node_modules');

      const codeLogoRow = fileQ.findById(accountId, 'file_code_logo');
      expect(codeLogoRow?.is_hidden).toBe(1);
      expect(codeLogoRow?.hidden_reason).toBe('descendant_of_node_modules');

      const heicRow = fileQ.findById(accountId, 'file_heic');
      expect(heicRow?.is_hidden).toBe(0);

      const videoRow = fileQ.findById(accountId, 'file_video');
      expect(videoRow?.is_hidden).toBe(0);

      // 5. Photos list query must ONLY return real, unhidden media
      const photos = fileQ.listPhotos(accountId, { offset: 0, limit: 100 });
      expect(photos.total).toBe(2);
      const photoIds = photos.files.map((f) => f.id);
      expect(photoIds).toContain('file_heic');
      expect(photoIds).toContain('file_video');
      expect(photoIds).not.toContain('file_is_object');
      expect(photoIds).not.toContain('file_code_logo');

      // 6. countPhotos must match
      expect(fileQ.countPhotos(accountId)).toBe(2);

      // 7. Search in Files tab still finds the hidden file
      const searchResults = fileQ.searchFiles(accountId, 'isObject', 10);
      expect(searchResults.some((f) => f.id === 'file_is_object')).toBe(true);
    });
  });
});
