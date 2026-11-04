# DriveShell

> **Not affiliated with or endorsed by Google or Microsoft.**

A fast, clean, photo-first interface for Google Drive — running entirely on your own machine.

## What it is

Google Drive's web UI is slow and cluttered for photo libraries. DriveShell fixes this by syncing
your Drive metadata once into a local SQLite database. All browsing, sorting, searching, and
filtering happen instantly against that local index. Network is used only for incremental sync,
thumbnails, and file bytes.

## Privacy guarantee

All data stays on your machine. The only network peers are Google's APIs. No telemetry, no
analytics, no cloud backend run by us. Ever.

## Features (in development)

- **Gallery** — virtualized justified-row photo grid with month/year jump picker
- **Moments** — auto-grouped clusters by date and time gap
- **Albums** — virtual albums stored locally, never altering Drive structure
- **Favorites** — mirrors Drive starred files
- **Files** — folder tree, sortable table, full-text search
- **Private Vault** — optional client-side AES-256-GCM encrypted storage on Drive

## Bring your own Google credentials

DriveShell cannot ship a verified OAuth client (Drive scopes are restricted). You create your own
free Google Cloud project and OAuth client. See [`docs/google-setup.md`](docs/google-setup.md) for a
step-by-step walkthrough.

## Requirements

- Node.js 22 LTS
- pnpm 9+
- Windows (macOS and Linux: best-effort, Phase 10+)
- A Google account

## Getting started

```bash
git clone https://github.com/your-username/driveshell.git
cd driveshell
cp .env.example .env
pnpm install
pnpm dev
```

Then open http://localhost:5173 and follow the setup wizard.

## Development

```bash
pnpm typecheck   # TypeScript strict check
pnpm lint        # ESLint
pnpm test        # Vitest unit + integration tests
pnpm build       # Production build
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Security

See [SECURITY.md](SECURITY.md) for the vulnerability reporting process and
[docs/security.md](docs/security.md) for the full threat model and vault cryptographic design.

## License

MIT — see [LICENSE](LICENSE).
