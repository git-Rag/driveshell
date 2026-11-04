# ADR 0005 — Desktop packaging: Tauri v2 (Phase 10, deferred)

**Date:** 2024  
**Status:** Accepted (implementation deferred to Phase 10)

## Context

DriveShell runs as a Node.js server + React web app. For a polished desktop experience, we want:

- A native system-tray icon and window (not just "run `pnpm dev` in a terminal").
- Auto-start and lifecycle management (start the server when the app opens, stop it when it closes).
- Signed, distributable installers for Windows (and later macOS/Linux).

## Options considered

| Option                 | Notes                                                                 |
| ---------------------- | --------------------------------------------------------------------- |
| **Electron**           | Ships Chromium + Node.js (~200 MB). Mature ecosystem.                 |
| **Tauri v2**           | Ships a WebView (uses OS WebView) + Rust sidecar. ~8–15 MB installer. |
| **PWA / bare browser** | No installer, no tray icon. Poor UX for a local app.                  |
| **WinUI / native**     | Rewrite the UI; impractical.                                          |

## Decision

**Tauri v2** — the Fastify server runs as a bundled binary sidecar; Tauri manages its lifecycle. The
web UI is served by the sidecar and rendered in the OS WebView (Edge/WebView2 on Windows, WKWebView
on macOS, WebKitGTK on Linux).

## Rationale

- Significantly smaller installer than Electron.
- Tauri v2 is stable, has strong Windows support, and the sidecar pattern is well-documented.
- The Fastify server is already self-contained; bundling it as a sidecar binary (via `pkg` or Rust's
  `Command::new_sidecar`) is straightforward.
- If WebView2 compatibility issues arise on Windows, we will evaluate an Electron fallback via a new
  ADR at that time.

## Consequences

- Phase 10 must write an ADR on the exact sidecar bundling approach (pkg vs. standalone executable
  compilation).
- The server must remain usable as a plain Node.js process (no Tauri-specific code in the server).
- WebView2 must be available on the user's machine (pre-installed on Windows 10 1803+ via Windows
  Update).
