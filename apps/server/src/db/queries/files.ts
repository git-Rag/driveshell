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

export interface PhotoMonthBucket {
  monthKey: string; // e.g. "2026-09"
  label: string;    // e.g. "September 2026"
  year: number;     // 2026
  count: number;
  latestTime: number;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}

export interface UpdateFileInput {
  name?: string | null | undefined;
  starred?: number | undefined;
  trashed?: number | undefined;
  parent_id?: string | null | undefined;
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

  const countPhotos = db.prepare<[string], { total: number }>(`
    SELECT COUNT(*) AS total FROM files
    WHERE account_id = ?
      AND (mime_type LIKE 'image/%' OR mime_type LIKE 'video/%')
      AND trashed = 0
  `);

  const photoMonthsStmt = db.prepare<[string], { month_key: string; total: number; latest_time: number }>(`
    SELECT
      strftime('%Y-%m', datetime(CASE WHEN taken_at IS NOT NULL THEN taken_at/1000 ELSE modified_at/1000 END, 'unixepoch')) AS month_key,
      COUNT(*) AS total,
      MAX(CASE WHEN taken_at IS NOT NULL THEN taken_at ELSE modified_at END) AS latest_time
    FROM files
    WHERE account_id = ?
      AND (mime_type LIKE 'image/%' OR mime_type LIKE 'video/%')
      AND trashed = 0
    GROUP BY month_key
    ORDER BY latest_time DESC
  `);

  const updateMetaStmt = db.prepare<{
    account_id: string;
    id: string;
    name?: string | null;
    starred?: number | null;
    trashed?: number | null;
    parent_id?: string | null;
  }>(`
    UPDATE files SET
      name = COALESCE(@name, name),
      starred = COALESCE(@starred, starred),
      trashed = COALESCE(@trashed, trashed),
      parent_id = CASE WHEN @parent_id IS NOT NULL THEN @parent_id ELSE parent_id END
    WHERE account_id = @account_id AND id = @id
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

    /** Total count of photos and videos. */
    countPhotos(accountId: string): number {
      return countPhotos.get(accountId)?.total ?? 0;
    },

    /** Group photos by month for timeline scrubber and section headers. */
    getPhotoMonths(accountId: string): PhotoMonthBucket[] {
      const rows = photoMonthsStmt.all(accountId);
      const MONTH_NAMES = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      return rows.map((r) => {
        const [yearStr, monthStr] = r.month_key.split('-');
        const year = parseInt(yearStr ?? '2026', 10);
        const monthNum = parseInt(monthStr ?? '1', 10);
        const monthName = MONTH_NAMES[monthNum - 1] ?? monthStr;
        return {
          monthKey: r.month_key,
          label: `${monthName} ${year}`,
          year,
          count: r.total,
          latestTime: r.latest_time,
        };
      });
    },

    /**
     * List files and folders inside a given parent folder.
     * Orders folders first, then files, sorted by chosen field.
     */
    listByParent(
      accountId: string,
      parentId: string | null,
      opts: {
        offset: number;
        limit: number;
        search?: string | undefined;
        sortBy?: 'name' | 'modified_at' | 'size_bytes' | undefined;
        sortDir?: 'asc' | 'desc' | undefined;
      },
    ): { files: FileRow[]; total: number } {
      const sortField =
        opts.sortBy === 'name' ? 'name' : opts.sortBy === 'size_bytes' ? 'size_bytes' : 'modified_at';
      const sortDirection = opts.sortDir === 'asc' ? 'ASC' : 'DESC';

      let sql = `
        SELECT * FROM files
        WHERE account_id = ? AND trashed = 0
      `;
      const params: (string | number)[] = [accountId];

      if (parentId === null) {
        // Root files: either parent_id IS NULL or parent_id = ''
        sql += ` AND (parent_id IS NULL OR parent_id = '')`;
      } else {
        sql += ` AND parent_id = ?`;
        params.push(parentId);
      }

      if (opts.search?.trim()) {
        sql += ` AND name LIKE ? ESCAPE '\\'`;
        const escaped =
          '%' + opts.search.trim().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
        params.push(escaped);
      }

      // Count query before ordering & limit
      const countSql = `SELECT COUNT(*) AS total FROM (${sql})`;
      const totalRow = db.prepare<typeof params, { total: number }>(countSql).get(...params);
      const total = totalRow?.total ?? 0;

      // Folders always at the top, then sort by chosen column
      sql += `
        ORDER BY
          CASE WHEN mime_type = 'application/vnd.google-apps.folder' THEN 0 ELSE 1 END ASC,
          ${sortField} ${sortDirection}
        LIMIT ? OFFSET ?
      `;
      params.push(opts.limit, opts.offset);

      const files = db.prepare<typeof params, FileRow>(sql).all(...params);
      return { files, total };
    },

    /**
     * Recursively resolve breadcrumb trail from a current folder up to root.
     */
    getBreadcrumbs(accountId: string, currentFolderId: string | null): BreadcrumbItem[] {
      if (!currentFolderId) return [];

      const trail: BreadcrumbItem[] = [];
      let curId: string | null = currentFolderId;
      const visited = new Set<string>();

      while (curId && !visited.has(curId)) {
        visited.add(curId);
        const folder = findById.get(accountId, curId);
        if (!folder) break;
        trail.unshift({ id: folder.id, name: folder.name });
        curId = folder.parent_id;
      }

      return trail;
    },

    /** Update file metadata in SQLite (starred, trashed, rename, parent). */
    updateFileMeta(accountId: string, id: string, updates: UpdateFileInput): void {
      updateMetaStmt.run({
        account_id: accountId,
        id,
        name: updates.name ?? null,
        starred: updates.starred ?? null,
        trashed: updates.trashed ?? null,
        parent_id: updates.parent_id ?? null,
      });
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

