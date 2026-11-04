# ADR 0007 — Sync Engine Design: Resumable Full Sync, External-Content FTS5, LIKE Fallback

**Date:** 2026-11-04  
**Status:** Accepted  
**Phase:** 2

---

## Context

Phase 2 introduces the Drive sync engine: a full scan of the user's Drive followed by incremental
updates via the Changes API.  Several design decisions were required.

---

## Decision 1 — Resumable Full Sync via Page Token Persistence

**Choice:** After every successful Drive `files.list` page (up to 1 000 files), persist the
`nextPageToken` into `accounts.full_sync_page_token` before processing the next page.

**Alternatives considered:**
- **In-memory only**: simple, but a crash/power-loss restarts the full scan from zero. With 100k+
  files this can take several minutes — unacceptable UX.
- **Checkpoint every N pages**: reduces writes but still risks repeating work on restart.
- **Write a separate progress table**: overkill; the accounts table already has nullable cursor columns.

**Rationale:** Storing the cursor after each page costs one SQLite write per 1 000 Drive API calls.
The SQLite write is negligible (WAL mode, synchronous). On restart, the runner reads the saved token
and continues from that page. `full_sync_stage` = `'done'` marks completion; `null` = not started.

---

## Decision 2 — No Media-First Stage

**Original plan:** A `media_first` stage would list image/* and video/* files first so photos appear
quickly before the rest of Drive is indexed.

**Actual decision:** Dropped. Drive v3 `files.list` does not support filtering by MIME prefix in a
way that is fast — `q: 'mimeType contains "image/"'` performs a full-index scan on Drive's side and
returns results in arbitrary order. The latency savings are unmeasurable. A single-pass full sync is
simpler, easier to resume, and surfaces all file types at the same rate.

---

## Decision 3 — External-Content FTS5 on `rowid`

**Choice:** Use `CREATE VIRTUAL TABLE files_fts USING fts5(name, content='files', content_rowid='rowid', tokenize='trigram')`.

**Alternatives considered:**
- **Shadow table (content='')**: requires explicit inserts into the FTS table AND the main table;
  the two can drift if a code path forgets the FTS write.
- **FTS5 with full content stored inside**: doubles storage for file names; FTS5 becomes the
  source-of-truth which is unusual and limits non-FTS queries.
- **External-content on rowid (chosen)**: triggers keep FTS in sync automatically. Only the `name`
  column is indexed (not rowid, not mime_type) — the FTS table stores no duplicate data.

**Why `AFTER UPDATE OF name` only:**  Starring, trashing, or updating thumbnail URLs must NOT
re-write the FTS index (expensive + unnecessary). SQLite `AFTER UPDATE OF col` syntax fires
only when that specific column changes.

---

## Decision 4 — LIKE Fallback for 1–2 Character Queries

**Choice:** Trigram tokenizer requires at least 3 characters for a meaningful token. Queries shorter
than 3 characters fall back to `LIKE '%q%' ESCAPE '\'`.

**Rationale:**
- 1–2 character searches are rare and typically typed as the user is still entering a query.
- LIKE on the files table with a `name` index is fast enough for small result sets (< 50 results).
- Triggering FTS5 trigram MATCH with fewer than 3 chars returns no results anyway, so the fallback
  provides a better UX with no additional complexity in the FTS schema.

---

## Decision 5 — SSE for Sync Progress (not WebSocket)

**Choice:** `GET /api/sync/progress` is a Server-Sent Events (SSE) endpoint using `reply.hijack()`
and `reply.raw` to write `data: {...}\n\n` frames directly.

**Rationale:**
- SSE is unidirectional (server → client) which matches the sync progress use case exactly.
- Browser `EventSource` API requires no extra libraries; auto-reconnects on drop.
- WebSocket adds bidirectional complexity and a separate upgrade handshake — unnecessary here.
- Fastify requires `reply.hijack()` for SSE because its normal send lifecycle ends the response.

---

## Consequences

- Full sync is crash-safe. Restart picks up from the last saved page token.
- FTS5 is always consistent with the files table via triggers (no manual sync required).
- Short queries degrade gracefully to LIKE instead of returning empty results.
- SSE requires Nginx/proxy `X-Accel-Buffering: no` header to prevent buffering (set in route).
