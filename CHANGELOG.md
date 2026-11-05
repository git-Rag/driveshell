# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Phase 0: Monorepo scaffold (pnpm workspaces, TypeScript strict, ESLint flat config, Prettier,
  Vitest, Playwright, CI, community files, ADRs, documentation skeleton).
- **Windows Desktop Packaging (Stage 6)**: Release installer packaged with Tauri v2 and NSIS
  (Nullsoft Scriptable Install System) yielding `Sunflower Drive_0.1.0_x64-setup.exe` (2.88 MiB)
  with bundled multi-resolution app icons, sidecar scaffolding, and single-instance handling.
- **Timeline Jump Navigation**: Month Chip popover with a 4x3 month grid, dynamic year selector,
  filter-aware SQLite month query, and keyboard navigation (`G`, `Home`, `End`, `Esc`, Arrow keys).
- **Tier 2 Video Transcoding (FFmpeg)**: On-demand transcoding of unsupported video formats (HEVC,
  AVCHD .MTS) to universal H.264/AAC with FastStart streaming and local disk caching under
  `<DATA_DIR>/transcode_cache/`.
- **Tier 1 Video Format Fallback**: Clear in-lightbox error panel for unsupported codecs (e.g.
  HEVC/H.265 in Firefox) with direct Drive and Download fallback actions and negative session
  caching.
- **Tier 2 Video Transcoding Architecture**: Complete on-demand local transcode design using FFmpeg
  / Rust sidecar in `docs/portability.md`.
- **Playwright Video & Timeline E2E Suites**: Automated tests verifying tile UX, fallback panels,
  and keyboard navigation under real browser engines.

### Changed

- **Gallery Virtualization**: Section-level DOM virtualization for the 5,700-item photo grid,
  reducing fast-scroll DOM nodes by 76.3% and JS heap by 63.3%.
- **Scroll Reflow Elimination**: Replaced synchronous `getBoundingClientRect()` loops on native
  scroll ticks with passive, unthrottled `IntersectionObserver` observing sticky section headers.
- **Video UX**: Enforced poster thumbnail tiles (`<img>` only, no `<video>` in grid), lightbox
  `preload="metadata"`, src cleanup on close/unmount, and volume persistence in `localStorage`.

### Fixed

- **Stream Route Past-EOF Range (RFC 7233)**: Corrected `/api/media/:id/stream` returning HTTP 500
  on past-EOF ranges to return HTTP 416 with `Content-Range: bytes */size`. Added client abort
  cleanup.
- **Thundering Herd 429 Storm**: Eliminated console HTTP 429 flood during fast scrolls via image
  debouncing and a 1.5s session refresh cooldown guard in `ensureSession()`.
- **Favicon 404**: Bundled `favicon.ico` in `apps/web/public` to eliminate 404 network errors on
  initial page load.
- **Junk File Filter**: Excluded TypeScript declaration files (`.d.ts`, `.d.mts`, `.d.cts`) and code
  directories (`node_modules`, `.git`, `__pycache__`, `.venv`) from Photos views.
