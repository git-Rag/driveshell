/**
 * Album DB queries — typed prepared-statement wrappers for Phase 6.
 *
 * Invariants:
 *  - All timestamps are INTEGER unix milliseconds.
 *  - Cascading deletes remove album_items when an album is deleted.
 *  - Fallback cover thumbnail automatically picks the latest photo added.
 */

import { randomUUID } from 'node:crypto';
import type { Db } from '../connection';
import type { FileRow } from './files';

export interface AlbumRow {
  id: string;
  account_id: string;
  title: string;
  description: string | null;
  cover_file_id: string | null;
  created_at: number;
  modified_at: number;
}

export interface AlbumWithMeta extends AlbumRow {
  item_count: number;
  cover_thumbnail_url: string | null;
}

export interface CreateAlbumInput {
  accountId: string;
  title: string;
  description?: string | null;
  coverFileId?: string | null;
}

export interface UpdateAlbumInput {
  title?: string;
  description?: string | null;
  coverFileId?: string | null;
}

export function buildAlbumQueries(db: Db) {
  const insertAlbumStmt = db.prepare<
    [string, string, string, string | null, string | null, number, number],
    void
  >(`
    INSERT INTO albums (id, account_id, title, description, cover_file_id, created_at, modified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const listAlbumsStmt = db.prepare<[string], AlbumWithMeta>(`
    SELECT 
      a.id,
      a.account_id,
      a.title,
      a.description,
      a.cover_file_id,
      a.created_at,
      a.modified_at,
      COUNT(ai.file_id) as item_count,
      COALESCE(
        f_cover.thumbnail_url,
        (SELECT f_first.thumbnail_url 
         FROM album_items ai_first 
         JOIN files f_first ON f_first.id = ai_first.file_id AND f_first.account_id = a.account_id
         WHERE ai_first.album_id = a.id 
         ORDER BY ai_first.added_at DESC, ai_first.rowid DESC 
         LIMIT 1)
      ) as cover_thumbnail_url
    FROM albums a
    LEFT JOIN album_items ai ON ai.album_id = a.id
    LEFT JOIN files f_cover ON f_cover.id = a.cover_file_id AND f_cover.account_id = a.account_id
    WHERE a.account_id = ?
    GROUP BY a.id
    ORDER BY a.modified_at DESC
  `);

  const findByIdStmt = db.prepare<[string, string], AlbumRow>(`
    SELECT id, account_id, title, description, cover_file_id, created_at, modified_at
    FROM albums
    WHERE account_id = ? AND id = ?
  `);

  const deleteAlbumStmt = db.prepare<[string, string], void>(`
    DELETE FROM albums
    WHERE account_id = ? AND id = ?
  `);

  const insertItemStmt = db.prepare<[string, string, number], void>(`
    INSERT OR IGNORE INTO album_items (album_id, file_id, added_at)
    VALUES (?, ?, ?)
  `);

  const removeItemStmt = db.prepare<[string, string], void>(`
    DELETE FROM album_items
    WHERE album_id = ? AND file_id = ?
  `);

  const touchAlbumStmt = db.prepare<[number, string, string], void>(`
    UPDATE albums SET modified_at = ? WHERE account_id = ? AND id = ?
  `);

  const getAlbumFilesStmt = db.prepare<[string, string], FileRow>(`
    SELECT f.*
    FROM files f
    JOIN album_items ai ON ai.file_id = f.id
    WHERE ai.album_id = ? AND f.account_id = ? AND f.trashed = 0
    ORDER BY ai.added_at DESC
  `);

  return {
    create(input: CreateAlbumInput): AlbumRow {
      const id = randomUUID();
      const now = Date.now();
      insertAlbumStmt.run(
        id,
        input.accountId,
        input.title.trim(),
        input.description ?? null,
        input.coverFileId ?? null,
        now,
        now,
      );
      const created = findByIdStmt.get(input.accountId, id);
      if (!created) throw new Error('Failed to create album');
      return created;
    },

    list(accountId: string): AlbumWithMeta[] {
      return listAlbumsStmt.all(accountId);
    },

    findById(accountId: string, albumId: string): AlbumRow | null {
      return findByIdStmt.get(accountId, albumId) ?? null;
    },

    update(accountId: string, albumId: string, updates: UpdateAlbumInput): AlbumRow | null {
      const existing = findByIdStmt.get(accountId, albumId);
      if (!existing) return null;

      const now = Date.now();
      const title = updates.title !== undefined ? updates.title.trim() : existing.title;
      const description =
        updates.description !== undefined ? updates.description : existing.description;
      const coverFileId =
        updates.coverFileId !== undefined ? updates.coverFileId : existing.cover_file_id;

      db.prepare(
        `
        UPDATE albums
        SET title = ?, description = ?, cover_file_id = ?, modified_at = ?
        WHERE account_id = ? AND id = ?
      `,
      ).run(title, description, coverFileId, now, accountId, albumId);

      return findByIdStmt.get(accountId, albumId) ?? null;
    },

    delete(accountId: string, albumId: string): boolean {
      const res = deleteAlbumStmt.run(accountId, albumId);
      return res.changes > 0;
    },

    addFiles(accountId: string, albumId: string, fileIds: string[]): number {
      const baseNow = Date.now();
      let added = 0;
      const addTransaction = db.transaction(() => {
        let i = 0;
        for (const fileId of fileIds) {
          const res = insertItemStmt.run(albumId, fileId, baseNow + i);
          if (res.changes > 0) added++;
          i++;
        }
        touchAlbumStmt.run(baseNow + fileIds.length, accountId, albumId);
      });
      addTransaction();
      return added;
    },

    removeFile(accountId: string, albumId: string, fileId: string): boolean {
      const res = removeItemStmt.run(albumId, fileId);
      if (res.changes > 0) {
        touchAlbumStmt.run(Date.now(), accountId, albumId);
        return true;
      }
      return false;
    },

    getFiles(accountId: string, albumId: string): FileRow[] {
      return getAlbumFilesStmt.all(albumId, accountId);
    },
  };
}

export type AlbumQueries = ReturnType<typeof buildAlbumQueries>;
