import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './app/shell/Sidebar';
import { TopBar } from './app/shell/TopBar';
import { WelcomeScreen } from './features/setup/WelcomeScreen';
import { SetupWizard } from './features/setup/SetupWizard';
import { useSetupStatus } from './hooks/useSetupStatus';

// Phase 1: Setup wizard + auth flow wired up.
// TODO(phase-1): Replace activeId state with React Router location
// TODO(phase-1): Replace isDark useState with Zustand theme store + localStorage persistence

export function App() {
  const [activeId, setActiveId] = useState<string>('gallery');
  const [isDark, setIsDark] = useState<boolean>(true);
  const [setupDone, setSetupDone] = useState<boolean>(false);

  // Apply theme attribute to <html> so CSS [data-theme] selectors work
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Poll setup status
  const { status, refresh } = useSetupStatus();

  // Handle post-OAuth redirect params (?auth_success=1 or ?auth_error=…)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('auth_success')) {
      // Clean the URL and re-poll status
      window.history.replaceState({}, '', '/');
      refresh();
    }
    // auth_error is handled by the wizard via query param — no action here
  }, [refresh]);

  const handleSetupComplete = useCallback(() => {
    setSetupDone(true);
  }, []);

  // Determine whether to show the wizard
  const showWizard = (() => {
    if (setupDone) return false;
    if (status.state === 'loading') return false; // Show nothing (or could show spinner)
    if (status.state === 'error') return true; // Show wizard so user can retry
    // Show wizard if not configured OR no accounts yet
    return !status.data.configured || status.data.accounts.length === 0;
  })();

  // Loading state — show a minimal spinner before we know setup state
  if (status.state === 'loading') {
    return (
      <div
        style={{
          height: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--ds-bg)',
          color: 'var(--ds-text-muted)',
          fontSize: '0.875rem',
        }}
      >
        Starting DriveShell…
      </div>
    );
  }

  if (showWizard) {
    const accounts = status.state === 'ready' ? status.data.accounts : [];
    return <SetupWizard accounts={accounts} onComplete={handleSetupComplete} />;
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100dvh',
        overflow: 'hidden',
        background: 'var(--ds-bg)',
        color: 'var(--ds-text-primary)',
        fontFamily: 'var(--ds-font-sans)',
      }}
    >
      {/* Left rail */}
      <Sidebar
        activeId={activeId}
        onNavigate={setActiveId}
        accounts={status.state === 'ready' ? status.data.accounts : []}
      />

      {/* Main column */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {/* Sticky top bar (inside main column, not spanning sidebar) */}
        <TopBar
          isDark={isDark}
          onThemeToggle={() => setIsDark((d) => !d)}
          syncState="idle"
          account={status.state === 'ready' ? (status.data.accounts[0] ?? null) : null}
        />

        {/* Content region — scrollable */}
        <main
          id="main-content"
          tabIndex={-1}
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
          aria-label="Main content"
        >
          {/* TODO(phase-2): Replace WelcomeScreen with routed gallery/files views */}
          <WelcomeScreen />
        </main>
      </div>
    </div>
  );
}
