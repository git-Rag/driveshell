import { useState, useEffect } from 'react';
import { Sidebar } from './app/shell/Sidebar';
import { TopBar } from './app/shell/TopBar';
import { WelcomeScreen } from './features/setup/WelcomeScreen';

// Phase 0: static shell. Routing + real views start in Phase 1.
// TODO(phase-1): Replace activeId state with React Router location
// TODO(phase-1): Replace isDark useState with Zustand theme store + localStorage persistence

export function App() {
  const [activeId, setActiveId] = useState<string>('gallery');
  const [isDark, setIsDark] = useState<boolean>(true);

  // Apply theme attribute to <html> so CSS [data-theme] selectors work
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

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
      <Sidebar activeId={activeId} onNavigate={setActiveId} />

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
        <TopBar isDark={isDark} onThemeToggle={() => setIsDark((d) => !d)} syncState="idle" />

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
          {/* Phase 0: always show welcome screen. Phase 1 adds the router. */}
          <WelcomeScreen />
        </main>
      </div>
    </div>
  );
}
