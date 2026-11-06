import { RefreshCw, CheckCircle2, AlertCircle, X } from 'lucide-react';
import type { SyncProgressEvent } from '../lib/api';

export interface SyncToastProps {
  sidebarOpen: boolean;
  syncPhase: 'idle' | 'syncing' | 'completed' | 'error';
  isSyncing: boolean;
  syncEvent: SyncProgressEvent | null;
  error: string | null;
  toastDismissed: boolean;
  onDismiss: () => void;
  onRetry?: (() => void) | undefined;
}

export function SyncToast({
  sidebarOpen,
  syncPhase,
  isSyncing,
  syncEvent,
  error,
  toastDismissed,
  onDismiss,
  onRetry,
}: SyncToastProps) {
  // Only show if there's an active sync, recent completion, or error, and user hasn't dismissed it
  const visible =
    !toastDismissed &&
    (isSyncing ||
      syncPhase === 'syncing' ||
      syncPhase === 'completed' ||
      syncPhase === 'error' ||
      Boolean(error));

  if (!visible) return null;

  const isReconnecting = Boolean(error?.includes('Reconnecting'));
  const isActuallySyncing = isSyncing || syncPhase === 'syncing' || isReconnecting;
  const isError = !isActuallySyncing && (syncPhase === 'error' || Boolean(error));
  const isDone = !isActuallySyncing && !isError && syncPhase === 'completed';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 z-50 transition-all duration-300 ease-out select-none ${
        sidebarOpen ? 'left-[248px]' : 'left-5'
      }`}
    >
      <div
        className={`px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-center gap-3.5 max-w-sm transition-all ${
          isError
            ? 'bg-zinc-950/95 border-rose-500/40 text-zinc-100'
            : isDone
              ? 'bg-zinc-950/95 border-lime-500/40 text-zinc-100'
              : 'bg-zinc-950/95 border-brand/40 text-zinc-100'
        }`}
      >
        {/* Status Icon */}
        <div className="shrink-0 flex items-center justify-center">
          {isActuallySyncing && <RefreshCw size={17} className="text-lime-400 animate-spin" />}
          {isDone && <CheckCircle2 size={18} className="text-lime-400" />}
          {isError && <AlertCircle size={18} className="text-rose-400" />}
        </div>

        {/* Text info */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white tracking-wide">
              {isActuallySyncing
                ? isReconnecting
                  ? 'Reconnecting Live Stream…'
                  : 'Syncing Google Drive…'
                : isDone
                  ? 'Sync Complete'
                  : 'Sync Encountered an Issue'}
            </span>
            {isActuallySyncing && (
              <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse" />
            )}
          </div>
          <p className="text-[11px] text-zinc-400 truncate mt-0.5 font-mono">
            {isActuallySyncing
              ? isReconnecting
                ? 'Re-establishing SSE progress link…'
                : syncEvent?.type === 'progress' && syncEvent.indexed != null
                  ? `${syncEvent.indexed.toLocaleString()} items indexed…`
                  : 'Scanning media & metadata…'
              : isDone
                ? syncEvent?.type === 'done' && syncEvent.indexed != null
                  ? `${syncEvent.indexed.toLocaleString()} photos & videos indexed`
                  : 'Library indexed into local SQLite'
                : (error ?? 'Google Drive sync failed to start')}
          </p>
        </div>

        {/* Action button if error */}
        {isError && onRetry && (
          <button
            onClick={onRetry}
            className="text-[11px] font-semibold text-rose-300 hover:text-white px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 transition-all shrink-0"
          >
            Retry
          </button>
        )}

        {/* Close / Dismiss */}
        <button
          onClick={onDismiss}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          aria-label="Dismiss notification"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
