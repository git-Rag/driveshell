/**
 * scheduler.ts — Background sync scheduler.
 *
 * On startup:
 *   - Triggers an immediate incremental sync for each known account.
 *   - Schedules recurring incremental syncs every 5 minutes per account.
 *
 * Rules:
 *   - Syncs are serial per account (no parallel syncs for the same account).
 *   - If a sync is already running when the interval fires, it is skipped.
 *   - Calling `triggerSync(accountId)` triggers an immediate sync.
 */

import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/connection';
import type { AccountQueries } from '../db/queries/accounts';
import type { FileQueries } from '../db/queries/files';
import type { Keychain } from '../auth/keychain';
import type { EmitFn } from './full-sync';
import { runIncrementalSync } from './incremental-sync';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface SyncScheduler {
  /** Trigger an immediate incremental sync for `accountId`. No-op if already syncing. */
  triggerSync(accountId: string): void;
  /** Trigger an immediate full sync for `accountId`. No-op if already syncing. */
  triggerFullSync(accountId: string): void;
  /** Stop all timers (called on graceful shutdown). */
  shutdown(): void;
  /** Subscribe to progress events. Returns an unsubscribe function. */
  subscribe(listener: EmitFn): () => void;
}

export function createSyncScheduler(
  db: Db,
  keychain: Keychain,
  accountQ: AccountQueries,
  fileQ: FileQueries,
  port: number,
  log: FastifyBaseLogger,
): SyncScheduler {
  const activeSyncs = new Set<string>(); // accountIds currently syncing
  const intervals = new Map<string, ReturnType<typeof setInterval>>();
  const listeners = new Set<EmitFn>();

  function emit(event: Parameters<EmitFn>[0]): void {
    for (const l of listeners) {
      try {
        l(event);
      } catch {
        /* never let a listener crash the scheduler */
      }
    }
  }

  async function runSync(accountId: string): Promise<void> {
    if (activeSyncs.has(accountId)) {
      log.debug({ accountId }, 'Sync skipped — already in progress');
      return;
    }
    activeSyncs.add(accountId);
    try {
      await runIncrementalSync(accountId, db, keychain, accountQ, fileQ, port, log, emit);
    } catch {
      // Error already logged and emitted inside runIncrementalSync
    } finally {
      activeSyncs.delete(accountId);
    }
  }

  async function runFull(accountId: string): Promise<void> {
    if (activeSyncs.has(accountId)) {
      log.debug({ accountId }, 'Full sync skipped — already in progress');
      return;
    }
    activeSyncs.add(accountId);
    try {
      // Import here to avoid circular dep
      const { runFullSync } = await import('./full-sync');
      await runFullSync(accountId, db, keychain, accountQ, fileQ, port, log, emit);
    } catch {
      // Error already logged
    } finally {
      activeSyncs.delete(accountId);
    }
  }

  function scheduleAccount(accountId: string): void {
    if (intervals.has(accountId)) return; // already scheduled

    // Immediate sync on startup (non-blocking)
    void runSync(accountId);

    // Recurring every 5 minutes
    const id = setInterval(() => {
      void runSync(accountId);
    }, SYNC_INTERVAL_MS);
    intervals.set(accountId, id);
    log.info({ accountId, intervalMs: SYNC_INTERVAL_MS }, 'Sync scheduled');
  }

  // Schedule all existing accounts immediately
  const accounts = accountQ.findAll();
  for (const account of accounts) {
    if (account.status !== 'needs_reauth') {
      scheduleAccount(account.id);
    }
  }

  return {
    triggerSync(accountId: string): void {
      void runSync(accountId);
    },

    triggerFullSync(accountId: string): void {
      void runFull(accountId);
    },

    shutdown(): void {
      for (const [, id] of intervals) {
        clearInterval(id);
      }
      intervals.clear();
      log.info('Sync scheduler shut down');
    },

    subscribe(listener: EmitFn): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

