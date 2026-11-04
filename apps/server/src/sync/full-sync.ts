/**
 * full-sync.ts — Resumable full Drive sync engine.
 *
 * Strategy:
 *   1. Fetch all files from Drive one page at a time (1 000 files/page).
 *   2. After each page, persist the page token to `accounts.full_sync_page_token`
 *      so a crash/restart can resume without re-scanning from the beginning.
 *   3. After all pages:
 *      - Get the Changes start page token (marks where incremental sync begins).
 *      - Set full_sync_stage = 'done', status = 'ok', last_full_sync_at = now.
 *   4. Emit SSE-compatible progress events via the `emit` callback.
 */

import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/connection';
import type { AccountQueries } from '../db/queries/accounts';
import type { FileQueries } from '../db/queries/files';
import type { Keychain } from '../auth/keychain';
import { KC_SERVICE, KC_CLIENT_ID, KC_CLIENT_SECRET } from '../auth/keychain';
import { getAuthenticatedDrive } from './oauth-client';
import { listFilesPage, getStartPageToken, mapDriveFile } from './drive-api';

export type SyncProgressEvent =
  | { type: 'progress'; accountId: string; indexed: number; stage: string }
  | { type: 'done'; accountId: string; indexed: number }
  | { type: 'error'; accountId: string; message: string };

export type EmitFn = (event: SyncProgressEvent) => void;

/**
 * Run a full sync for the given account.
 * Resumes from `accounts.full_sync_page_token` if a previous run was interrupted.
 *
 * @param db        - SQLite connection (not used directly; passed for DI consistency)
 * @param keychain  - keychain for reading client credentials + refresh token
 * @param accountQ  - account query helpers
 * @param fileQ     - file query helpers
 * @param port      - server port (for OAuth2 redirect URI construction)
 * @param log       - Fastify logger
 * @param emit      - progress event callback (fires per page)
 */
export async function runFullSync(
  accountId: string,
  _db: Db,
  keychain: Keychain,
  accountQ: AccountQueries,
  fileQ: FileQueries,
  port: number,
  log: FastifyBaseLogger,
  emit: EmitFn,
): Promise<void> {
  const clientId = keychain.get(KC_SERVICE, KC_CLIENT_ID);
  const clientSecret = keychain.get(KC_SERVICE, KC_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new Error('OAuth credentials not configured');
  }

  // Mark account as syncing
  accountQ.setStatus(accountId, 'syncing');
  log.info({ accountId }, 'Full sync starting');

  const { drive } = await getAuthenticatedDrive(
    accountId,
    keychain,
    accountQ,
    clientId,
    clientSecret,
    port,
    log,
  );

  // Resume from previous page token if available
  const account = accountQ.findById(accountId);
  let pageToken: string | undefined = account?.full_sync_page_token ?? undefined;
  let totalIndexed = fileQ.countByAccount(accountId); // already-indexed count for resume display
  let page = 0;

  try {
    while (true) {
      page++;
      const { files, nextPageToken } = await listFilesPage(drive, log, pageToken);

      // Map and upsert in a single transaction per page
      const rows = files.map((f) => mapDriveFile(accountId, f)).filter((r) => r !== null);
      if (rows.length > 0) {
        fileQ.upsertBatch(rows);
        totalIndexed += rows.length;
      }

      // Persist resume cursor after every page
      accountQ.updateSyncCursors(accountId, {
        full_sync_page_token: nextPageToken,
        full_sync_stage: 'syncing',
      });

      log.info({ accountId, page, pageFiles: files.length, totalIndexed }, 'Sync page complete');

      emit({ type: 'progress', accountId, indexed: totalIndexed, stage: 'full_sync' });

      if (!nextPageToken) break;
      pageToken = nextPageToken;
    }

    // Obtain changes start token now that full sync is complete
    const changesToken = await getStartPageToken(drive, log);

    // Mark full sync complete
    accountQ.updateSyncCursors(accountId, {
      full_sync_page_token: null,
      full_sync_stage: 'done',
      changes_page_token: changesToken,
      last_full_sync_at: Date.now(),
    });
    accountQ.setStatus(accountId, 'ok');

    const finalCount = fileQ.countByAccount(accountId);
    log.info({ accountId, finalCount }, 'Full sync complete');
    emit({ type: 'done', accountId, indexed: finalCount });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ accountId, err }, 'Full sync failed');
    accountQ.setStatus(accountId, 'error');
    emit({ type: 'error', accountId, message });
    throw err;
  }
}
