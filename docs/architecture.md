# DriveShell — Architecture

> Not affiliated with or endorsed by Google or Microsoft.

## Overview

DriveShell is a local-first application that gives Google Drive a fast, photo-first interface. It
syncs Drive metadata into a local SQLite database; all browsing, sorting, and searching happen
instantly against that local index.

## System diagram

```
┌──────────────────────────── user machine ─────────────────────────────┐
│                                                                       │
│  Browser (or Tauri window, Phase 10)                                  │
│  ┌──────────────┐    REST / SSE / streaming    ┌───────────────────┐  │
│  │  React 19 UI │ ───────────────────────────▶ │ Fastify           │  │
│  │  TanStack Q  │ ◀─────────────────────────── │ 127.0.0.1 only    │  │
│  │  Zustand     │                              └────────┬──────────┘  │
│  └──────────────┘                                       │             │
│                        ┌────────────────────────────────┼───────────┐ │
│                        │  SQLite (WAL, FTS5)            │           │ │
│                        │  data/thumbs/  (disk cache)    │           │ │
│                        │  Windows Credential Manager    │           │ │
│                        └────────────────────────────────┼───────────┘ │
└────────────────────────────────────────────────────────-┼─────────────┘
                                                          ▼
                                                Google Drive API v3
```

## Security invariants

- Server binds to `127.0.0.1` only. Never `0.0.0.0`.
- The UI never contacts Google directly. All network goes through the server.
- Per-launch random session token, delivered as an `HttpOnly SameSite=Strict` cookie set at startup.
  All `/api/*` routes require it, including setup routes. `/auth/callback` is the only exception
  (must be accessible to the browser redirect from Google), validated instead by PKCE + state.
- Strict `Host` and `Origin` header validation on every request.
- Tokens stored in the OS keychain (Windows Credential Manager / macOS Keychain / Linux Secret
  Service). Encrypted-file fallback if the native module fails.

## Repo layout

See the Implementation Plan artifact for the full tree.

## Data flow — sync

1. User links a Google account → OAuth PKCE loopback flow → tokens stored in keychain.
2. Server fetches `about.get` to hydrate the account row (permissionId, email, displayName,
   photoLink).
3. Full sync: `changes.getStartPageToken` → stored; `files.list` pages (media first, then rest) →
   batch-upserted into SQLite.
4. Incremental sync: `changes.list` from stored token every 5 minutes → upserts + removals.
5. UI reads only the local SQLite database. Thumbnails are proxied and cached by the server.

## Key design decisions

See `docs/decisions/` for ADRs:

- [0001](decisions/0001-monorepo-pnpm.md) — pnpm workspaces
- [0002](decisions/0002-sqlite-rowid-upsert.md) — SQLite rowid + ON CONFLICT upserts
- [0003](decisions/0003-account-id-permissionid.md) — account ID = Drive permissionId
- [0004](decisions/0004-fts5-trigram-like-hybrid.md) — FTS5 trigram + LIKE hybrid
- [0005](decisions/0005-tauri-phase10.md) — Tauri v2 desktop wrapper (Phase 10)
