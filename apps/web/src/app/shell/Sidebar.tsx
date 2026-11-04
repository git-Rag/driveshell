import {
  Images,
  FolderOpen,
  Clock,
  Grid3x3,
  BookImage,
  Heart,
  Users,
  Lock,
  Settings,
  HardDrive,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import { Logo } from '../../components/ui/Logo';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  children?: {
    id: string;
    label: string;
    icon: React.ReactNode;
    badge?: string;
    disabled?: boolean;
  }[];
  badge?: string;
  disabled?: boolean;
}

const NAV_SECTIONS: NavItem[] = [
  {
    id: 'photos',
    label: 'Photos',
    icon: <Images size={16} />,
    children: [
      { id: 'moments', label: 'Moments', icon: <Clock size={14} /> },
      { id: 'gallery', label: 'Gallery', icon: <Grid3x3 size={14} /> },
      { id: 'albums', label: 'Albums', icon: <BookImage size={14} /> },
      { id: 'favorites', label: 'Favorites', icon: <Heart size={14} /> },
      { id: 'people', label: 'People', icon: <Users size={14} />, badge: 'Soon' },
    ],
  },
  {
    id: 'files',
    label: 'Files',
    icon: <FolderOpen size={16} />,
  },
  {
    id: 'vault',
    label: 'Private Vault',
    icon: <Lock size={16} />,
  },
];

interface AccountInfo {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  status: 'ok' | 'syncing' | 'needs_reauth' | 'error';
}

interface SidebarProps {
  activeId?: string;
  onNavigate?: (id: string) => void;
  accounts?: AccountInfo[];
}

export function Sidebar({ activeId = 'gallery', onNavigate, accounts = [] }: SidebarProps) {
  const account = accounts[0] ?? null;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ photos: true });

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <aside
      style={{
        width: 'var(--ds-sidebar-width)',
        minHeight: '100%',
        background: 'var(--ds-sidebar-bg)',
        borderRight: '1px solid var(--ds-sidebar-border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
      aria-label="Main navigation"
    >
      {/* Logo area */}
      <div
        style={{
          height: 'var(--ds-topbar-height)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          borderBottom: '1px solid var(--ds-sidebar-border)',
          flexShrink: 0,
        }}
      >
        <Logo />
      </div>

      {/* Navigation */}
      <nav
        style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}
      >
        {/* Account indicator */}
        <AccountChip account={account} />

        <div style={{ marginTop: 4 }} />

        {NAV_SECTIONS.map((item) => (
          <div key={item.id}>
            <NavButton
              item={item}
              isActive={activeId === item.id && !item.children}
              isExpanded={expanded[item.id] ?? false}
              onPress={() => {
                if (item.children) {
                  toggle(item.id);
                } else {
                  onNavigate?.(item.id);
                }
              }}
            />
            {/* Children */}
            {item.children && expanded[item.id] && (
              <div
                style={{
                  marginLeft: 8,
                  marginTop: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                {item.children.map((child) => (
                  <NavButton
                    key={child.id}
                    item={child}
                    isActive={activeId === child.id}
                    isExpanded={false}
                    isChild
                    onPress={() => onNavigate?.(child.id)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Bottom utility */}
      <div
        style={{
          borderTop: '1px solid var(--ds-sidebar-border)',
          padding: '8px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          flexShrink: 0,
        }}
      >
        {/* Storage indicator */}
        <StorageIndicator />

        <NavButton
          item={{ id: 'settings', label: 'Settings', icon: <Settings size={16} /> }}
          isActive={activeId === 'settings'}
          isExpanded={false}
          onPress={() => onNavigate?.('settings')}
        />
      </div>
    </aside>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────────── */

function NavButton({
  item,
  isActive,
  isExpanded,
  isChild = false,
  onPress,
}: {
  item:
    | NavItem
    | { id: string; label: string; icon: React.ReactNode; badge?: string; disabled?: boolean };
  isActive: boolean;
  isExpanded: boolean;
  isChild?: boolean;
  onPress: () => void;
}) {
  const hasChildren =
    'children' in item && Array.isArray(item.children) && item.children.length > 0;

  return (
    <button
      onClick={onPress}
      disabled={item.disabled}
      aria-current={isActive ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: isChild ? 7 : 9,
        width: '100%',
        padding: isChild ? '5px 10px' : '7px 10px',
        borderRadius: 'var(--ds-radius-md)',
        border: 'none',
        cursor: item.disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        fontSize: isChild ? 13 : 13.5,
        fontWeight: isActive ? 500 : 400,
        letterSpacing: '-0.1px',
        color: isActive
          ? 'var(--ds-text-primary)'
          : item.disabled
            ? 'var(--ds-text-disabled)'
            : 'var(--ds-text-secondary)',
        background: isActive ? 'var(--ds-bg-active)' : 'transparent',
        transition: `background ${String(100)}ms ease, color ${String(100)}ms ease`,
        position: 'relative',
        outline: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isActive && !item.disabled) {
          e.currentTarget.style.background = 'var(--ds-bg-hover)';
          e.currentTarget.style.color = 'var(--ds-text-primary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = item.disabled
            ? 'var(--ds-text-disabled)'
            : 'var(--ds-text-secondary)';
        }
      }}
    >
      {/* Active indicator bar */}
      {isActive && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: '20%',
            bottom: '20%',
            width: 2.5,
            borderRadius: 99,
            background: 'var(--ds-accent)',
          }}
        />
      )}

      <span
        style={{
          opacity: isActive ? 1 : 0.65,
          display: 'flex',
          alignItems: 'center',
          color: isActive ? 'var(--ds-accent)' : 'inherit',
          transition: 'opacity 100ms, color 100ms',
          flexShrink: 0,
        }}
      >
        {item.icon}
      </span>

      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.label}
      </span>

      {'badge' in item && item.badge && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            padding: '2px 6px',
            borderRadius: 'var(--ds-radius-full)',
            background: 'var(--ds-bg-overlay)',
            color: 'var(--ds-text-tertiary)',
            letterSpacing: '0.3px',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          {item.badge}
        </span>
      )}

      {hasChildren && (
        <span
          aria-hidden
          style={{
            opacity: 0.4,
            display: 'flex',
            alignItems: 'center',
            transition: `transform ${String(200)}ms ease`,
            transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        >
          <ChevronDown size={13} />
        </span>
      )}
    </button>
  );
}

function AccountChip({ account }: { account: AccountInfo | null }) {
  const initials = account?.displayName?.[0]?.toUpperCase() ?? '?';
  const label = account ? account.displayName : 'Not signed in';
  const sublabel = account ? account.email : null;
  const needsReauth = account?.status === 'needs_reauth';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 'var(--ds-radius-md)',
        border: `1px solid ${needsReauth ? 'var(--ds-warning)' : 'var(--ds-border)'}`,
        background: 'var(--ds-bg-hover)',
        cursor: 'pointer',
        marginBottom: 4,
      }}
      title={account ? `${account.email} — Account menu` : 'Not signed in'}
    >
      {/* Avatar */}
      {account?.avatarUrl ? (
        <img
          src={account.avatarUrl}
          alt={account.displayName}
          referrerPolicy="no-referrer"
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'var(--ds-brand-gradient)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 700,
            color: '#fff',
          }}
        >
          {initials}
        </span>
      )}

      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: sublabel ? 'column' : 'row',
          gap: sublabel ? 1 : 0,
        }}
      >
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 500,
            color: needsReauth ? 'var(--ds-warning)' : 'var(--ds-text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {needsReauth ? 'Re-auth needed' : label}
        </span>
        {sublabel && !needsReauth && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--ds-text-disabled)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {sublabel}
          </span>
        )}
      </span>
      <ChevronRight size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
    </div>
  );
}

function StorageIndicator() {
  return (
    <div
      style={{
        padding: '8px 10px',
        marginBottom: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
          gap: 8,
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--ds-text-tertiary)',
          }}
        >
          <HardDrive size={12} />
          Local index
        </span>
        <span style={{ fontSize: 11, color: 'var(--ds-text-disabled)' }}>—</span>
      </div>
      {/* Progress bar placeholder */}
      <div
        style={{
          height: 3,
          borderRadius: 'var(--ds-radius-full)',
          background: 'var(--ds-bg-overlay)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: '0%',
            borderRadius: 'inherit',
            background: 'var(--ds-brand-gradient)',
          }}
        />
      </div>
    </div>
  );
}
