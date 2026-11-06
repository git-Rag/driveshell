# Project Sunflower — Roadmap

> Not affiliated with or endorsed by Google or Microsoft.

This roadmap tracks the planned phases of Project Sunflower. Each phase ends with a review before
the next begins.

## Phase status

| Phase | Name                                    | Status         |
| ----- | --------------------------------------- | -------------- |
| 0     | Foundation & plan                       | 🔄 In progress |
| 1     | Auth & setup wizard                     | ⬜ Not started |
| 2     | Sync engine                             | ⬜ Not started |
| 3     | Gallery                                 | ⬜ Not started |
| 4     | Video                                   | ⬜ Not started |
| 5     | Files tab                               | ⬜ Not started |
| 6     | Favorites, Albums, Moments              | ⬜ Not started |
| 7     | Multi-account polish                    | ⬜ Not started |
| 8     | Vault design review (no code)           | ⬜ Not started |
| 9     | Vault implementation                    | ⬜ Not started |
| 10    | Desktop packaging (Tauri v2)            | ⬜ Not started |
| 11    | People — local face grouping (optional) | ⬜ Not started |

## Good first issues (post-Phase 0)

These are small, well-defined tasks that don't require deep context. Ideal for new contributors.

| Label              | Description                                                                    |
| ------------------ | ------------------------------------------------------------------------------ |
| `good first issue` | Add a `--port` CLI flag to override the default server port                    |
| `good first issue` | Write unit tests for the EXIF date parser (YYYY:MM:DD HH:MM:SS edge cases)     |
| `good first issue` | Add a `data-testid` attribute to every interactive element in the setup wizard |
| `good first issue` | Write the justified-row layout math unit tests (aspect ratio bucketing)        |
| `good first issue` | Document the SQLite WAL checkpoint strategy                                    |
| `good first issue` | Add a health-check endpoint that reports DB and sync status (Phase 2+)         |
| `good first issue` | Write the LRU eviction algorithm for the thumbnail cache                       |

## Non-goals (do not propose)

- Two-way Drive sync / folder mirroring to local disk
- Cloud backend run by us
- Telemetry or analytics
- Google Photos API
- AI features before Phase 11
