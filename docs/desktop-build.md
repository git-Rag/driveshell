# DriveShell Desktop & Mobile Build Guide

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9
- **Rust toolchain** (stable): `rustup default stable`
- **Windows**: Microsoft Visual Studio C++ Build Tools & WebView2 (pre-installed on Windows 10/11)

## Development

Run the desktop application in development mode with hot reloading:

```bash
pnpm desktop:dev
```

This will concurrently:

1. Start the Fastify backend server on `http://127.0.0.1:3001`
2. Start the Vite React development server on `http://127.0.0.1:5173`
3. Launch the native Tauri desktop window with WebView2

## Release Build (Windows Installer)

To compile the standalone Windows executable (`.exe`) and MSI installer (`.msi`):

```bash
pnpm desktop:build
```

The resulting installers will be placed under: `src-tauri/target/release/bundle/msi/`
`src-tauri/target/release/bundle/nsis/`

## Future Android Target (Tauri Mobile)

When ready to build the Android application:

1. Ensure Android Studio and Android SDK / NDK are installed.
2. Initialize Android target:
   ```bash
   pnpm tauri android init
   ```
3. Run on connected Android device / emulator:
   ```bash
   pnpm tauri android dev
   ```
4. Build APK:
   ```bash
   pnpm tauri android build
   ```
