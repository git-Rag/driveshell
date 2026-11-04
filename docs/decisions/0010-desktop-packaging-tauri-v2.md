# 10. Desktop Packaging with Tauri v2

Date: 2026-11-04 Status: Accepted

## Context

Phase 10 delivers native desktop packaging for Windows (and macOS/Linux). As decided in ADR 0005, we
chose **Tauri v2** over Electron due to its minuscule installer footprint (~10 MB vs ~200 MB), fast
startup time, lower RAM usage, and native WebView2 integration on Windows 10/11.

## Architecture & Lifecycle

1. **WebView Frontend**:
   - The React 18 + Tailwind frontend is pre-built into `apps/web/dist` and embedded into the Tauri
     application binary or loaded via custom URI protocol.
2. **Server Sidecar**:
   - The DriveShell Fastify server runs as a background process listening on `127.0.0.1:3001` with
     strict CORS restrictions.
   - Tauri manages lifecycle initialization via `tauri-plugin-shell` on startup and gracefully stops
     the process on app close.
3. **Android & Mobile Readiness**:
   - Tauri v2 natively supports mobile targets (Android via Cargo APK and iOS via Xcode).
   - Because our frontend and cryptographic engine rely exclusively on the Web Crypto API and
     portable REST contracts, the exact same UI and encryption code can be compiled directly to
     Android in the future using `pnpm tauri android init` / `pnpm tauri android build`.

## Build Commands

- Dev mode: `pnpm desktop:dev`
- Release Windows bundle: `pnpm desktop:build`
