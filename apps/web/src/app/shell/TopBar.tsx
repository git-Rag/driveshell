import { Search, RefreshCw, Moon, Sun, Bell, Menu, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { useSyncStatus } from '../../hooks/useSyncStatus';

interface TopBarProps {
  onThemeToggle?: () => void;
  isDark?: boolean;
  syncState?: 'idle' | 'syncing' | 'error' | 'needs_reauth';
  account?: { displayName: string; avatarUrl: string | null } | null;
  visible?: boolean;
  onToggleSidebar?: () => void;
}

export function TopBar({
  onThemeToggle,
  isDark = true,
  syncState = 'idle',
  account = null,
  visible = true,
  onToggleSidebar,
}: TopBarProps) {
  const initials = account?.displayName?.[0]?.toUpperCase() ?? '?';
  const [searchFocused, setSearchFocused] = useState(false);

  // Live sync state from the scheduler
  const { isSyncing, syncStatus } = useSyncStatus();
  const accountSync = syncStatus?.accounts[0];
  const liveSyncState: TopBarProps['syncState'] = isSyncing
    ? 'syncing'
    : accountSync?.status === 'needs_reauth'
    ? 'needs_reauth'
    : accountSync?.status === 'error'
    ? 'error'
    : syncState;

  const lastSyncLabel =
    !isSyncing && accountSync?.lastFullSyncAt
      ? (() => {
          const delta = Date.now() - accountSync.lastFullSyncAt;
          if (delta < 60_000) return 'Synced just now';
          if (delta < 3_600_000) return `Synced ${Math.floor(delta / 60_000)}m ago`;
          if (delta < 86_400_000) return `Synced ${Math.floor(delta / 3_600_000)}h ago`;
          return `Synced ${Math.floor(delta / 86_400_000)}d ago`;
        })()
      : 'Synced to SQLite';

  return (
    <header
      className={`shrink-0 sticky top-0 z-30 transition-all duration-200 ${
        visible
          ? 'h-[var(--ds-topbar-height)] opacity-100 px-4'
          : 'h-0 opacity-0 px-0 pointer-events-none overflow-hidden'
      } flex items-center gap-3 backdrop-blur-xl select-none`}
      style={{
        background: 'var(--ds-topbar-bg)',
        borderBottom: visible ? '1px solid var(--ds-topbar-border)' : 'none',
      }}
      role="banner"
    >
      {/* Sidebar toggle button */}
      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] active:scale-95 transition-all"
          title="Toggle sidebar (Ctrl+B)"
          aria-label="Toggle navigation sidebar"
        >
          <Menu size={16} />
        </button>
      )}

      {/* OneDrive-style Search Bar — centered with shortcut pill */}
      <div className="flex-1 max-w-xl mx-auto relative group">
        <span
          aria-hidden="true"
          className={`absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none transition-colors duration-150 ${
            searchFocused ? 'text-[var(--ds-brand)]' : 'text-[var(--ds-text-tertiary)]'
          }`}
        >
          <Search size={15} />
        </span>

        <input
          type="search"
          placeholder="Search files, photos, albums… (instant FTS5)"
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className="w-full h-9 pl-9 pr-14 rounded-xl border text-xs outline-none transition-all duration-150 text-[var(--ds-text-primary)] placeholder-[var(--ds-text-disabled)] bg-[var(--ds-bg-elevated)] border-[var(--ds-border)] focus:border-[var(--ds-brand-border)] focus:ring-2 focus:ring-blue-500/20 shadow-xs"
          readOnly
          title="Full-text Trigram search index active"
        />

        <kbd
          aria-hidden="true"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md text-[10px] font-mono text-[var(--ds-text-disabled)] bg-[var(--ds-bg-overlay)] border border-[var(--ds-border)] pointer-events-none"
        >
          ⌘K
        </kbd>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1.5 ml-auto shrink-0">
        {/* Sync status chip */}
        <SyncChip state={liveSyncState} lastSyncLabel={lastSyncLabel} />

        {/* Notifications */}
        <TopBarIconButton icon={<Bell size={15} />} label="Activity & Notifications" />

        {/* Theme toggle */}
        <button
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={onThemeToggle}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] active:scale-95 transition-all group"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span className="transition-transform duration-200 group-hover:rotate-45">
            {isDark ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} className="text-indigo-400" />}
          </span>
        </button>

        {/* User profile avatar */}
        <button
          aria-label="Account details"
          className="w-7 h-7 rounded-full ml-1 shrink-0 flex items-center justify-center cursor-pointer transition-all hover:ring-2 hover:ring-blue-500/50 active:scale-95 shadow-xs overflow-hidden"
          title={account ? account.displayName : 'Not signed in'}
        >
          {account?.avatarUrl ? (
            <img
              src={account.avatarUrl}
              alt={account.displayName}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white bg-brand">
              {initials}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

function SyncChip({
  state,
  lastSyncLabel,
}: {
  state: TopBarProps['syncState'];
  lastSyncLabel?: string | null;
}) {
  if (state === 'syncing') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 shadow-xs animate-pulse">
        <RefreshCw size={11} className="animate-spin text-blue-400" />
        Syncing…
      </span>
    );
  }

  if (state === 'needs_reauth') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-amber-300 bg-amber-500/15 border border-amber-500/30">
        <AlertTriangle size={11} />
        Re-auth needed
      </span>
    );
  }

  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20">
        Sync error
      </span>
    );
  }

  // Idle state
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-secondary)] bg-[var(--ds-bg-raised)] border border-[var(--ds-border-subtle)] transition-colors"
      title="Google Drive metadata synchronized with local SQLite DB"
    >
      <CheckCircle2 size={11} className="text-emerald-400" />
      {lastSyncLabel ?? 'Up to date'}
    </span>
  );
}

function TopBarIconButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] active:scale-95 transition-all outline-none"
      title={label}
    >
      {icon}
    </button>
  );
}
