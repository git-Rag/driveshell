# Video Playback & Gallery Smoothness Audit

**Date:** November 5, 2026  
**Branch:** `hardening/pass-1`  
**Author:** Pair Programming Agent & System Engineer

---

## 1. Part A: Video Playback Errors & Diagnosis

### 1.1 Problem Statement

Several videos (specifically Snapchat MP4 recordings) failed to play in the lightbox with native
browser errors. In Firefox, the console reported:

```
Media resource /api/media/<id>/stream could not be decoded, NS_ERROR_DOM_MEDIA_NOT_SUPPORTED_ERR (0x806e0003)
```

Simultaneously, range seeking and past-EOF requests on `/api/media/:id/stream` returned HTTP 500
Internal Server Error instead of HTTP 416 Range Not Satisfiable, causing video players to abort.

---

### 1.2 Automated Diagnostic Methodology

Using the automated test suite
[`scripts/diagnose-video-stream.ts`](file:///d:/Workspace/GithubRepos/DriveShell/scripts/diagnose-video-stream.ts)
on a verified read-only copy of the database
([`data/backups/diagnose_video_copy.db`](file:///d:/Workspace/GithubRepos/DriveShell/data/backups/diagnose_video_copy.db)):

1. **Sample Selection**: 3 failing-type Snapchat MP4 videos and 3 working-type standard H.264 MP4
   videos were selected.
2. **Stream Range Testing**: Tested `/api/media/:id/stream` across `bytes=0-1023`, middle range,
   last 1KB, past-EOF range, and no Range header. SHA-256 byte hashes of every served range slice
   were verified against exact slices of a direct full Drive download.
3. **Container & Codec Inspection**: Run via `ffprobe` (Gyan.FFmpeg v9.0.2) and binary MP4 atom
   parser to inspect FourCC codec tags, container profile, resolution, rotation, bitrate, and `moov`
   atom placement.
4. **Browser Playback Automation**: Executed real browser playback tests using Playwright with
   **Microsoft Edge** (`channel: "msedge"`, v156.0) and **Playwright Firefox** (v157.0), inspecting
   `canPlayType`, media events (`loadstart`, `loadedmetadata`, `canplay`, `playing`, `error`), and
   native error codes.

---

### 1.3 Upstream Drive Fetch & Stream Architecture Inspection

1. **Range Forwarding**: The Fastify server correctly forwards the `Range` request header to Google
   Drive via `headers: { Range: req.headers['range'] }`.
2. **Byte Parity**: All valid range requests (0-1023, middle, last 1KB) yielded status 206 with byte
   hashes matching the upstream direct Drive download 100%.
3. **Past-EOF Bug (STREAM_BUG)**: When requesting past-EOF ranges (e.g.
   `bytes=(size+1000)-(size+2000)`), Google Drive API returns or throws HTTP 416 Range Not
   Satisfiable. The server caught this in a generic catch handler and returned **HTTP 500**,
   violating RFC 7233 and causing browser video decoders to fail.
4. **Upstream 200 Slicing**: If an upstream intermediary or proxy returns 200 instead of 206 for a
   range request, the server lacked a stream slicing fallback.
5. **Abort Propagation**: Client disconnections (`req.raw.on('close')`) were not propagated to
   destroy the upstream Drive ReadableStream, leaking network buffers.
6. **Token Lifecycle**: Google OAuth tokens are validated on each incoming stream seek request via
   `getAuthenticatedDrive()`, ensuring fresh tokens for seeking.

---

### 1.4 Codec & Atom Box Analysis

- **Snapchat Videos**: Encoded in **HEVC / H.265 (`hvc1`)** inside an MP4 container. Furthermore,
  their `moov` metadata atom is located at the **END** of the file (after `mdat`), requiring the
  browser to make range requests to EOF before playback can begin.
- **Working Videos**: Encoded in **AVC / H.264 (`avc1`)** inside an MP4 container. Their `moov` atom
  is located at the **START** of the file (offset 48), allowing instant playback.
- **Browser Codec Support**:
  - **Firefox on Windows**: Does not support HEVC (`hvc1`/`hev1`) in standard HTML5 `<video>`
    elements (`NS_ERROR_DOM_MEDIA_NOT_SUPPORTED_ERR` /
    `PRemoteCDMActor: RemoteMediaManager is not available`).
  - **Microsoft Edge on Windows**: Plays HEVC when Windows Media Foundation HEVC Video Extensions
    are installed.

---

### 1.5 Diagnostic Verdict Table

| File Class         | ID Prefix    | File Name                                    | Codec (FourCC) | Container               | Moov Position | Stream Test         | Edge Playback | Firefox Playback    | Verdict                          |
| ------------------ | ------------ | -------------------------------------------- | -------------- | ----------------------- | ------------- | ------------------- | ------------- | ------------------- | -------------------------------- |
| Snapchat (Failing) | `1-CoWN3eGD` | Snapchat-759670278.mp4                       | hevc (hvc1)    | mov,mp4,m4a,3gp,3g2,mj2 | end           | PASS (hashes match) | PASS          | FAIL (decode error) | **CODEC_UNSUPPORTED_IN_BROWSER** |
| Snapchat (Failing) | `1-WawLxgrU` | Snapchat-193712038.mp4                       | hevc (hvc1)    | mov,mp4,m4a,3gp,3g2,mj2 | end           | PASS (hashes match) | PASS          | FAIL (decode error) | **CODEC_UNSUPPORTED_IN_BROWSER** |
| Snapchat (Failing) | `1-g1l_6cGa` | Snapchat-1477866440.mp4                      | hevc (hvc1)    | mov,mp4,m4a,3gp,3g2,mj2 | end           | PASS (hashes match) | PASS          | FAIL (decode error) | **CODEC_UNSUPPORTED_IN_BROWSER** |
| Standard (Working) | `1Bm7A9pa1b` | WhatsApp Video 2026-09-14 at 10.07.47 PM.mp4 | h264 (avc1)    | mov,mp4,m4a,3gp,3g2,mj2 | start         | PASS (hashes match) | PASS          | PASS                | **OK**                           |
| Standard (Working) | `1ZQrH5kEGz` | VID-20261011-WA0008.mp4                      | h264 (avc1)    | mov,mp4,m4a,3gp,3g2,mj2 | start         | PASS (hashes match) | PASS          | PASS                | **OK**                           |
| Standard (Working) | `1r2bAT9ytQ` | WA_1788903806708.mp4                         | h264 (avc1)    | mov,mp4,m4a,3gp,3g2,mj2 | start         | PASS (hashes match) | PASS          | PASS                | **OK**                           |

---

### 1.6 Fix Strategy

1. **Server Stream Route Hardening**:
   - Detect invalid and past-EOF range requests upfront and in the Drive API catch block; return
     **HTTP 416** with `Content-Range: bytes */size`.
   - Propagate client aborts (`req.raw.on('close')`) to destroy upstream Node.js streams.
   - Add stream slicing fallback when upstream responds with HTTP 200 for a range query.
2. **Frontend Unsupported Codec Panel (Tier 1)**:
   - In
     [`PhotoLightbox.tsx`](file:///d:/Workspace/GithubRepos/DriveShell/apps/web/src/features/gallery/PhotoLightbox.tsx),
     catch `<video onError>` and detect unsupported codecs.
   - Replace "Video can't be played because the file is corrupt" with a clean panel:
     - Header: _"This browser can't play this video's format"_
     - Detected codec badge (e.g., `HEVC / H.265`)
     - Hint: _"Open in Google Drive or use a desktop browser/app with HEVC support."_
     - Buttons: **Open in Google Drive** and **Download**.
     - Panel background rendered from the Drive thumbnail.
     - Negative session cache: remember failed playback per file ID in a session `Set` to prevent
       retry loops.
3. **Video UX Polish**:
   - Verify grid tiles use poster thumbnails only (`<img>`, no `<video>`).
   - Lightbox `<video>` uses `preload="metadata"`.
   - On close or navigation, video pauses and cleans up `src = ''`.
   - Video volume and mute state persist in `localStorage`.
4. **Tier 2 Transcoding Architecture (Design Only)**:
   - Detailed specification in
     [`docs/portability.md`](file:///d:/Workspace/GithubRepos/DriveShell/docs/portability.md)
     covering local ffmpeg / Rust sidecar transcoding to H.264/AAC with caching.

---

## 2. Part B: Lag, Smoothness & Virtualization Audit

### 2.1 Initial Baseline Measurements (~5,700 Items)

Automated benchmarks were captured across 10 seconds of continuous fast-scroll top-to-bottom, 5
timeline scrub cycles, and 20 lightbox open/close cycles across the ~5,700 library items.

| Metric                                   | Dev Mode (`:5173`) | Prod Preview (`:4173`) | Analysis & Root Cause                                           |
| ---------------------------------------- | ------------------ | ---------------------- | --------------------------------------------------------------- |
| **Initial DOM Nodes**                    | 1,263              | 1,261                  | Initial mounted page layout                                     |
| **DOM Nodes (During Fast-Scroll)**       | **4,914**          | **5,792**              | Unbounded DOM; all scrolled items appended into DOM             |
| **DOM Nodes (Final)**                    | **12,076**         | **13,594**             | Severe DOM bloat ($>13\text{k}$ elements simultaneous)          |
| **JS Heap Used**                         | 22.3 MB -> 46.4 MB | 5.1 MB -> 25.9 MB      | 5x heap inflation retaining offscreen image textures & elements |
| **Long Tasks (>50ms)**                   | **110 tasks**      | 26 tasks               | Dev hit 23.2 seconds frozen; Preview hit 2.59 seconds frozen    |
| **Long Tasks Total Duration**            | **23,214 ms**      | 2,590 ms               | Severe main-thread blocking                                     |
| **Long Tasks Max Duration**              | **676 ms**         | 202 ms                 | Freezing animation frames and scrub interaction                 |
| **Average FPS / Dropped Frames (>33ms)** | 40 fps (134 drops) | 60 fps (103 drops)     | Stutter during rapid continuous scroll                          |
| **Network Requests Fired**               | 1,737 fired        | 2,054 fired            | Native `<img>` tags flooded request queue                       |
| **Network Requests Cancelled**           | 0 cancelled        | 9 cancelled            | No offscreen request cancellation or abort                      |
| **Server `/health` Latency (p50 / p99)** | 4.4 ms / 35.7 ms   | 4.8 ms / 27.1 ms       | Socket saturation under peak thumbnail load                     |

---

### 2.2 Top 5 Hotspot Diagnosis & Console 429 Root Cause

1. **Hotspot 1: Unbounded DOM (Grid not virtualized)**:
   - _Problem_:
     [`GalleryView.tsx`](file:///d:/Workspace/GithubRepos/DriveShell/apps/web/src/features/gallery/GalleryView.tsx)
     appended every scrolled month section and every photo into the live DOM tree simultaneously. At
     ~5,700 items, the DOM swelled to **13,594 nodes**, drastically slowing style recalculation,
     reflow, and garbage collection.
2. **Hotspot 2: Layout Reflow Thrashing on Every Scroll Event**:
   - _Problem_: In `handleScroll`, the scroll handler iterated through all 50+ month sections
     calling `el.getBoundingClientRect()` and `container.getBoundingClientRect()` on every single
     native scroll event tick without throttling or rAF. Calling `getBoundingClientRect()` inside a
     scroll handler forces immediate synchronous reflows, causing the 110 long tasks / 23.2 seconds
     of main thread lockup in Dev.
3. **Hotspot 3: Image Request Flooding & HTTP 429 "Too Many Requests"**:
   - _Problem_: Native `<img loading="lazy">` queues all requests as tiles approach the viewport.
     During fast scrolling, over **2,000 requests** fired in parallel with zero cancellation. This
     saturated the browser connection pool and host socket stack.
   - _Console 429 Screenshot Root Cause_: In the user's browser console, rapid continuous
     fast-scrolling flooded the local server port with hundreds of concurrent connections,
     triggering HTTP 429 Too Many Requests on `/api/media/*` and `/health`. When `/health` failed,
     `ensureSession()` in `apps/web/src/lib/api.ts` reset its promise and fired cascading
     unthrottled retries for every in-flight request, turning a temporary saturation into a
     thundering herd storm.
4. **Hotspot 4: Expensive CSS & Filter Overhead on Active Elements**:
   - _Problem_: Tile overlays included `backdrop-blur-sm`, `backdrop-blur-md`, `hover:shadow-2xl`,
     and active hover transitions. During fast scroll, hover hit-testing on thousands of tiles
     forced continuous compositing layer re-evaluations.
5. **Hotspot 5: Unmemoized Tiles & $O(N^2)$ Index Lookups**:
   - _Problem_: Inside the tile mapping loop, `const globalIndex = photos.indexOf(file)` performed
     an $O(N^2)$ linear search over 5,700 items for every tile on every render ($5,700 \times 5,700
     \approx 32\text{M}$ iterations). Furthermore, every scroll state or month update re-rendered
     every tile.

---

### 2.3 Measured Results After Virtualization & Smoothing

| Metric                             | Before Fix (Prod Preview) | After Fix (Prod Preview) | Improvement                   |
| ---------------------------------- | ------------------------- | ------------------------ | ----------------------------- |
| **DOM Nodes (During Fast-Scroll)** | **5,792**                 | **1,374**                | **-76.3%** (strictly bounded) |
| **DOM Nodes (Final)**              | **13,594**                | **3,945**                | **-71.0%** reduction          |
| **JS Heap Used**                   | 25.9 MB                   | **9.5 MB**               | **-63.3%** lower memory       |
| **Dropped Frames (>33ms)**         | 103 drops                 | **58 drops**             | **-43.7%** smoother animation |
| **Layout Reflow Thrashing**        | Synchronous on every tick | **Zero (passive IO)**    | Completely eliminated         |
| **Favicon 404**                    | Present                   | **200 OK** (ICO bundled) | Fixed                         |
| **Session Retry Herd**             | Thundering herd           | **1.5s Cooldown Guard**  | Prevents cascading 429 storms |

---

## 3. Part C: Timeline Jump Navigation

### 3.1 Architecture & UX Design

To solve long navigation traversals across 5,700 items spanning 5+ years:

1. **Interactive Month Chip**: Clicking the sticky month label opens an accessible 4x3 month popover
   (`TimelineJumpPopover.tsx`).
2. **Filter-Aware Backend**: Backend query `/api/files/months?filter=media` groups files by
   `COALESCE(taken_at, modified_at)` and returns available year/month combinations with file counts,
   excluding hidden code folders.
3. **Pure Helpers**: `packages/shared/src/media/timeline-helpers.ts` provides `formatMonthKey`,
   `parseMonthKey`, and `formatMonthLabel` with zero external dependencies.
4. **Keyboard & Fast Navigation**:
   - `G` opens the Timeline Jump popover from anywhere in the gallery.
   - `Home` / `End` jump instantly to the newest and oldest photos.
   - Arrow keys navigate the 4x3 month grid.
   - `Escape` dismisses the popover.
   - Floating quick-jump pills (**Newest** / **Oldest**) at the bottom right.

---

## 4. Part D: Full Verification Suite & Results

### 4.1 Automated Test Execution

- **Monorepo Typecheck**: `pnpm typecheck` passed with 0 errors across `@driveshell/shared`,
  `@driveshell/server`, `@driveshell/web`.
- **Unit & Integration Tests**: 155 tests passed (7 shared, 139 server, 9 web):
  - Shared: Pure timeline helpers & no-node-imports isolation.
  - Server: RFC 7233 range stream tests, 416 error handling, backoff resilience, security
    invariants, path safety, and SDV1 crypto.
  - Web: Video error fallback panel, timeline jump popover state, and vault crypto.
- **Playwright E2E Tests**: 4 passed using Microsoft Edge (`--workers=1`):
  - `smoke.spec.ts`: Page loads with 0 errors and 0 404s.
  - `timeline-jump.spec.ts`: Month popover opens on click or `G`, navigates, and closes on `Escape`.
  - `video-error-panel.spec.ts`: Lightbox renders clear unsupported format fallback with actions,
    never renders `<video>` elements in grid tiles.
- **Production Bundle Build**:
  - `apps/web/dist`: 106.34 KB gzip JS (budget: <150 KB), 8.91 KB gzip CSS.
  - Clean dev (`:5173`) and preview (`:4173`) verification with 0 console errors and 200 OK favicon.
