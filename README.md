<div align="center">

# PROJECT SUNFLOWER

### Local-First · Zero-Telemetry · High-Performance Google Drive Client & Photo Suite

**Private Personal Cloud Architecture · Fastify 5 · React 19 · SQLite WAL + FTS5 · Tauri v2**

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)](https://fastify.dev)
[![SQLite](<https://img.shields.io/badge/SQLite-WAL%20%2B%20FTS5%20(7%20Migrations)-003B57?logo=sqlite&logoColor=white>)](https://sqlite.org)
[![Tauri](https://img.shields.io/badge/Tauri-v2%20Desktop-FFC131?logo=tauri&logoColor=black)](https://tauri.app)
[![Android](<https://img.shields.io/badge/Android-APK%20Ready%20(API%2026%2B)-3DDC84?logo=android&logoColor=white>)](#android-mobile-release)
[![Windows](https://img.shields.io/badge/Windows-x64%20Installer%20Ready-0078D6?logo=windows&logoColor=white)](#windows-desktop-release)
[![Capacitor](https://img.shields.io/badge/Capacitor-v7-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com)
[![Tests](https://img.shields.io/badge/Tests-172%20pass%2C%200%20fail-brightgreen)](#testing--verification)
[![Telemetry](https://img.shields.io/badge/Telemetry-Zero%20Egress-red)](#security-invariants)
[![License](https://img.shields.io/badge/License-MIT-blue)](#license)

</div>

---

## Overview

**Project Sunflower** is an autonomous, local-first desktop application and private photo suite for
Google Drive. It decouples metadata management, indexing, browsing, and media presentation from
cloud round-trips, delivering instant, native-speed interaction over personal cloud libraries
containing hundreds of thousands of items.

> **Core Philosophy:** Cloud storage is for **durability**. Local hardware is for **compute,
> indexing, and presentation**. Your interface should never pause for a remote network round-trip
> simply to sort or view your personal memories.

---

## Table of Contents

- [Overview](#overview)
- [Releases](#releases)
  - [Windows Desktop Release](#windows-desktop-release)
  - [Android Mobile Release](#android-mobile-release)
- [Architecture & Data Flow](#architecture--data-flow)
  - [Desktop Architecture (Tauri + Fastify + SQLite)](#desktop-architecture-tauri--fastify--sqlite)
  - [Android Mobile Architecture (Capacitor + IndexedDB + Direct REST)](#android-mobile-architecture-capacitor--indexeddb--direct-rest)
- [Core Capabilities](#core-capabilities)
  - [1. Ultra-Smooth Virtualized Photo Gallery](#1-ultra-smooth-virtualized-photo-gallery)
  - [2. Timeline Jump & Month Picker](#2-timeline-jump--month-picker)
  - [3. High-Throughput Media Streaming](#3-high-throughput-media-streaming)
  - [4. Tier-2 On-Demand FFmpeg Video Transcoder](#4-tier-2-on-demand-ffmpeg-video-transcoder)
  - [5. Client-Side Zero-Knowledge Encrypted Vault (SDV1 AEAD)](#5-client-side-zero-knowledge-encrypted-vault-sdv1-aead)
  - [6. Sub-5ms FTS5 Trigram Full-Text Search](#6-sub-5ms-fts5-trigram-full-text-search)
  - [7. Virtual Albums & Starred Media](#7-virtual-albums--starred-media)
  - [8. Native Mobile Gestures & Offline Sync](#8-native-mobile-gestures--offline-sync)
- [Design Decisions & Invariants](#design-decisions--invariants)
- [Security Invariants](#security-invariants)
- [Performance Scoreboard](#performance-scoreboard)
  - [Database Query Benchmarks](#database-query-benchmarks)
  - [Server & Engine Throughput](#server--engine-throughput)
- [Workspace Structure](#workspace-structure)
- [Developer Quick Start](#developer-quick-start)
  - [Prerequisites](#prerequisites)
  - [1. Installation](#1-installation)
  - [2. Running in Development Mode](#2-running-in-development-mode)
  - [3. Running Test Suites](#3-running-test-suites)
  - [4. Building the Windows Installer](#4-building-the-windows-installer)
  - [5. Building the Android APK](#5-building-the-android-apk)
- [Testing & Verification](#testing--verification)
- [License](#license)

---

## Releases

### Windows Desktop Release

Project Sunflower is packaged as a standalone, self-contained Windows desktop application. It
requires **no separate Node.js installation, no database setup, and no terminal commands** for end
users.

#### Release Package

- **Executable:** [`Project-Sunflower-Setup-1.0.0.exe`](Project-Sunflower-Setup-1.0.0.exe) _(and in
  `src-tauri/target/release/bundle/nsis/Project Sunflower_1.0.0_x64-setup.exe`)_
- **Architecture:** `x64`
- **Installer Type:** NSIS Solid LZMA Compressed Installer (~26.4 MB)
- **Target OS:** Windows 10 / Windows 11 (64-bit)

#### Autonomous Architecture Highlights

1. **Embedded Node.js Runtime & Server Sidecar:**  
   The application bundles its own stripped Node.js runtime (`resources/bin/node.exe`) and
   production-bundled Fastify server (`resources/server/server.cjs`). On launch, the Tauri desktop
   shell spawns the local backend on loopback interface `127.0.0.1:3001` silently without flashing
   console windows.
2. **Pre-Compiled Native Addons:**  
   Ships with native MSVC binaries for `better-sqlite3` and `@napi-rs/keyring` (Windows Credential
   Manager).
3. **Inlined Database Migrations:**  
   All 7 relational migrations are compiled directly into the application
   (`embedded-migrations.ts`), executing automatically on first boot in
   `%LOCALAPPDATA%\ProjectSunflower\data\sunflower.db`.
4. **Seamless Browser OAuth with PKCE:**  
   When connecting a Google account, Project Sunflower opens your system's default browser (Edge,
   Chrome, Firefox, or Brave) using PKCE. Upon user consent, the callback page presents a verified
   success panel, and the desktop app automatically detects the authorization via daemon polling and
   opens your gallery.
5. **Clean Process Teardown:**  
   Window closure safely kills child server processes and releases all database locks and open file
   descriptors.

---

### Android Mobile Release

Project Sunflower is also available as a standalone, zero-server Android mobile application
(`.apk`). It connects directly to your Google Drive via TLS 1.3 using OAuth 2.0 PKCE, caching media
metadata, albums, and encrypted vaults locally on your phone. It requires **no separate computer, no
running server, and no cloud middlemen**.

#### Release Package

- **Package:** [`Project-Sunflower-1.0.0-debug.apk`](Project-Sunflower-1.0.0-debug.apk) _(or
  production release `Project-Sunflower-1.1.0.apk`)_
- **Target OS:** Android 8.0 (Oreo, API 26) through Android 15+ (API 35+)
- **Architecture:** Universal ARM64 / ARMv7 / x86_64 APK (~5.3 MB)
- **Engine:** Capacitor 7 + Chromium WebKit Bridge + Native HTTP

#### Standalone Mobile Architecture Highlights

1. **Direct Google Drive v3 REST Integration:**  
   Unlike the desktop app which uses a Fastify sidecar, the Android app makes direct, authenticated
   HTTPS requests to Google Drive v3 via `CapacitorHttp` native networking. This completely
   eliminates CORS issues and WebView network throttling while delivering full native speed.
2. **Offline-First Local Storage (`SunflowerMobileDB`):**  
   Metadata for your photos, videos, and albums is saved directly into local IndexedDB (`files`,
   `thumbnails`, `albums`, `vault_files`). Browsing, sorting, and viewing cached content works
   seamlessly even with airplane mode enabled.
3. **Hardware & Gesture Back Navigation:**  
   Integrated with Android's system back button and predictive back gestures via `@capacitor/app`.
   Pressing back fluidly closes the lightbox, dismisses album pickers, or navigates from child views
   (Albums, Favorites, Private Vault) back to the main Gallery without accidentally exiting the
   application.
4. **Mobile Touch & Drag Gestures:**  
   Full gesture support in the Lightbox: swipe left for next photo, swipe right for previous photo,
   with real-time finger translation and velocity-sensitive snaps. Pinch-to-zoom and double-tap zoom
   for high-res photo inspection.
5. **Zero-Knowledge Mobile Vault:**  
   The Private Vault runs 100% offline using the browser's native `SubtleCrypto` API (PBKDF2 key
   derivation with 100,000 iterations + AES-256-GCM authenticated encryption). Master passphrases
   and decryption keys never touch disk or network.
6. **Adaptive Safe-Area Inset Handling:**  
   Fully respects Android display cutouts, punch-hole cameras, and system navigation bars
   (`paddingTop: max(env(safe-area-inset-top), 48px)`), eliminating header overlapping across all
   phone brands (Samsung, Pixel, OnePlus, Xiaomi).
7. **Pixel-Perfect Adaptive Icons:**  
   Ships with custom adaptive app launcher icons across all standard density buckets (`mdpi`,
   `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi`) featuring the centered golden sunflower on a deep-blue
   canvas with glowing cyan border.

---

## Architecture & Data Flow

### Desktop Architecture (Tauri + Fastify + SQLite)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Tauri v2 Desktop Shell (Rust)                            │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                        React 19 Frontend SPA (Vite)                       │  │
│  │  Virtualized Gallery · Lightbox · FTS5 Search · Month Picker · Vault UI   │  │
│  └─────────────────────────────────────┬─────────────────────────────────────┘  │
│                                        │ Loopback HTTP (127.0.0.1:3001)         │
│                                        │ Session Token Header / Cookie Guard    │
│                                        ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                     Fastify 5 Server (Background Sidecar)                 │  │
│  │  ├── Auth & PKCE Engine    ──► Windows Credential Manager (@napi-rs)      │  │
│  │  ├── Drive Sync Engine     ──► Google Drive API v3 (Incremental Changes)  │  │
│  │  ├── Media & Stream Proxy  ──► RFC 7233 Range Streaming & Safe Mime Filter│  │
│  │  ├── Tier-2 Transcoder     ──► On-Demand FFmpeg (H.264/AAC FastStart)     │  │
│  │  └── Database Layer        ──► SQLite 3 (WAL Mode + FTS5 Trigram Indices) │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                        │ Local Disk Path                        │
│                                        ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                  Isolated Storage (%LOCALAPPDATA%\ProjectSunflower)       │  │
│  │  ├── sunflower.db          ──► Relational Metadata Index & Accounts      │  │
│  │  ├── thumbs/               ──► WebP Disk Thumbnail Cache (LRU Bounded)   │  │
│  │  └── transcode_cache/      ──► FastStart Transcoded Universal MP4 Video   │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Android Mobile Architecture (Capacitor + IndexedDB + Direct REST)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       Android Mobile Shell (Capacitor 7)                        │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                     React 19 Frontend SPA (Vite Mobile)                   │  │
│  │   Pinterest Grid · Photo Lightbox · Swipe Gestures · Back Button Manager  │  │
│  │   Vault UI · Local Albums · Favorites Filter · Safe-Area Inset Engine     │  │
│  └─────────────────────────────────────┬─────────────────────────────────────┘  │
│                                        │ WebKit / Chromium Bridge Engine        │
│                                        ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                 Mobile Client Abstraction Layer (mobile-client.ts)        │  │
│  │  ├── Direct Drive v3 Client  ──► CapacitorHttp Native Networking          │  │
│  │  ├── OAuth 2.0 PKCE Auth     ──► @capacitor/browser + Deep Link Callback  │  │
│  │  ├── Offline Cache Store     ──► IndexedDB (SunflowerMobileDB: files/meta)│  │
│  │  ├── Zero-Knowledge Vault    ──► WebCrypto SubtleCrypto (AES-256-GCM)     │  │
│  │  ├── Hardware Back Router    ──► @capacitor/app BackButton LIFO Stack     │  │
│  │  └── Virtual Albums Engine   ──► IndexedDB (albums & item collections)    │  │
│  └─────────────────────────────────────┬─────────────────────────────────────┘  │
│                                        │ Native Android OS APIs                 │
│                                        ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                  Android Subsystem & Local Sandbox Storage                │  │
│  │  ├── Chromium IndexedDB Engine ──► Encrypted Offline Files & Metadata     │  │
│  │  ├── SharedPreferences / Storage ──► OAuth Client ID & Refresh Token      │  │
│  │  └── Google Drive Cloud API    ──► Direct TLS 1.3 Sync (Zero Middleman)   │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Capabilities

### 1. Ultra-Smooth Virtualized Photo Gallery

- **TanStack Virtual Engine:** Renders thousands of photos and videos with a constant, minimal DOM
  footprint.
- **Adaptive Memory Management:** Off-screen image requests are aborted via `AbortController` as the
  user scrolls, preventing network buffer pileups.
- **Zero Layout Shifts:** Aspect ratios and image grid skeletons are precomputed from SQLite
  metadata before image rasterization.

### 2. Timeline Jump & Month Picker

- **Interactive Month Chip:** Displays the active month currently at the viewport top, updating
  smoothly during scrolling.
- **4x3 Month Popover:** Instant jumping to any year or month with media. Month cells reflect live
  item counts under the current filter (All / Photos / Videos / Favorites).
- **Navigation Controls:** Keyboard shortcuts (`G` to open month picker, `Home` for newest, `End`
  for oldest) and floating navigation pills for long-distance jumps without scroll lag.

### 3. High-Throughput Media Streaming

- **RFC 7233 Byte-Range Streaming:** Instant video seeking with sub-millisecond Time to First Byte
  (TTFB).
- **Safe Inline Allowlist:** Serves only safe media types (JPEG, PNG, WebP, AVIF, MP4, WebM) inline
  with strict `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff` headers. SVG
  and active documents are never served inline.

### 4. Tier-2 On-Demand FFmpeg Video Transcoder

- **Universal Browser Playback:** Translates formats unsupported by standard browsers (such as
  HEVC/H.265, AVCHD `.MTS`, and legacy QuickTime `.MOV`) into universal H.264 baseline video with
  AAC audio.
- **FastStart Streaming:** Injects the `moov` atom at the beginning of the container
  (`-movflags +faststart`) to allow playback to start before the full file finishes downloading.
- **LRU Cache Management:** Automatically manages transcoded assets within a 2 GB disk cache cap in
  `<DATA_DIR>/transcode_cache/`.
- **Graceful UI Fallback:** If FFmpeg is not installed, the lightbox presents an informational
  format panel with direct Google Drive and download options.

### 5. Client-Side Zero-Knowledge Encrypted Vault (SDV1 AEAD)

- **Zero-Knowledge Architecture:** Master encryption keys are derived client-side via Argon2id /
  PBKDF2 with unique salts.
- **Authenticated Encryption:** File payloads are encrypted in the browser with AES-256-GCM before
  transport. The server never receives or stores plaintext passwords, keys, or decrypted data.
- **Canary Integrity Verification:** Verifies vault passphrase validity against an encrypted canary
  without decrypting user files.

### 6. Sub-5ms FTS5 Trigram Full-Text Search

- **Instant Filtering:** SQLite FTS5 index tokenized with `trigram` enables substring and prefix
  searches across 100,000+ files in under 5 milliseconds.

### 7. Virtual Albums & Starred Media

- **Non-Destructive Collections:** Organize photos and files into virtual albums without modifying
  Google Drive folders or duplicating storage.
- **Bi-directional Starred Status:** Star and unstar media locally with immediate synchronization
  back to Google Drive.

### 8. Native Mobile Gestures & Offline Sync

- **Touch Swipe Photo Navigation:** Smooth drag physics with velocity-aware transitions (swipe left
  for next, right for previous).
- **Safe-Area Inset Geometry:** Automatic top/bottom padding dynamic resolution clearing camera
  notches, status bars, and navigation handles.
- **Hardware Back-Button Navigation:** LIFO stack routing hardware back gestures to close lightbox
  and overlays back to gallery without quitting.
- **Pinterest-Style Dynamic Skeletons:** Animated responsive masonry placeholders during initial
  incremental Google Drive synchronization.

---

## Design Decisions & Invariants

| Decision                       | Implementation               | Rationale                                                                                                   |
| :----------------------------- | :--------------------------- | :---------------------------------------------------------------------------------------------------------- |
| **Local-First Metadata**       | SQLite 3 (WAL Mode + FTS5)   | Eliminates cloud API latency for browsing, sorting, and searching. Works offline after initial sync.        |
| **Loopback Security**          | Fastify bound to `127.0.0.1` | No network exposure outside localhost. Guarded by random session tokens (`x-session-token` / `ds_session`). |
| **OS Keychain Secret Storage** | `@napi-rs/keyring`           | Client secrets and refresh tokens are stored in the OS credential manager, never in plaintext.              |
| **Zero-Knowledge Encryption**  | AES-256-GCM + Argon2id       | Vault encryption keys reside strictly in volatile client memory while unlocked.                             |
| **Verbatim Path Sanitization** | `strip_verbatim_prefix`      | Normalizes Windows extended-length prefixes (`\\?\`) so bundled Node runtime loads without errors.          |
| **RFC 7233 Media Streaming**   | HTTP 206 Partial Content     | Delivers low-latency video seeking and stream resuming without loading entire files into RAM.               |

---

## Security Invariants

Project Sunflower maintains 10 constitutional security invariants:

- **INV-01 (Zero Telemetry):** No telemetry, analytics, or pingbacks. Network traffic is strictly
  limited to official Google Drive API endpoints and localhost.
- **INV-02 (Strict Loopback Binding):** Backend listens exclusively on `127.0.0.1`. Remote and LAN
  interfaces are never bound.
- **INV-03 (OS-Level Secret Storage):** OAuth tokens and secrets are stored in Windows Credential
  Manager / macOS Keychain. Plaintext disk storage is barred.
- **INV-04 (Zero-Knowledge Vault):** Vault files are encrypted before leaving the client; decryption
  occurs only in memory.
- **INV-05 (Media Stream Sandbox):** Media streaming endpoints enforce
  `Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff`, and forbid SVG or
  executable inline execution.
- **INV-06 (Outbound SSRF Guard):** Outbound media proxies strictly validate HTTPS URLs, enforce
  exact hostname allowlists (`googleusercontent.com`), limit redirects to 3 hops, and enforce a 10s
  timeout.
- **INV-07 (Zero Token Forwarding):** Authorization headers and OAuth access tokens are never
  forwarded to media hosts.
- **INV-08 (Session Isolation & CSRF Defense):** Mutating routes require valid Origin headers, DNS
  rebinding checks ensure loopback Host headers, and cross-site requests are rejected via
  `Sec-Fetch-Site`.
- **INV-09 (Forward-Only Schema Migrations):** All database schema updates run in atomic
  transactions with version tracking. Destructive down-migrations are disallowed.
- **INV-10 (Fail-Closed Authentication):** Requests missing valid session tokens or credentials fail
  immediately with HTTP 401 without leaking internal paths or stack traces.

---

## Performance Scoreboard

Verified on synthetic and real-world datasets (`scripts/bench/`):

### Database Query Benchmarks

| Query / Operation                    | Real ~25k (22.5 MB) | Synthetic 100k (62.7 MB) | Mechanism                                       |
| :----------------------------------- | :-----------------: | :----------------------: | :---------------------------------------------- |
| **Timeline First Page (limit 50)**   |     **0.12 ms**     |       **0.50 ms**        | `idx_files_photos_timeline_fast` covering index |
| **Timeline Deep Page (offset 5000)** |    **32.95 ms**     |       **42.78 ms**       | Index-only sequential scan                      |
| **Timeline Month Buckets**           |    **43.77 ms**     |      **800.13 ms**       | Compound date expression index                  |
| **FTS5 Trigram Search (`"img"`)**    |     **4.83 ms**     |       **7.33 ms**        | SQLite FTS5 trigram virtual table               |
| **FTS5 Trigram Search (`"screen"`)** |     **1.33 ms**     |       **0.08 ms**        | Selective trigram index scan                    |
| **Folder Browse (2,000 items)**      |     **0.79 ms**     |       **1.82 ms**        | `idx_files_browse_covering` index               |
| **Database Startup to First Query**  |     **9.35 ms**     |       **3.91 ms**        | WAL checkpoint fast recovery                    |

### Server & Engine Throughput

| Metric                               | Measured Baseline  | Target Budget  |          Result          |
| :----------------------------------- | :----------------: | :------------: | :----------------------: |
| **Cold Start to `/health`**          |   **633.51 ms**    |    < 800 ms    |         **PASS**         |
| **Thumbnail Disk Cache Hit Latency** |    **3.73 ms**     |    < 20 ms     |         **PASS**         |
| **Peak Throughput (concurrency 64)** | **10,787.8 req/s** | > 5,000 req/s  |  **PASS (2.1x target)**  |
| **Video Stream Range Latency**       |    **0.107 ms**    |     < 5 ms     |         **PASS**         |
| **Sync Event Loop Delay (p99)**      |    **0.001 ms**    |    < 50 ms     | **PASS (Zero blocking)** |
| **Full Sync Rate (25k rows)**        | **5,788.9 rows/s** | > 3,000 rows/s |         **PASS**         |
| **Web Production Bundle (gzip JS)**  |   **108.61 KB**    |    < 150 KB    |         **PASS**         |

---

## Workspace Structure

```
project-sunflower/
├── apps/
│   ├── server/                   # Fastify 5 Loopback Backend
│   │   ├── src/
│   │   │   ├── auth/             # OAuth PKCE flow, Keychain manager, Session guards
│   │   │   ├── db/               # SQLite connection, queries & embedded migrations
│   │   │   ├── routes/           # REST endpoints (auth, files, media, albums, vault)
│   │   │   ├── sync/             # Incremental and full Drive sync engines
│   │   │   └── utils/            # FFmpeg transcoder, FTS sanitizer, SSRF guard
│   │   └── migrations/           # Versioned SQL migrations (001 -> 007)
│   │
│   └── web/                      # React 19 Frontend SPA (Vite + Tailwind)
│       └── src/
│           ├── app/shell/        # TopBar, Sidebar, and shell layout
│           ├── features/         # Gallery, Albums, Files, Vault, Setup Wizard
│           ├── hooks/            # Setup polling, sync progress, timeline hooks
│           └── lib/              # API client, WebCrypto vault encryption
│
├── packages/
│   └── shared/                   # Shared TypeScript contracts & SDV1 Vault Core
│       └── src/
│           ├── index.ts          # DTO contracts, schemas, and shared types
│           └── vault/            # Pure SDV1 AEAD cryptographic engine
│
├── src-tauri/                    # Tauri v2 Rust Desktop Shell
│   ├── src/lib.rs                # Sidecar process manager, system browser opener
│   └── tauri.conf.json           # Window configuration, CSP, resource bundling
│
├── scripts/
│   ├── bench/                    # Monorepo benchmark harness (DB, sync, server)
│   ├── build-desktop-bundle.js   # Sidecar runtime and native addon packager
│   └── seed.ts                   # Synthetic 100k test dataset generator
│
└── Project-Sunflower-Setup-1.0.0.exe # Standalone Windows NSIS Release Installer
```

---

## Developer Quick Start

### Prerequisites

- **Node.js:** 22 LTS or newer
- **pnpm:** v9 or v10 (`npm i -g pnpm`)
- **Rust Toolchain:** 1.78+ (only if compiling the desktop shell from source)
- **Google Cloud Console:** OAuth 2.0 Client ID configured for Desktop Applications (see
  [`docs/google-setup.md`](docs/google-setup.md))

### 1. Installation

```bash
git clone https://github.com/git-Rag/thesunflowerproject.git
cd thesunflowerproject
pnpm install
```

### 2. Running in Development Mode

```bash
# Starts Fastify backend on :3001 and Vite web app on :5173
pnpm dev
```

To run the full Tauri desktop application in development mode:

```bash
pnpm desktop:dev
```

### 3. Running Test Suites

```bash
# Run all workspace test suites (Vitest across shared, web, server)
pnpm test

# Run strict TypeScript typecheck
pnpm typecheck

# Run ESLint across entire workspace
pnpm lint
```

### 4. Building the Windows Installer

```bash
# Builds production web assets, bundles the backend sidecar, and builds the NSIS installer
pnpm desktop:build
```

The output installer will be generated at
`src-tauri/target/release/bundle/nsis/Project Sunflower_1.0.0_x64-setup.exe`.

### 5. Building the Android APK

```bash
# Sync production web assets into the native Android Gradle project
pnpm mobile:sync

# Build the debug APK using the Gradle wrapper
pnpm mobile:build

# Open the native project in Android Studio (optional)
pnpm mobile:open
```

The output APK will be compiled at `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## Testing & Verification

The repository maintains an automated test suite across all workspace layers:

- **172 Vitest Automated Tests:**
  - 151 backend tests covering OAuth PKCE, session security, CORS boundaries, SQLite migrations, RFC
    7233 range streams, backfill workers, and FFmpeg transcoding.
  - 14 frontend and WebCrypto test suites covering vault encryption roundtrips and error handling.
  - 7 shared package tests verifying zero Node dependencies and timeline calculations.
- **Zero-Warning ESLint & Prettier Rules:** Verified across all workspace files with Husky
  pre-commit hooks.

---

## License

Distributed under the **MIT License**. See `LICENSE` for details.

_Project Sunflower is an independent open-source project. Not affiliated with or endorsed by Google
LLC or Alphabet Inc._
