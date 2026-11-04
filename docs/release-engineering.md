# Sunflower Drive — Windows Release Engineering & Packaging Specification

> **Target**: Windows 10/11 x64 Signed Desktop Release  
> **Framework**: Tauri v2 + Fastify Loopback Sidecar  
> **Package Formats**: NSIS Installer (`.exe`) and WiX Enterprise Installer (`.msi`)

---

## 1. Dual Installer Strategy: NSIS vs. WiX

| Feature                | NSIS Installer (`.exe`)                                | WiX Enterprise Installer (`.msi`)                            |
| :--------------------- | :----------------------------------------------------- | :----------------------------------------------------------- |
| **Target Audience**    | Consumers, personal users, power users                 | IT administrators, enterprise deployment, GPO / Intune       |
| **Installation Scope** | Per-user (no admin UAC elevation required by default)  | Per-machine (`C:\Program Files\Sunflower Drive`)             |
| **Silent Install**     | Supported via `/S` command flag                        | Native `msiexec /i SunflowerDrive.msi /qn`                   |
| **WebView2 Handling**  | Downloads & installs Evergreen bootstrapper if missing | Packages Evergreen standalone installer in enterprise bundle |
| **Tauri v2 Config**    | `tauri.conf.json` $\rightarrow$ `bundle.windows.nsis`  | `tauri.conf.json` $\rightarrow$ `bundle.windows.wix`         |

---

## 2. Backend Packaging & Sidecar Architecture

### 2.1 The Problem & Solution

On desktop, the React UI runs inside Microsoft Edge WebView2, while the backend runs a Fastify
Node.js server. In production:

1. **Packaging**: The backend is compiled into a self-contained executable (`sunflower-server.exe`)
   using Node.js Single Executable Applications (SEA) or bundled Node 22 runtime.
2. **Sidecar Lifecycle**:
   - `src-tauri/src/lib.rs` spawns `sunflower-server.exe` as a managed child process.
   - Rust dynamically binds an ephemeral available loopback port (`0` $\rightarrow$ OS assigns
     available port).
   - Rust generates the 128-bit session token and injects it to the sidecar via environment variable
     or standard input.
   - When the Tauri desktop window closes, Rust sends `SIGTERM` to the child process and performs
     clean shutdown (`closeDb()`).
3. **Single Instance**:
   - Tauri single-instance plugin prevents multiple instances from corrupting the SQLite WAL file.

---

## 3. Code Signing & Windows SmartScreen

### 3.1 Certificate Strategy

- Unsigned `.exe` or newly signed binaries trigger Windows Defender SmartScreen ("Windows protected
  your PC").
- **Requirement**: Standard Code Signing Certificate (OV) or Extended Validation (EV) / Cloud
  Signing Certificate (Azure Trusted Signing).
- **CI Security**:
  - The private signing key must **never** be stored in the git repository or exposed as plaintext
    GitHub Actions secrets.
  - Recommended: **Azure Trusted Signing** (formerly Microsoft Identity Verification) or DigiCert
    KeyLocker cloud HSM.

### 3.2 Dual-Binary Signing Pipeline

Both the Tauri wrapper and the Node sidecar must be signed:

```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a "src-tauri/target/release/sunflower-drive.exe"
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a "src-tauri/target/release/resources/sunflower-server.exe"
```

---

## 4. Automatic Updates (Tauri v2 Updater)

1. **Cryptographic Signing (Ed25519)**:
   - Updates are signed with an Ed25519 private key.
   - The public key is embedded in `tauri.conf.json`:
     ```json
     "plugins": {
       "updater": {
         "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk...",
         "endpoints": [
           "https://releases.sunflowerdrive.com/update/windows/latest.json"
         ]
       }
     }
     ```
2. **Update Invariants**:
   - Updates are fetched strictly over HTTPS.
   - Tampered or incorrectly signed updates are rejected by Tauri before extraction.

---

## 5. Filesystem Layout & Uninstallation

### 5.1 Directory Structure

- **Application Binaries**: `%LOCALAPPDATA%\Programs\Sunflower Drive\`
- **Database & Thumbnails**: `%LOCALAPPDATA%\com.sunflowerdrive.app\`
  - `driveshell.db` (SQLite database)
  - `driveshell.db-wal` (Write-ahead log)
  - `thumbs/` (Cache files)
  - `vault/` (Encrypted `.sdv` files)

### 5.2 Clean Uninstall Behavior

- Standard uninstall removes application binaries and desktop shortcuts.
- Database and encrypted vault files are preserved in `%LOCALAPPDATA%\com.sunflowerdrive.app` to
  prevent accidental loss of user photos during version upgrades.
- A "Purge Data" option is accessible from within the app settings for users who wish to permanently
  delete their local database and OS keychain credentials.

---

## 6. Release Checklist (Security & QA)

- [ ] **Dependency Audit**: `pnpm audit --prod` returns 0 vulnerabilities.
- [ ] **Automated Test Suite**: All 111+ tests passing across all packages.
- [ ] **Typecheck & Linter**: `pnpm typecheck` and `pnpm lint` exit with code 0.
- [ ] **Secret Scan**: Gitleaks clean with zero detected credentials.
- [ ] **Code Signing**: `signtool verify /pa /v` succeeds on `.exe` and `.msi`.
- [ ] **Clean Machine Test**: Tested on clean Windows 11 VM without Node.js or developer tools
      installed.
- [ ] **Offline Operation**: App launches and browses local database with network interface
      disabled.
- [ ] **Vault Round-Trip**: Encrypt, seek, stream, and lock verified with zero plaintext residue on
      disk.
- [ ] **SBOM Generation**: CycloneDX SBOM generated and attached to release assets.
