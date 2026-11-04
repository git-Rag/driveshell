import { Search, RefreshCw, Moon, Sun, Bell, Menu } from 'lucide-react';
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
      : null;

  return (
    <header
      style={{
        height: visible ? 'var(--ds-topbar-height)' : 0,
        opacity: visible ? 1 : 0,
        visibility: visible ? 'visible' : 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
        background: 'var(--ds-topbar-bg)',
        borderBottom: visible ? '1px solid var(--ds-topbar-border)' : 'none',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: visible ? '0 16px' : 0,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 40,
        transition: 'height 200ms ease, opacity 200ms ease, padding 200ms ease',
        overflow: 'hidden',
      }}
      role="banner"
    >
      {/* Sidebar toggle button when visible */}
      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors mr-1"
          title="Toggle sidebar"
        >
          <Menu size={16} />
        </button>
      )}

      {/* Search — full-width centrepiece */}
      <div
        style={{
          flex: 1,
          maxWidth: 520,
          margin: '0 auto',
          position: 'relative',
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: searchFocused ? 'var(--ds-accent)' : 'var(--ds-text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            transition: 'color 150ms ease',
            pointerEvents: 'none',
          }}
        >
          <Search size={15} />
        </span>
        <input
          type="search"
          placeholder="Search photos, files, folders…"
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          style={{
            width: '100%',
            height: 36,
            paddingLeft: 36,
            paddingRight: 16,
            borderRadius: 'var(--ds-radius-lg)',
            border: `1px solid ${searchFocused ? 'var(--ds-border-focus)' : 'var(--ds-border)'}`,
            background: searchFocused ? 'var(--ds-bg-elevated)' : 'var(--ds-bg-hover)',
            color: 'var(--ds-text-primary)',
            fontSize: 13.5,
            outline: 'none',
            transition: 'border-color 150ms ease, background 150ms ease, box-shadow 150ms ease',
            boxShadow: searchFocused ? 'var(--ds-shadow-accent)' : 'none',
            fontFamily: 'inherit',
          }}
          disabled
          title="Search (available after setup)"
        />
        <kbd
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 'var(--ds-radius-sm)',
            background: 'var(--ds-bg-overlay)',
            border: '1px solid var(--ds-border)',
            color: 'var(--ds-text-disabled)',
            fontFamily: 'var(--ds-font-mono)',
            pointerEvents: 'none',
          }}
          aria-hidden
        >
          ⌘K
        </kbd>
      </div>

      {/* Right controls */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', flexShrink: 0 }}
      >
        {/* Sync chip */}
        <SyncChip state={liveSyncState} lastSyncLabel={lastSyncLabel} />

        {/* Notifications */}
        <TopBarIconButton icon={<Bell size={16} />} label="Notifications" />

        {/* Theme toggle */}
        <TopBarIconButton
          icon={isDark ? <Sun size={16} /> : <Moon size={16} />}
          label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={onThemeToggle}
        />

        {/* Account avatar */}
        <button
          aria-label="Account menu"
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: account?.avatarUrl ? 'transparent' : 'var(--ds-brand-gradient)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            color: '#fff',
            marginLeft: 4,
            flexShrink: 0,
            outline: 'none',
            boxShadow: 'var(--ds-shadow-brand)',
            overflow: 'hidden',
            padding: 0,
          }}
        >
          {account?.avatarUrl ? (
            <img
              src={account.avatarUrl}
              alt={account.displayName}
              referrerPolicy="no-referrer"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            initials
          )}
        </button>
      </div>
    </header>
  );
}

function SyncChip({ state, lastSyncLabel }: { state: TopBarProps['syncState']; lastSyncLabel?: string | null }) {
  const configs = {
    idle: {
      color: 'var(--ds-text-disabled)',
      bg: 'transparent',
      icon: null,
      label: lastSyncLabel ?? null,
    },
    syncing: {
      color: 'var(--ds-accent)',
      bg: 'var(--ds-accent-subtle)',
      icon: <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />,
      label: 'Syncing…',
    },
    error: {
      color: 'var(--ds-error)',
      bg: 'var(--ds-error-subtle)',
      icon: null,
      label: 'Sync error',
    },
    needs_reauth: {
      color: 'var(--ds-warning)',
      bg: 'var(--ds-warning-subtle)',
      icon: null,
      label: 'Re-auth needed',
    },
  } as const;

  const cfg = configs[state ?? 'idle'];
  if (!cfg.label) return null;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 'var(--ds-radius-full)',
        background: cfg.bg,
        color: cfg.color,
        fontSize: 12,
        fontWeight: 500,
        userSelect: 'none',
      }}
    >
      {cfg.icon}
      {cfg.label}
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
  onClick?: (() => void) | undefined;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--ds-radius-md)',
        border: 'none',
        background: 'transparent',
        color: 'var(--ds-text-secondary)',
        cursor: 'pointer',
        outline: 'none',
        transition: 'background 100ms, color 100ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--ds-bg-hover)';
        e.currentTarget.style.color = 'var(--ds-text-primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--ds-text-secondary)';
      }}
    >
      {icon}
    </button>
  );
}
