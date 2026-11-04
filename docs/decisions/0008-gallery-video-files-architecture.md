# ADR 0008 — Photo Gallery (OneDrive-style), Video Streaming, and Files Management

**Date:** 2026-11-04  
**Status:** Accepted  
**Phases:** 3, 4, 5

---

## Context

Users require a fast, distraction-free photo and media experience comparable to Microsoft OneDrive's
gallery, including:
1. Smooth photo zoom levels (1 to 4) with fluid scale transitions.
2. Right timeline year/date scrubber with live month indicator badge.
3. Native video playback with instant seek scrubbing.
4. Hierarchical file browsing (folder navigation, breadcrumbs, search, file operations).

---

## Decisions

### 1. OneDrive-Style Gallery & Smooth Zooming (Phase 3)

- **4-Level Zoom Matrix**:
  - Level 1: Compact (6-10 columns, square crop) for quick bird's-eye scanning.
  - Level 2: Standard (4-6 columns, square crop) matching OneDrive's default grid.
  - Level 3: Large (2-4 columns, 4:3 aspect) displaying rich metadata and camera tags.
  - Level 4: Immersive (1-2 columns, 16:10 aspect) for cinematic viewing.
- **Dynamic Floating Month Indicator**: An `IntersectionObserver` detects the top visible month
  section and updates the floating header badge (`September 2026`) live as the user scrolls.
- **Right Timeline Scrubber**: Displays distinct years (`2026`, `2025`, `2024`, ...) with click-to-jump
  smooth scrolling.

### 2. Thumbnail Disk Cache & Proxy (`GET /api/media/:fileId/thumb`)

- Drive's `thumbnailLink` is proxied and cached under `<dataDir>/thumbs/<fileId>_<size>.jpg`.
- Subsequent reads are served from disk with `Cache-Control: public, max-age=604800, immutable`.
- This insulates the UI from Drive API quota and ensures 60 fps scrolling even on 100k libraries.

### 3. Video Range Streaming (`GET /api/media/:fileId/stream`) (Phase 4)

- Fastify endpoint forwards the client's `Range: bytes=start-end` header to Drive v3 `files.get`.
- Streams response with `206 Partial Content`, `Content-Range`, and `Accept-Ranges: bytes`.
- Standard browser HTML5 `<video>` tags seek and scrub smoothly without buffering the entire file.

### 4. Hierarchical Files Browser (Phase 5)

- Uses `parent_id` in the `files` table to represent folder hierarchies.
- Folder-first sorting: `CASE WHEN mime_type = 'application/vnd.google-apps.folder' THEN 0 ELSE 1 END`.
- Recursive breadcrumb resolution from current folder up to root.
- Actions: Star/unstar, rename, and trash update the local SQLite database instantly.

---

## Consequences

- Ultra-fast gallery rendering without UI lag or external CDN dependencies.
- Video playback works out of the box directly in the browser lightbox.
- Files tab supports breadcrumb navigation, search, and file manipulation.
