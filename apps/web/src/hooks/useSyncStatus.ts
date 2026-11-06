/**
 * useSyncStatus.ts — Poll /api/sync/status every 5 seconds and listen to SSE stream.
 *
 * Returns:
 *   syncStatus     — current sync state for all accounts (null while loading)
 *   isSyncing      — true if any account is currently syncing
 *   syncPhase      — 'idle' | 'syncing' | 'completed' | 'error'
 *   syncEvent      — last SSE event (progress, done, error)
 *   error          — error message string or null
 *   triggerSync    — function to kick off a full sync for an account
 *   refresh        — force an immediate status refresh
 *   dismissToast   — hide the sync popup toast
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSyncStatus,
  triggerSync as apiTriggerSync,
  subscribeSyncProgress,
  type SyncStatus,
  type SyncProgressEvent,
} from '../lib/api';

const POLL_INTERVAL_MS = 5_000;

export function useSyncStatus() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [syncPhase, setSyncPhase] = useState<'idle' | 'syncing' | 'completed' | 'error'>('idle');
  const [syncEvent, setSyncEvent] = useState<SyncProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastDismissed, setToastDismissed] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSyncingRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await getSyncStatus();
      setSyncStatus(status);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load sync status';
      setError(msg);
    }
  }, []);

  // Poll every 5 seconds
  useEffect(() => {
    void fetchStatus();

    const schedule = (): void => {
      timeoutRef.current = setTimeout(() => {
        void fetchStatus().finally(schedule);
      }, POLL_INTERVAL_MS);
    };
    schedule();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [fetchStatus]);

  // Subscribe to real-time SSE progress events
  useEffect(() => {
    const unsubscribe = subscribeSyncProgress((event) => {
      if (event.type === 'connected') return;

      setSyncEvent(event);
      setToastDismissed(false);

      if (event.type === 'progress') {
        setSyncPhase('syncing');
        setError(null);
      } else if (event.type === 'done') {
        setSyncPhase('completed');
        setError(null);
        void fetchStatus();

        if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
        autoDismissRef.current = setTimeout(() => {
          setSyncPhase('idle');
        }, 6000);
      } else if (event.type === 'error') {
        setSyncPhase('error');
        setError(event.message ?? 'Sync encountered an error');
      }
    });

    return () => {
      unsubscribe();
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    };
  }, [fetchStatus]);

  const serverSyncing = syncStatus?.accounts.some((a) => a.status === 'syncing') ?? false;
  const isSyncing = isTriggering || serverSyncing;

  // Track transition from syncing -> done in polling
  useEffect(() => {
    if (prevSyncingRef.current && !serverSyncing && syncPhase === 'syncing') {
      const anyError = syncStatus?.accounts.some((a) => a.status === 'error');
      if (anyError) {
        setSyncPhase('error');
        setError('Sync finished with errors');
      } else {
        setSyncPhase('completed');
        if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
        autoDismissRef.current = setTimeout(() => {
          setSyncPhase('idle');
        }, 6000);
      }
    }
    prevSyncingRef.current = serverSyncing;
  }, [serverSyncing, syncPhase, syncStatus]);

  const triggerSync = useCallback(
    async (accountId: string): Promise<void> => {
      setIsTriggering(true);
      setSyncPhase('syncing');
      setError(null);
      setToastDismissed(false);
      try {
        await apiTriggerSync(accountId);
        await fetchStatus();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Sync trigger failed';
        setError(msg);
        setSyncPhase('error');
      } finally {
        setIsTriggering(false);
      }
    },
    [fetchStatus],
  );

  const dismissToast = useCallback(() => {
    setToastDismissed(true);
    setSyncPhase('idle');
  }, []);

  return {
    syncStatus,
    isSyncing,
    syncPhase,
    syncEvent,
    error,
    toastDismissed,
    triggerSync,
    refresh: fetchStatus,
    dismissToast,
  };
}
