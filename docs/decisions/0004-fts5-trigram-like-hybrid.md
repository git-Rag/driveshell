# ADR 0004 — FTS5 search: trigram tokenizer + LIKE fallback for short queries

**Date:** 2024  
**Status:** Accepted

## Context

DriveShell needs fast full-text search over file names. The standard FTS5 tokenizer (unicode61)
supports prefix matching but not substring matching. Options:

**Option A:** Default `unicode61` tokenizer — fast, small index, prefix only.  
**Option B:** `trigram` tokenizer — substring matching anywhere in the name, ~3× larger index.  
**Option C:** Hybrid — `trigram` for queries ≥ 3 characters, `LIKE '%q%'` scan for 1–2 character
queries.

## Decision

Use **Option C**: FTS5 with the `trigram` tokenizer for queries of 3 or more characters. Fall back
to a `LIKE '%query%'` scan on the `files` table for 1–2 character queries.

```sql
-- 3+ chars: fast FTS5
SELECT f.* FROM files f
JOIN files_fts fts ON fts.rowid = f.rowid
WHERE files_fts MATCH 'query*'
  AND f.trashed = 0

-- 1-2 chars: LIKE scan (acceptable on < 5k–100k rows)
SELECT * FROM files
WHERE name LIKE '%q%' AND trashed = 0
```

## Rationale

- Substring matching (finding "vacation" when searching "cat") is natural for photo file names.
- Trigram index on < 100k rows is well under 100 MB.
- 1–2 character queries are rarely typed for intentional search; the LIKE scan is fast enough at our
  target scale and avoids false-positive noise from trigram matches.
- The update trigger uses `AFTER UPDATE OF name` (not `AFTER UPDATE`) so starring, rotating, or
  syncing metadata fields does not rewrite the FTS index unnecessarily.

## Consequences

- Requires SQLite 3.38+ for the trigram tokenizer. `better-sqlite3` bundles its own SQLite
  (currently 3.45+), so there is no system dependency.
- The `files_fts` FTS5 table must declare `content='files'` and `content_rowid='rowid'` and use the
  three-trigger pattern (insert/update/delete) with the rowid from ADR 0002.
- Search queries must be parameterized and length-checked before choosing the FTS vs LIKE path.
