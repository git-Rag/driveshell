/**
 * File DB queries — typed prepared-statement wrappers.
 *
 * All timestamps are INTEGER unix milliseconds.
 * FTS5 search:
 *   - query.length >= 3  → trigram FTS5 MATCH (fast, ranked)
 *   - query.length 1–2   → LIKE '%query%' fallback (full scan, small result sets only)
 */

import type { Db } from '../connection';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileRow {
  rowid: number;
  account_id: string;
  id: string; // Drive file ID
  name: string;
  mime_type: string;
  parent_id: string | null;
  size_bytes: number | null;
  modified_at: number;
  created_at_ms: number;
  starred: number; // 0 | 1
  trashed: number; // 0 | 1
  thumbnail_url: string | null;
  web_view_link: string | null;
  image_width: number | null;
  image_height: number | null;
  taken_at: number | null;
  camera_make: string | null;
  camera_model: string | null;
}

export interface UpsertFileInput {
  account_id: string;
  id: string;
  name: string;
  mime_type: string;
  parent_id: string | null;
  size_bytes: number | null;
  modified_at: number;
  created_at_ms: number;
  starred: number;
  trashed: number;
  thumbnail_url: string | null;
  web_view_link: string | null;
  image_width: number | null;
  image_height: number | null;
  taken_at: number | null;
  camera_make: string | null;
  camera_model: string | null;
}

export interface ListFilesOpts {
  offset: number;
  limit: number;
  mimeTypePrefix?: string; // e.g. 'image/' or 'video/'
  starred?: boolean;
  trashed?: boolean;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function buildFileQueries(db: Db) {
  const upsert = db.prepare<UpsertFileInput>(`
    INSERT INTO files (
      account_id, id, name, mime_type, parent_id,
      size_bytes, modified_at, created_at_ms,
      starred, trashed,
      thumbnail_url, web_view_link,
      image_width, image_height,
      taken_at, camera_make, camera_model
    ) VALUES (
      @account_id, @id, @name, @mime_type, @parent_id,
      @size_bytes, @modified_at, @created_at_ms,
      @starred, @trashed,
      @thumbnail_url, @web_view_link,
      @image_width, @image_height,
      @taken_at, @camera_make, @camera_model
    )
    ON CONFLICT(account_id, id) DO UPDATE SET
      name          = excluded.name,
      mime_type     = excluded.mime_type,
      parent_id     = excluded.parent_id,
      size_bytes    = excluded.size_bytes,
      modified_at   = excluded.modified_at,
      starred       = excluded.starred,
      trashed       = excluded.trashed,
      thumbnail_url = excluded.thumbnail_url,
      web_view_link = excluded.web_view_link,
      image_width   = excluded.image_width,
      image_height  = excluded.image_height,
      taken_at      = excluded.taken_at,
      camera_make   = excluded.camera_make,
      camera_model  = excluded.camera_model
  `);

  const deleteByDriveId = db.prepare<[string, string]>(`
    DELETE FROM files WHERE account_id = ? AND id = ?
  `);

  const findById = db.prepare<[string, string], FileRow>(`
    SELECT * FROM files WHERE account_id = ? AND id = ?
  `);

  const countByAccount = db.prepare<[string], { total: number }>(`
    SELECT COUNT(*) AS total FROM files WHERE account_id = ?
  `);

  // FTS5 search — trigram match (3+ char)
  const searchFts = db.prepare<[string, string, number], FileRow>(`
    SELECT f.*
    FROM files f
    JOIN files_fts fts ON fts.rowid = f.rowid
    WHERE f.account_id = ?
      AND fts.name MATCH ?
    ORDER BY rank
    LIMIT ?
  `);

  // LIKE fallback for 1–2 char queries
  const searchLike = db.prepare<[string, string, number], FileRow>(`
    SELECT * FROM files
    WHERE account_id = ? AND name LIKE ? ESCAPE '\\'
    ORDER BY modified_at DESC
    LIMIT ?
  `);

  const listPhotos = db.prepare<[string, number, number], FileRow>(`
    SELECT * FROM files
    WHERE account_id = ?
      AND (mime_type LIKE 'image/%' OR mime_type LIKE 'video/%')
      AND trashed = 0
    ORDER BY
      CASE WHEN taken_at IS NOT NULL THEN taken_at ELSE modified_at END DESC
    LIMIT ? OFFSET ?
  `);

  const listNonMedia = db.prepare<[string, number, number], FileRow>(`
    SELECT * FROM files
    WHERE account_id = ?
      AND mime_type NOT LIKE 'image/%'
      AND mime_type NOT LIKE 'video/%'
      AND trashed = 0
    ORDER BY modified_at DESC
    LIMIT ? OFFSET ?
  `);

  const listAll = db.prepare<[string, number, number], FileRow>(`
    SELECT * FROM files
    WHERE account_id = ? AND trashed = 0
    ORDER BY modified_at DESC
    LIMIT ? OFFSET ?
  `);

  const listStarred = db.prepare<[string, number, number], FileRow>(`
    SELECT * FROM files
    WHERE account_id = ? AND starred = 1 AND trashed = 0
    ORDER BY modified_at DESC
    LIMIT ? OFFSET ?
  `);

  return {
    /** Insert or update a file row. FTS triggers fire automatically. */
    upsertFile(input: UpsertFileInput): void {
      upsert.run(input);
    },

    /** Batch upsert inside a single transaction — use for bulk page imports. */
    upsertBatch(inputs: UpsertFileInput[]): void {
      const tx = db.transaction((rows: UpsertFileInput[]) => {
        for (const row of rows) {
          upsert.run(row);
        }
      });
      tx(inputs);
    },

    /** Delete by Google Drive file ID. FTS delete trigger fires automatically. */
    deleteFile(accountId: string, driveId: string): void {
      deleteByDriveId.run(accountId, driveId);
    },

    /** Find one file by account + Drive ID. */
    findById(accountId: string, driveId: string): FileRow | undefined {
      return findById.get(accountId, driveId);
    },

    /** Total indexed files for an account. */
    countByAccount(accountId: string): number {
      return countByAccount.get(accountId)?.total ?? 0;
    },

    /**
     * Hybrid search:
     *   - query.length >= 3 → FTS5 trigram MATCH (fast)
     *   - query.length 1–2  → LIKE '%q%' fallback
     */
    searchFiles(accountId: string, query: string, limit = 50): FileRow[] {
      if (query.length >= 3) {
        // Escape FTS5 special chars — wrap in double quotes for exact phrase
        const ftsQuery = `"${query.replace(/"/g, '""')}"`;
        return searchFts.all(accountId, ftsQuery, limit);
      }
      // LIKE fallback: escape % and _ in the query, wrap in wildcards
      const likeQuery =
        '%' + query.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
      return searchLike.all(accountId, likeQuery, limit);
    },

    /** Paginated photo listing (image/* + video/*), by taken_at then modified_at. */
    listPhotos(accountId: string, opts: { offset: number; limit: number }): FileRow[] {
      return listPhotos.all(accountId, opts.limit, opts.offset);
    },

    /** Paginated non-media file listing, by modified_at. */
    listFiles(accountId: string, opts: { offset: number; limit: number }): FileRow[] {
      return listNonMedia.all(accountId, opts.limit, opts.offset);
    },

    /** Paginated listing of all non-trashed files. */
    listAll(accountId: string, opts: { offset: number; limit: number }): FileRow[] {
      return listAll.all(accountId, opts.limit, opts.offset);
    },

    /** Paginated listing of starred files. */
    listStarred(accountId: string, opts: { offset: number; limit: number }): FileRow[] {
      return listStarred.all(accountId, opts.limit, opts.offset);
    },
  };
}

export type FileQueries = ReturnType<typeof buildFileQueries>;

