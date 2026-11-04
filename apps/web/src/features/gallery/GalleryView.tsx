import { useState, useEffect } from 'react';
import {
  Calendar,
  Grid,
  Heart,
  SlidersHorizontal,
  RefreshCw,
  CheckCircle2,
  Image as ImageIcon,
  Clock,
  Layers,
  Users,
  Loader2,
  AlertCircle,
  HardDrive,
  Zap,
} from 'lucide-react';
import type { AccountSummary } from '../../lib/api';
import { subscribeSyncProgress } from '../../lib/api';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import type { SyncProgressEvent } from '../../lib/api';

interface GalleryViewProps {
  account?: AccountSummary | null;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

function formatRelativeTime(ms: number | null): string {
  if (!ms) return 'Never';
  const delta = Date.now() - ms;
  if (delta < 60_000) return 'Just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

export function GalleryView({ account, activeTab = 'gallery', onTabChange }: GalleryViewProps) {
  const [selectedYear, setSelectedYear] = useState('All');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');
  const [liveProgress, setLiveProgress] = useState<SyncProgressEvent | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const { syncStatus, isSyncing, triggerSync } = useSyncStatus();

  const years = ['All', '2026', '2025', '2024', '2023', 'Older'];

  const subTabs = [
    { id: 'moments', label: 'Moments', icon: Clock },
    { id: 'gallery', label: 'Gallery', icon: Grid },
    { id: 'albums', label: 'Albums', icon: Layers },
    { id: 'favorites', label: 'Favorites', icon: Heart },
    { id: 'people', label: 'People', icon: Users },
  ];

  // SSE subscription for live progress during sync
  useEffect(() => {
    if (!isSyncing && !liveProgress) return;

    const unsubscribe = subscribeSyncProgress((event) => {
      if (event.type === 'progress' || event.type === 'done') {
        setLiveProgress(event);
      } else if (event.type === 'error') {
        setSyncError(event.message ?? 'Sync failed');
        setLiveProgress(null);
      }
      if (event.type === 'done') {
        // Clear progress after a brief delay so user sees completion
        setTimeout(() => setLiveProgress(null), 3000);
      }
    });
    return unsubscribe;
  }, [isSyncing, liveProgress]);

  const accountSyncInfo = syncStatus?.accounts[0] ?? null;
  const fileCount = accountSyncInfo?.fileCount ?? 0;
  const syncDone = accountSyncInfo?.fullSyncStage === 'done';
  const lastSync = accountSyncInfo?.lastFullSyncAt ?? accountSyncInfo?.lastIncrementalAt ?? null;

  async function handleSyncStart(): Promise<void> {
    if (!accountSyncInfo) return;
    setSyncError(null);
    await triggerSync(accountSyncInfo.id);
  }

  // Sample visual layout for when sync is not done yet
  const sampleItems = [
    { id: 1, title: 'DSC_4821.jpg', date: 'Today', ratio: 'aspect-[4/3]', gradient: 'from-blue-600/30 to-violet-600/30' },
    { id: 2, title: 'Mountain_Sunrise.png', date: 'Yesterday', ratio: 'aspect-[16/9]', gradient: 'from-amber-500/30 to-rose-600/30' },
    { id: 3, title: 'IMG_9024.heic', date: 'Nov 2', ratio: 'aspect-[3/4]', gradient: 'from-emerald-500/30 to-teal-700/30' },
    { id: 4, title: 'Screenshot.png', date: 'Nov 1', ratio: 'aspect-[16/10]', gradient: 'from-indigo-600/30 to-cyan-600/30' },
    { id: 5, title: 'Studio_Shoot.jpg', date: 'Oct 28', ratio: 'aspect-square', gradient: 'from-fuchsia-600/30 to-purple-800/30' },
    { id: 6, title: 'Architecture.jpg', date: 'Oct 25', ratio: 'aspect-[3/2]', gradient: 'from-zinc-700/40 to-slate-800/40' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-ds-bg text-ds-text-primary">
      {/* Sub-navigation & Toolbar */}
      <div className="sticky top-0 z-20 glass border-b border-ds-border px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Photo Subtabs */}
        <div className="flex items-center gap-1 bg-ds-bg-elevated p-1 rounded-lg border border-ds-border/60">
          {subTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange?.(id)}
              className={[
                'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all',
                activeTab === id
                  ? 'bg-ds-bg-raised text-ds-text-primary shadow-sm border border-ds-border/60'
                  : 'text-ds-text-secondary hover:text-ds-text-primary hover:bg-ds-bg-hover',
              ].join(' ')}
            >
              <Icon size={13} className={activeTab === id ? 'text-brand' : 'opacity-70'} />
              {label}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-ds-bg-elevated px-2 py-1 rounded-lg border border-ds-border/60 text-xs text-ds-text-secondary">
            <Calendar size={13} className="text-brand opacity-80" />
            <span className="font-semibold mr-1">Jump:</span>
            {years.map((yr) => (
              <button
                key={yr}
                onClick={() => setSelectedYear(yr)}
                className={[
                  'px-2 py-0.5 rounded text-xs transition-colors',
                  selectedYear === yr ? 'bg-brand text-white font-semibold' : 'hover:text-ds-text-primary',
                ].join(' ')}
              >
                {yr}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-ds-bg-elevated p-1 rounded-lg border border-ds-border/60">
            <button
              onClick={() => setDensity('comfortable')}
              className={[
                'p-1 rounded text-xs transition-colors',
                density === 'comfortable' ? 'bg-ds-bg-raised text-ds-text-primary' : 'text-ds-text-muted hover:text-ds-text-secondary',
              ].join(' ')}
              title="Comfortable grid"
            >
              <Grid size={14} />
            </button>
            <button
              onClick={() => setDensity('compact')}
              className={[
                'p-1 rounded text-xs transition-colors',
                density === 'compact' ? 'bg-ds-bg-raised text-ds-text-primary' : 'text-ds-text-muted hover:text-ds-text-secondary',
              ].join(' ')}
              title="Compact grid"
            >
              <SlidersHorizontal size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">

        {/* Sync Status Banner */}
        <div className={[
          'card p-5 mb-8 border',
          isSyncing
            ? 'bg-gradient-to-r from-blue-950/30 via-zinc-900 to-blue-950/20 border-blue-500/20'
            : syncDone
            ? 'bg-gradient-to-r from-emerald-950/20 via-zinc-900 to-teal-950/20 border-emerald-500/20'
            : 'bg-gradient-to-r from-blue-950/20 via-zinc-900 to-violet-950/20 border-brand/20',
        ].join(' ')}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className={[
                'w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 mt-0.5',
                isSyncing ? 'bg-blue-500/10 border-blue-500/20' : syncDone ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-brand/10 border-brand/20',
              ].join(' ')}>
                {isSyncing ? (
                  <Loader2 size={20} className="text-blue-400 animate-spin" />
                ) : syncDone ? (
                  <CheckCircle2 size={20} className="text-emerald-400" />
                ) : (
                  <HardDrive size={20} className="text-brand" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-semibold text-ds-text-primary">
                    {isSyncing
                      ? 'Syncing Drive…'
                      : syncDone
                      ? 'Drive Synced'
                      : account
                      ? 'Ready to Sync'
                      : 'Google Drive Connected'}
                  </h3>
                  {syncDone && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Phase 2 Active
                    </span>
                  )}
                  {isSyncing && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">
                      Indexing…
                    </span>
                  )}
                </div>

                <p className="text-xs text-ds-text-secondary max-w-xl leading-relaxed">
                  {isSyncing && liveProgress?.indexed != null ? (
                    <>Indexed <strong className="text-ds-text-primary">{liveProgress.indexed.toLocaleString()}</strong> files so far…</>
                  ) : syncDone ? (
                    <>
                      <strong className="text-ds-text-primary">{fileCount.toLocaleString()}</strong> files indexed locally.
                      Last sync: <strong className="text-ds-text-primary">{formatRelativeTime(lastSync)}</strong>.
                      Tokens stored securely in your OS keychain.
                    </>
                  ) : account ? (
                    <>
                      Signed in as <strong className="text-ds-text-primary">{account.displayName}</strong> ({account.email}).
                      Start a sync to index your Drive into local SQLite.
                    </>
                  ) : (
                    'Connect your Google account to start syncing.'
                  )}
                </p>

                {/* SSE progress bar */}
                {isSyncing && liveProgress?.indexed != null && (
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-ds-bg-elevated rounded-full overflow-hidden max-w-xs">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-brand rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (liveProgress.indexed / 10000) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-mono text-ds-text-muted">
                      {liveProgress.indexed.toLocaleString()} files
                    </span>
                  </div>
                )}

                {/* Stats row when sync is done */}
                {syncDone && fileCount > 0 && (
                  <div className="flex items-center gap-3 mt-3 text-xs text-ds-text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <HardDrive size={12} className="text-brand" />
                      {fileCount.toLocaleString()} files indexed
                    </span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Zap size={12} className="text-brand" />
                      FTS5 search ready
                    </span>
                    <span>•</span>
                    <span>Auto-sync every 5 min</span>
                  </div>
                )}

                {syncError && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-red-400">
                    <AlertCircle size={13} />
                    {syncError}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => void handleSyncStart()}
              disabled={isSyncing || !account}
              className={[
                'btn-primary flex items-center gap-2 text-xs py-2 px-3.5 flex-shrink-0',
                (isSyncing || !account) ? 'opacity-60 cursor-not-allowed' : '',
              ].join(' ')}
              title={isSyncing ? 'Sync in progress…' : 'Start full Drive sync'}
            >
              <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Syncing…' : 'Sync Drive'}
            </button>
          </div>
        </div>

        {/* Grid header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-lg font-bold tracking-tight capitalize text-ds-text-primary">{activeTab}</h2>
            <span className="text-xs text-ds-text-muted">
              {syncDone && fileCount > 0 ? `${fileCount.toLocaleString()} files` : 'Preview layout'}
            </span>
          </div>
          <span className="text-xs font-mono text-ds-text-muted">
            {syncDone && fileCount > 0 ? `Synced ${formatRelativeTime(lastSync)}` : `${sampleItems.length} preview items`}
          </span>
        </div>

        {/* Photo grid — preview items (Phase 3 will render real thumbnails) */}
        <div className={[
          'grid gap-4 transition-all duration-200',
          density === 'comfortable'
            ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
            : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6',
        ].join(' ')}>
          {sampleItems.map((item) => (
            <div
              key={item.id}
              className="group relative rounded-xl overflow-hidden border border-ds-border bg-ds-bg-raised transition-all duration-200 cursor-pointer hover:border-brand/50 hover:shadow-lg"
            >
              <div className={['w-full bg-gradient-to-br flex flex-col justify-between p-3.5 relative overflow-hidden', item.ratio, item.gradient].join(' ')}>
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:12px_12px]" />
                <div className="relative z-10 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-md text-white/90">
                    {syncDone ? 'Indexed' : 'Preview'}
                  </span>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center text-white/80 hover:text-rose-400 hover:scale-110 transition-all"
                  >
                    <Heart size={13} />
                  </button>
                </div>
                <div className="relative z-10 flex items-center justify-center my-auto opacity-40 group-hover:opacity-70 group-hover:scale-105 transition-all">
                  <ImageIcon size={32} className="text-white" />
                </div>
                <div className="relative z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-lg text-white">
                    <p className="text-xs font-semibold truncate">{item.title}</p>
                    <p className="text-[10px] text-white/70 font-mono mt-0.5">{item.date}</p>
                  </div>
                </div>
              </div>
              <div className="p-2.5 bg-ds-bg-raised border-t border-ds-border/40 flex items-center justify-between text-xs">
                <span className="font-medium text-ds-text-primary truncate max-w-[140px]">{item.title}</span>
                <span className="text-[11px] text-ds-text-muted whitespace-nowrap">{item.date}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Phase 3 notice */}
        <div className="mt-8 p-4 rounded-xl border border-ds-border/40 bg-ds-bg-elevated text-center">
          <p className="text-xs text-ds-text-muted">
            <strong className="text-ds-text-secondary">Phase 3:</strong> Virtualized 60 fps photo grid with real thumbnails, lightbox viewer, and infinite scroll.
            {syncDone && fileCount > 0 && (
              <> <strong className="text-brand">{fileCount.toLocaleString()} files</strong> ready to display.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
