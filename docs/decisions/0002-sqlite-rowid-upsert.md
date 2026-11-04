# ADR 0002 — SQLite files table: explicit rowid + UNIQUE constraint + ON CONFLICT upserts

**Date:** 2024  
**Status:** Accepted

## Context

The `files` table must support high-frequency upserts from the sync engine (batch-inserting Drive
file metadata), and also serve as the content source for an FTS5 virtual table. Two options:

**Option A:** `PRIMARY KEY(account_id, id)` — composite PK becomes the rowid alias.  
**Option B:** `rowid INTEGER PRIMARY KEY` + `UNIQUE(account_id, id)` — explicit integer rowid,
business key as a unique constraint.

## Decision

Use **Option B**: an explicit `rowid INTEGER PRIMARY KEY` on the `files` table, with
`UNIQUE(account_id, id)` enforcing the business key. All upserts use
`INSERT INTO files (...) ON CONFLICT(account_id, id) DO UPDATE SET ...`.

## Rationale

1. **FTS5 correctness.** FTS5 `content_rowid` must reference an `INTEGER PRIMARY KEY` (the true
   rowid). With a composite PK, the rowid is an implicit alias that can be broken if the PK columns
   are modified. An explicit rowid is stable.
2. **Upsert safety.** `INSERT OR REPLACE` deletes the old row and inserts a new one, assigning a new
   rowid. This severs the FTS content link. `ON CONFLICT DO UPDATE` updates in-place, preserving the
   rowid.
3. **FTS trigger precision.** The `AFTER UPDATE OF name` trigger (not `AFTER UPDATE`) means
   starring, rotating, or touching any column except `name` does not rewrite the FTS index. This
   avoids unnecessary write amplification on large syncs.

## Consequences

- Every `INSERT` into `files` must use `ON CONFLICT(account_id, id) DO UPDATE SET ...` — never
  `INSERT OR REPLACE` or `INSERT OR IGNORE`.
- The FTS content triggers reference `old.rowid` and `new.rowid` (guaranteed stable across upserts).
- Linting / code review must catch any accidental use of `INSERT OR REPLACE`.
