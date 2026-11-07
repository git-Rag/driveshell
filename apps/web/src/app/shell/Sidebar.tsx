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
  ShieldCheck,
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
      { id: 'gallery', label: 'Gallery', icon: <Grid3x3 size={15} /> },
      { id: 'albums', label: 'Albums', icon: <BookImage size={15} /> },
      { id: 'favorites', label: 'Favorites', icon: <Heart size={15} /> },
      { id: 'moments', label: 'Moments', icon: <Clock size={15} />, badge: 'Soon', disabled: true },
      { id: 'people', label: 'People', icon: <Users size={15} />, badge: 'Soon', disabled: true },
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
  isOpen?: boolean;
  onToggle?: () => void;
}

export function Sidebar({
  activeId = 'gallery',
  onNavigate,
  accounts = [],
  isOpen = true,
  onToggle,
}: SidebarProps) {
  const account = accounts[0] ?? null;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ photos: true });

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <aside
      className={`h-full flex flex-col shrink-0 select-none transition-all duration-200 relative z-50 ${
        isOpen ? 'w-[232px] opacity-100 visible' : 'w-0 opacity-0 invisible overflow-hidden'
      }`}
      style={{
        background: 'var(--ds-sidebar-bg)',
        borderRight: isOpen ? '1px solid var(--ds-sidebar-border)' : 'none',
      }}
      aria-label="Main navigation"
    >
      {/* Brand Header */}
      <div
        className="px-4 flex items-center justify-between shrink-0"
        style={{
          borderBottom: '1px solid var(--ds-sidebar-border)',
          paddingTop: 'max(env(safe-area-inset-top, 0px), 24px)',
          minHeight: 'calc(var(--ds-topbar-height) + max(env(safe-area-inset-top, 0px), 24px))',
        }}
      >
        <Logo />
        {onToggle && (
          <button
            onClick={onToggle}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)] transition-all"
            title="Collapse sidebar (Ctrl+B)"
            aria-label="Collapse sidebar"
          >
            <ChevronRight size={14} className="rotate-180" />
          </button>
        )}
      </div>

      {/* Nav List */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-1">
        {/* Account profile card */}
        <AccountChip account={account} />

        <div className="pt-2" />

        {NAV_SECTIONS.map((item) => (
          <div key={item.id} className="space-y-0.5">
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
            {/* Nested children */}
            {item.children && expanded[item.id] && (
              <div className="pl-3.5 space-y-0.5 mt-0.5">
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

      {/* Bottom status & settings */}
      <div
        className="p-3 shrink-0 space-y-2"
        style={{ borderTop: '1px solid var(--ds-sidebar-border)' }}
      >
        {/* Storage status card */}
        <StorageIndicator />

        {/* Settings button */}
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
      className={`group relative flex items-center w-full rounded-xl text-left transition-all duration-150 outline-none ${
        isChild ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'
      } ${
        item.disabled
          ? 'opacity-40 cursor-not-allowed text-[var(--ds-text-disabled)]'
          : isActive
            ? 'bg-[var(--ds-bg-selected)] text-[var(--ds-text-primary)] font-medium shadow-xs'
            : 'text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-bg-hover)]'
      }`}
    >
      {/* Active accent pill on the left */}
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute left-1 top-2 bottom-2 w-1 rounded-full bg-[var(--ds-brand)] shadow-xs"
        />
      )}

      {/* Icon */}
      <span
        className={`shrink-0 transition-colors duration-150 ${isChild ? 'mr-2' : 'mr-2.5'} ${
          isActive
            ? 'text-[var(--ds-brand)]'
            : 'text-[var(--ds-text-tertiary)] group-hover:text-[var(--ds-text-primary)]'
        }`}
      >
        {item.icon}
      </span>

      {/* Label */}
      <span className="flex-1 truncate tracking-tight">{item.label}</span>

      {/* Badge (e.g. Soon) */}
      {'badge' in item && item.badge && (
        <span className="shrink-0 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-white/5 text-[var(--ds-text-tertiary)] border border-white/5">
          {item.badge}
        </span>
      )}

      {/* Collapsible arrow */}
      {hasChildren && (
        <span
          aria-hidden="true"
          className={`shrink-0 ml-1 text-[var(--ds-text-tertiary)] transition-transform duration-200 ${
            isExpanded ? 'rotate-0' : '-rotate-90'
          }`}
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
      className={`group flex items-center gap-2.5 p-2 rounded-xl cursor-pointer border transition-all duration-150 ${
        needsReauth
          ? 'bg-amber-500/10 border-amber-500/30'
          : 'bg-[var(--ds-bg-raised)] hover:bg-[var(--ds-bg-elevated)] border-[var(--ds-border-subtle)] hover:border-[var(--ds-border)]'
      }`}
      title={account ? `${account.displayName} (${account.email})` : 'Not signed in'}
    >
      {/* Avatar */}
      {account?.avatarUrl ? (
        <img
          src={account.avatarUrl}
          alt={account.displayName}
          referrerPolicy="no-referrer"
          className="w-6 h-6 rounded-full object-cover shrink-0 ring-1 ring-white/10"
        />
      ) : (
        <span
          aria-hidden="true"
          className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white shadow-xs bg-brand"
        >
          {initials}
        </span>
      )}

      {/* Details */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-xs font-semibold truncate leading-tight ${
              needsReauth ? 'text-amber-400' : 'text-[var(--ds-text-primary)]'
            }`}
          >
            {needsReauth ? 'Re-auth needed' : label}
          </span>
          {!needsReauth && account && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
              title="Active session"
            />
          )}
        </div>
        {sublabel && !needsReauth && (
          <span className="text-[10px] text-[var(--ds-text-tertiary)] truncate leading-tight font-mono mt-0.5">
            {sublabel}
          </span>
        )}
      </div>

      <ChevronRight
        size={13}
        className="text-[var(--ds-text-tertiary)] group-hover:text-[var(--ds-text-primary)] transition-colors shrink-0"
      />
    </div>
  );
}

function StorageIndicator() {
  return (
    <div className="p-2.5 rounded-xl bg-[var(--ds-bg-raised)] border border-[var(--ds-border-subtle)] space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-[var(--ds-text-secondary)]">
          <HardDrive size={13} className="text-[var(--ds-brand)]" />
          Local Index
        </span>
        <span className="text-[10px] font-mono text-[var(--ds-text-tertiary)] flex items-center gap-1">
          <ShieldCheck size={11} className="text-emerald-400" />
          WAL + FTS5
        </span>
      </div>

      {/* Progress meter */}
      <div className="h-1.5 w-full rounded-full bg-[var(--ds-bg-overlay)] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
          style={{ width: '100%' }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-[var(--ds-text-tertiary)]">
        <span>Instant Search</span>
        <span className="font-medium text-emerald-400">Offline-ready</span>
      </div>
    </div>
  );
}
