/**
 * useSyncStatus.ts — Poll /api/sync/status every 5 seconds.
 *
 * Returns:
 *   syncStatus  — current sync state for all accounts (null while loading)
 *   isSyncing   — true if any account is currently syncing
 *   triggerSync — function to kick off a full sync for an account
 *   refresh     — force an immediate status refresh
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSyncStatus, triggerSync as apiTriggerSync } from '../lib/api';
import type { SyncStatus } from '../lib/api';

const POLL_INTERVAL_MS = 5_000;

export function useSyncStatus() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await getSyncStatus();
      setSyncStatus(status);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sync status');
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

  const isSyncing = syncStatus?.accounts.some((a) => a.status === 'syncing') ?? false;

  const triggerSync = useCallback(
    async (accountId: string): Promise<void> => {
      try {
        await apiTriggerSync(accountId);
        // Immediately refresh status
        await fetchStatus();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Sync trigger failed';
        setError(msg);
      }
    },
    [fetchStatus],
  );

  return {
    syncStatus,
    isSyncing,
    error,
    triggerSync,
    refresh: fetchStatus,
  };
}

