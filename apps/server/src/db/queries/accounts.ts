/**
 * Account DB queries — typed prepared-statement wrappers.
 *
 * All timestamps are INTEGER unix milliseconds (Date.now()).
 * All queries use better-sqlite3 prepared statements (synchronous, no pool needed).
 */

import type { Db } from '../connection';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccountStatus = 'ok' | 'syncing' | 'needs_reauth' | 'error';
export type ScopeLevel = 'readonly' | 'full';

export interface Account {
  id: string; // Drive permissionId
  email: string;
  display_name: string;
  avatar_url: string | null;
  scope_level: ScopeLevel;
  changes_page_token: string | null;
  full_sync_page_token: string | null;
  full_sync_stage: string | null;
  last_full_sync_at: number | null;
  last_incremental_at: number | null;
  status: AccountStatus;
  created_at: number;
}

export type AccountRow = Account; // alias for clarity in query return types

export interface UpsertAccountInput {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  scope_level: ScopeLevel;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function buildAccountQueries(db: Db) {
  const upsert = db.prepare<UpsertAccountInput>(`
    INSERT INTO accounts (id, email, display_name, avatar_url, scope_level, status, created_at)
    VALUES (@id, @email, @display_name, @avatar_url, @scope_level, 'ok', unixepoch() * 1000)
    ON CONFLICT(id) DO UPDATE SET
      email        = excluded.email,
      display_name = excluded.display_name,
      avatar_url   = excluded.avatar_url,
      scope_level  = CASE
        WHEN excluded.scope_level = 'full' THEN 'full'
        ELSE scope_level
      END
  `);

  const findById = db.prepare<[string], AccountRow>(`
    SELECT * FROM accounts WHERE id = ?
  `);

  const findAll = db.prepare<[], AccountRow>(`
    SELECT * FROM accounts ORDER BY created_at ASC
  `);

  const setStatus = db.prepare<[AccountStatus, string]>(`
    UPDATE accounts SET status = ? WHERE id = ?
  `);

  const remove = db.prepare<[string]>(`
    DELETE FROM accounts WHERE id = ?
  `);

  const updateSyncCursors = db.prepare<{
    full_sync_page_token: string | null;
    full_sync_stage: string | null;
    changes_page_token?: string | null;
    last_full_sync_at?: number | null;
    last_incremental_at?: number | null;
    id: string;
  }>(`
    UPDATE accounts SET
      full_sync_page_token = @full_sync_page_token,
      full_sync_stage      = @full_sync_stage,
      changes_page_token   = COALESCE(@changes_page_token, changes_page_token),
      last_full_sync_at    = COALESCE(@last_full_sync_at, last_full_sync_at),
      last_incremental_at  = COALESCE(@last_incremental_at, last_incremental_at)
    WHERE id = @id
  `);

  return {
    /** Upsert an account from Google's about.get response. */
    upsert(input: UpsertAccountInput): void {
      upsert.run(input);
    },

    /** Find one account by permissionId. */
    findById(id: string): AccountRow | undefined {
      return findById.get(id);
    },

    /** All accounts, oldest first. */
    findAll(): AccountRow[] {
      return findAll.all();
    },

    /** Update account status (e.g. 'needs_reauth', 'ok'). */
    setStatus(id: string, status: AccountStatus): void {
      setStatus.run(status, id);
    },

    /**
     * Remove an account.
     * Note: album_items and thumb_cache have no FK to accounts — the caller
     * (or a later phase's cleanup job) must delete those rows explicitly.
     */
    remove(id: string): void {
      remove.run(id);
    },

    /**
     * Update sync cursors after each sync page or upon completion.
     * Uses COALESCE so passing `undefined` leaves existing values intact.
     */
    updateSyncCursors(
      id: string,
      opts: {
        full_sync_page_token?: string | null;
        full_sync_stage?: string | null;
        changes_page_token?: string | null;
        last_full_sync_at?: number | null;
        last_incremental_at?: number | null;
      },
    ): void {
      updateSyncCursors.run({
        id,
        full_sync_page_token: opts.full_sync_page_token ?? null,
        full_sync_stage: opts.full_sync_stage ?? null,
        changes_page_token: opts.changes_page_token ?? null,
        last_full_sync_at: opts.last_full_sync_at ?? null,
        last_incremental_at: opts.last_incremental_at ?? null,
      });
    },
  };
}

export type AccountQueries = ReturnType<typeof buildAccountQueries>;
