/**
 * incremental-sync.ts — Drive Changes API incremental sync.
 *
 * Uses the page token stored in `accounts.changes_page_token` to fetch
 * only files changed since the last sync. If no token exists, triggers
 * a full sync first.
 */

import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/connection';
import type { AccountQueries } from '../db/queries/accounts';
import type { FileQueries } from '../db/queries/files';
import type { Keychain } from '../auth/keychain';
import { KC_SERVICE, KC_CLIENT_ID, KC_CLIENT_SECRET } from '../auth/keychain';
import { getAuthenticatedDrive } from './oauth-client';
import { listChangesPage, mapDriveFile } from './drive-api';
import { runFullSync } from './full-sync';
import type { EmitFn } from './full-sync';

/**
 * Run an incremental sync for the given account.
 *
 * If no changes_page_token exists (first run), delegates to runFullSync.
 * Otherwise, processes all pending change pages and updates the cursor.
 */
export async function runIncrementalSync(
  accountId: string,
  db: Db,
  keychain: Keychain,
  accountQ: AccountQueries,
  fileQ: FileQueries,
  port: number,
  log: FastifyBaseLogger,
  emit: EmitFn,
): Promise<void> {
  const account = accountQ.findById(accountId);
  if (!account) {
    log.warn({ accountId }, 'Incremental sync: account not found');
    return;
  }

  // If no changes token, run a full sync first
  if (!account.changes_page_token) {
    log.info({ accountId }, 'No changes token — running full sync');
    return runFullSync(accountId, db, keychain, accountQ, fileQ, port, log, emit);
  }

  const clientId = keychain.get(KC_SERVICE, KC_CLIENT_ID);
  const clientSecret = keychain.get(KC_SERVICE, KC_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new Error('OAuth credentials not configured');
  }

  accountQ.setStatus(accountId, 'syncing');

  const { drive } = await getAuthenticatedDrive(
    accountId,
    keychain,
    accountQ,
    clientId,
    clientSecret,
    port,
    log,
  );

  let pageToken = account.changes_page_token;
  let totalChanges = 0;

  try {
    while (true) {
      const { changes, nextPageToken, newStartPageToken } = await listChangesPage(
        drive,
        log,
        pageToken,
      );

      let deleted = 0;
      let upserted = 0;

      for (const change of changes) {
        // A change is a deletion if the file was removed from Drive or trashed
        if (change.removed || change.file?.trashed) {
          if (change.fileId) {
            fileQ.deleteFile(accountId, change.fileId);
            deleted++;
          }
        } else if (change.file) {
          const row = mapDriveFile(accountId, change.file);
          if (row) {
            fileQ.upsertFile(row);
            upserted++;
          }
        }
      }

      totalChanges += changes.length;
      log.info(
        { accountId, pageChanges: changes.length, upserted, deleted, totalChanges },
        'Incremental sync page',
      );

      emit({
        type: 'progress',
        accountId,
        indexed: fileQ.countByAccount(accountId),
        stage: 'incremental',
      });

      // Advance cursor
      const nextToken = nextPageToken ?? newStartPageToken;
      if (nextToken) {
        accountQ.updateSyncCursors(accountId, { changes_page_token: nextToken });
        pageToken = nextToken;
      }

      if (!nextPageToken) break; // exhausted all change pages
    }

    if (totalChanges > 0) {
      fileQ.recomputeHiddenFiles();
    }

    // Update last_incremental_at and status
    accountQ.updateSyncCursors(accountId, { last_incremental_at: Date.now() });
    accountQ.setStatus(accountId, 'ok');

    const finalCount = fileQ.countByAccount(accountId);
    log.info({ accountId, totalChanges, finalCount }, 'Incremental sync complete');
    emit({ type: 'done', accountId, indexed: finalCount });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ accountId, err }, 'Incremental sync failed');
    accountQ.setStatus(accountId, 'error');
    emit({ type: 'error', accountId, message });
    throw err;
  }
}
