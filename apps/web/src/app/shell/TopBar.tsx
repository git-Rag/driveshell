import { Search, RefreshCw, Moon, Sun, Bell } from 'lucide-react';
import { useState } from 'react';

interface TopBarProps {
  onThemeToggle?: () => void;
  isDark?: boolean;
  syncState?: 'idle' | 'syncing' | 'error' | 'needs_reauth';
}

export function TopBar({ onThemeToggle, isDark = true, syncState = 'idle' }: TopBarProps) {
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <header
      style={{
        height: 'var(--ds-topbar-height)',
        background: 'var(--ds-topbar-bg)',
        borderBottom: '1px solid var(--ds-topbar-border)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 16px',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
      role="banner"
    >
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
        <SyncChip state={syncState} />

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
            background: 'var(--ds-brand-gradient)',
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
          }}
        >
          ?
        </button>
      </div>
    </header>
  );
}

function SyncChip({ state }: { state: TopBarProps['syncState'] }) {
  const configs = {
    idle: {
      color: 'var(--ds-text-disabled)',
      bg: 'transparent',
      icon: null,
      label: null,
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
