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
