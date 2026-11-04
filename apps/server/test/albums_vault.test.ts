/**
 * albums_vault.test.ts — Unit tests for Phase 6 (Albums) and Phase 9 (Vault) queries.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type { Database } from 'better-sqlite3';
import { buildAlbumQueries } from '../src/db/queries/albums';
import { buildVaultQueries } from '../src/db/queries/vault';
import { buildFileQueries } from '../src/db/queries/files';

function openTestDb(tmpDir: string): Database {
  const db = new BetterSqlite3(path.join(tmpDir, 'test.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function applyMigration(db: Database, file: string): void {
  const sql = fs.readFileSync(path.resolve(__dirname, '..', 'migrations', file), 'utf8');
  db.exec(sql);
}

describe('Phase 6 (Albums) & Phase 9 (Vault) Queries', () => {
  let tmpDir: string;
  let db: Database;
  let albumQ: ReturnType<typeof buildAlbumQueries>;
  let vaultQ: ReturnType<typeof buildVaultQueries>;
  let fileQ: ReturnType<typeof buildFileQueries>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'driveshell-av-test-'));
    db = openTestDb(tmpDir);
    applyMigration(db, '001_initial.sql');
    applyMigration(db, '002_files.sql');
    applyMigration(db, '003_albums.sql');
    applyMigration(db, '004_vault.sql');

    // Insert dummy account
    db.prepare(
      `
      INSERT INTO accounts (id, email, display_name, created_at)
      VALUES ('acct-test', 'test@example.com', 'Test User', 1000)
    `,
    ).run();

    albumQ = buildAlbumQueries(db);
    vaultQ = buildVaultQueries(db);
    fileQ = buildFileQueries(db);

    // Insert sample photos
    fileQ.upsertFile({
      account_id: 'acct-test',
      id: 'photo-1',
      name: 'sunset.jpg',
      mime_type: 'image/jpeg',
      parent_id: null,
      size_bytes: 1024,
      modified_at: 1000,
      created_at_ms: 1000,
      starred: 0,
      trashed: 0,
      thumbnail_url: 'https://lh3.googleusercontent.com/photo-1-thumb',
      web_view_link: null,
      image_width: 1920,
      image_height: 1080,
      taken_at: 1000,
      camera_make: null,
      camera_model: null,
    });

    fileQ.upsertFile({
      account_id: 'acct-test',
      id: 'photo-2',
      name: 'mountain.png',
      mime_type: 'image/png',
      parent_id: null,
      size_bytes: 2048,
      modified_at: 2000,
      created_at_ms: 2000,
      starred: 1,
      trashed: 0,
      thumbnail_url: 'https://lh3.googleusercontent.com/photo-2-thumb',
      web_view_link: null,
      image_width: 2560,
      image_height: 1440,
      taken_at: 2000,
      camera_make: null,
      camera_model: null,
    });
  });

  afterEach(() => {
    try {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup locks on Windows
    }
  });

  it('creates an album, adds photos, and calculates item count and cover correctly', () => {
    const album = albumQ.create({
      accountId: 'acct-test',
      title: 'Vacation 2026',
      description: 'Trip photos',
    });

    expect(album.id).toBeDefined();
    expect(album.title).toBe('Vacation 2026');

    // Add photos
    const added = albumQ.addFiles('acct-test', album.id, ['photo-1', 'photo-2']);
    expect(added).toBe(2);

    // List albums
    const albums = albumQ.list('acct-test');
    expect(albums).toHaveLength(1);
    expect(albums[0]!.item_count).toBe(2);
    // Cover should fallback to latest added photo thumbnail
    expect(albums[0]!.cover_thumbnail_url).toBe('https://lh3.googleusercontent.com/photo-2-thumb');

    // Get files in album
    const files = albumQ.getFiles('acct-test', album.id);
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.id)).toContain('photo-1');
    expect(files.map((f) => f.id)).toContain('photo-2');

    // Remove one photo
    const removed = albumQ.removeFile('acct-test', album.id, 'photo-1');
    expect(removed).toBe(true);

    const remainingFiles = albumQ.getFiles('acct-test', album.id);
    expect(remainingFiles).toHaveLength(1);
    expect(remainingFiles[0]!.id).toBe('photo-2');
  });

  it('cascading deletes album and its items without deleting original files', () => {
    const album = albumQ.create({
      accountId: 'acct-test',
      title: 'Temporary Album',
    });
    albumQ.addFiles('acct-test', album.id, ['photo-1']);

    const deleted = albumQ.delete('acct-test', album.id);
    expect(deleted).toBe(true);

    const albums = albumQ.list('acct-test');
    expect(albums).toHaveLength(0);

    // Original file still exists
    const file = fileQ.findById('acct-test', 'photo-1');
    expect(file).not.toBeNull();
  });

  it('sets up vault canary, stores encrypted file, and deletes file', () => {
    // Initial status should be not initialized
    expect(vaultQ.getSettings('acct-test')).toBeNull();

    // Setup canary
    vaultQ.setup('acct-test', 'salt-b64-dummy', 'canary-ciphertext-dummy', 'iv-dummy');
    const settings = vaultQ.getSettings('acct-test');
    expect(settings).not.toBeNull();
    expect(settings!.salt).toBe('salt-b64-dummy');

    // Store encrypted file
    const payload = Buffer.from('AES-256-GCM-CIPHERTEXT-BYTES');
    vaultQ.saveFile(
      'acct-test',
      'vfile-1',
      'secret-doc.pdf',
      'application/pdf',
      payload.length,
      payload,
      'iv-file-1',
    );

    const list = vaultQ.listFiles('acct-test');
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('vfile-1');
    expect(list[0]!.name).toBe('secret-doc.pdf');

    const file = vaultQ.getFile('acct-test', 'vfile-1');
    expect(file).not.toBeNull();
    expect(file!.encrypted_payload.toString()).toBe('AES-256-GCM-CIPHERTEXT-BYTES');

    // Delete file
    const del = vaultQ.deleteFile('acct-test', 'vfile-1');
    expect(del).toBe(true);
    expect(vaultQ.listFiles('acct-test')).toHaveLength(0);
  });
});
