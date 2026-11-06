import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './app/shell/Sidebar';
import { TopBar } from './app/shell/TopBar';
import { SetupWizard } from './features/setup/SetupWizard';
import { GalleryView } from './features/gallery/GalleryView';
import { AlbumsView } from './features/albums/AlbumsView';
import { FavoritesView } from './features/favorites/FavoritesView';
import { FilesView } from './features/files/FilesView';
import { VaultView } from './features/vault/VaultView';
import { SettingsView } from './features/settings/SettingsView';
import { useSetupStatus } from './hooks/useSetupStatus';
import { useSyncStatus } from './hooks/useSyncStatus';
import { SyncToast } from './components/SyncToast';

// Phase 1: Setup wizard + auth flow wired up.
// TODO(phase-1): Replace activeId state with React Router location
// TODO(phase-1): Replace isDark useState with Zustand theme store + localStorage persistence

export function App() {
  const [activeId, setActiveId] = useState<string>('gallery');
  const [isDark, setIsDark] = useState<boolean>(true);
  const [setupDone, setSetupDone] = useState<boolean>(false);

  const isGallery = ['gallery', 'photos'].includes(activeId);

  // In Gallery, sidebar and topbar are defaulted OFF for immersive photo experience
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [topBarOpen, setTopBarOpen] = useState<boolean>(false);

  const handleNavigate = useCallback((id: string) => {
    setActiveId(id);
    const targetIsGallery = ['gallery', 'photos'].includes(id);
    if (targetIsGallery) {
      setSidebarOpen(false);
      setTopBarOpen(false);
    } else {
      setSidebarOpen(true);
      setTopBarOpen(true);
    }
  }, []);

  // Keyboard shortcut Ctrl+B or [ to toggle sidebar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarOpen((s) => !s);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Apply theme attribute to <html> so CSS [data-theme] selectors work
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Poll setup status
  const { status, refresh } = useSetupStatus();

  // Sync state for bottom-left floating popup
  const {
    isSyncing,
    syncPhase,
    syncEvent,
    error: syncError,
    toastDismissed,
    dismissToast,
    triggerSync,
  } = useSyncStatus();

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
        Starting Project Sunflower…
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
        position: 'relative',
      }}
    >
      {/* Left rail with toggle support */}
      <Sidebar
        activeId={activeId}
        onNavigate={handleNavigate}
        accounts={status.state === 'ready' ? status.data.accounts : []}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((s) => !s)}
      />

      {/* Backdrop overlay when sidebar is opened over Gallery */}
      {sidebarOpen && isGallery && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-y-0 right-0 left-[232px] bg-black/60 backdrop-blur-sm z-40 transition-opacity"
        />
      )}

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
        {/* Sticky top bar — collapsible in Gallery */}
        <TopBar
          isDark={isDark}
          onThemeToggle={() => setIsDark((d) => !d)}
          syncState="idle"
          account={status.state === 'ready' ? (status.data.accounts[0] ?? null) : null}
          visible={topBarOpen || !isGallery}
          onToggleSidebar={() => setSidebarOpen((s) => !s)}
        />

        {/* Content region */}
        <main
          id="main-content"
          tabIndex={-1}
          style={{
            flex: 1,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
          aria-label="Main content"
        >
          {isGallery && (
            <GalleryView
              account={status.state === 'ready' ? (status.data.accounts[0] ?? null) : null}
              activeTab="gallery"
              onTabChange={handleNavigate}
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen((s) => !s)}
              topBarOpen={topBarOpen}
              onToggleTopBar={() => setTopBarOpen((t) => !t)}
            />
          )}

          {activeId === 'albums' && <AlbumsView />}

          {activeId === 'favorites' && <FavoritesView />}

          {activeId === 'files' && <FilesView />}

          {activeId === 'vault' && <VaultView />}

          {activeId === 'settings' && (
            <SettingsView
              account={status.state === 'ready' ? (status.data.accounts[0] ?? null) : null}
              isDark={isDark}
              onThemeToggle={() => setIsDark((d) => !d)}
            />
          )}
        </main>
      </div>

      {/* Floating Sync Status Toast in Bottom-Left */}
      <SyncToast
        sidebarOpen={sidebarOpen}
        syncPhase={syncPhase}
        isSyncing={isSyncing}
        syncEvent={syncEvent}
        error={syncError}
        toastDismissed={toastDismissed}
        onDismiss={dismissToast}
        onRetry={
          status.state === 'ready' && status.data.accounts[0]
            ? () => void triggerSync(status.data.accounts[0]!.id)
            : undefined
        }
      />
    </div>
  );
}
