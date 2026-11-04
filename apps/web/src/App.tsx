// Phase 0: empty shell to verify the design-system tokens and Tailwind work.
// Real routing and features start in Phase 1 (setup wizard).

export function App() {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: 'var(--ds-bg)', color: 'var(--ds-text-primary)' }}
    >
      <div className="text-center space-y-3">
        {/* Logo placeholder — replace with SVG icon in Phase 1 */}
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
          style={{ background: 'var(--ds-accent)', color: '#fff' }}
          aria-hidden="true"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
        </div>

        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: 'var(--ds-text-primary)' }}
        >
          DriveShell
        </h1>

        <p className="text-sm" style={{ color: 'var(--ds-text-secondary)' }}>
          Phase 0 scaffold — setup wizard coming in Phase 1.
        </p>

        {/* Verify server connection */}
        <HealthBadge />
      </div>
    </div>
  );
}

function HealthBadge() {
  // TODO(phase-1): Replace with TanStack Query + real health check
  return (
    <p className="text-xs mt-4" style={{ color: 'var(--ds-text-disabled)' }}>
      Server:{' '}
      <a href="/health" target="_blank" rel="noreferrer" style={{ color: 'var(--ds-accent)' }}>
        /health
      </a>
    </p>
  );
}
