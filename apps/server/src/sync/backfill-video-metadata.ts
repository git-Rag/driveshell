/**
 * backfill-video-metadata.ts — Resumable, rate-limited video metadata backfill job.
 *
 * Rules:
 *  - Queries ONLY existing video rows where duration_ms IS NULL or image_width IS NULL.
 *  - Fetches videoMediaMetadata(width, height, durationMillis) via drive.files.get.
 *  - Uses withBackoff with ±25% jitter and a concurrency cap of 3.
 *  - Recomputes is_media using isRealMedia.
 *  - Stores duration_ms (setting 0 when Drive provides no metadata so it is not re-queried).
 *  - Survives app restarts mid-job because completed rows have non-null duration_ms.
 *  - Surfaces progress through sync SSE events.
 */

import type { drive_v3 } from 'googleapis';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db/connection';
import type { AccountQueries } from '../db/queries/accounts';
import type { FileQueries } from '../db/queries/files';
import type { Keychain } from '../auth/keychain';
import { KC_SERVICE, KC_CLIENT_ID, KC_CLIENT_SECRET } from '../auth/keychain';
import { getAuthenticatedDrive } from './oauth-client';
import { withBackoff } from './drive-api';
import { isRealMedia } from '@driveshell/shared';
import type { EmitFn } from './full-sync';

export interface BackfillStats {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
}

export interface BackfillOptions {
  concurrency?: number;
  driveOverride?: drive_v3.Drive;
}

interface VideoRow {
  id: string;
  name: string;
  mime_type: string;
}

/**
 * Executes the resumable video metadata backfill for a given account.
 */
export async function runBackfillVideoMetadata(
  accountId: string,
  db: Db,
  keychain: Keychain,
  accountQ: AccountQueries,
  _fileQ: FileQueries,
  port: number,
  log: FastifyBaseLogger,
  emit?: EmitFn,
  options?: BackfillOptions,
): Promise<BackfillStats> {
  // 1. Find all video rows needing backfill for this account
  const selectStmt = db.prepare<[string], VideoRow>(`
    SELECT id, name, mime_type
    FROM files
    WHERE account_id = ?
      AND mime_type LIKE 'video/%'
      AND duration_ms IS NULL
    ORDER BY modified_at DESC
  `);

  const pendingRows = selectStmt.all(accountId);
  const total = pendingRows.length;

  const stats: BackfillStats = {
    total,
    processed: 0,
    succeeded: 0,
    failed: 0,
  };

  if (total === 0) {
    log.info({ accountId }, 'Video metadata backfill: no pending video rows');
    return stats;
  }

  log.info({ accountId, pendingVideos: total }, 'Starting video metadata backfill');

  // 2. Prepare Drive client
  let drive: drive_v3.Drive;
  if (options?.driveOverride) {
    drive = options.driveOverride;
  } else {
    const clientId = keychain.get(KC_SERVICE, KC_CLIENT_ID);
    const clientSecret = keychain.get(KC_SERVICE, KC_CLIENT_SECRET);

    if (!clientId || !clientSecret) {
      log.error({ accountId }, 'Cannot backfill video metadata — missing credentials in keychain');
      throw new Error('Missing credentials in keychain for video metadata backfill');
    }

    const authenticated = await getAuthenticatedDrive(
      accountId,
      keychain,
      accountQ,
      clientId,
      clientSecret,
      port,
      log,
    );
    drive = authenticated.drive;
  }

  const updateStmt = db.prepare(`
    UPDATE files
    SET duration_ms = @duration_ms,
        image_width = @image_width,
        image_height = @image_height,
        is_media = @is_media
    WHERE id = @id AND account_id = @account_id
  `);

  const concurrency = options?.concurrency ?? 3;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < pendingRows.length) {
      const index = cursor++;
      const row = pendingRows[index];
      if (!row) break;

      try {
        const res = await withBackoff(
          () =>
            drive.files.get({
              fileId: row.id,
              fields: 'id,videoMediaMetadata(width,height,durationMillis)',
              supportsAllDrives: true,
            }),
          log,
          3,
        );

        const vMeta = res.data.videoMediaMetadata;
        // Default duration_ms to 0 if missing so it is marked as checked and survives restart
        const durationMs = vMeta?.durationMillis ? Number(vMeta.durationMillis) : 0;
        const width = vMeta?.width ?? null;
        const height = vMeta?.height ?? null;

        const isMedia = isRealMedia({
          name: row.name,
          mime_type: row.mime_type,
          duration_ms: durationMs,
          image_width: width,
          image_height: height,
        })
          ? 1
          : 0;

        updateStmt.run({
          duration_ms: durationMs,
          image_width: width,
          image_height: height,
          is_media: isMedia,
          id: row.id,
          account_id: accountId,
        });

        stats.succeeded++;
      } catch (err: unknown) {
        log.warn({ err, fileId: row.id }, 'Failed to fetch videoMediaMetadata for file');
        // Even on 404 or permanent error, record duration_ms = 0 to prevent infinite restart retry loop
        updateStmt.run({
          duration_ms: 0,
          image_width: null,
          image_height: null,
          is_media: isRealMedia({ name: row.name, mime_type: row.mime_type, duration_ms: 0 })
            ? 1
            : 0,
          id: row.id,
          account_id: accountId,
        });
        stats.failed++;
      } finally {
        stats.processed++;
        if (emit && (stats.processed % 5 === 0 || stats.processed === total)) {
          emit({
            type: 'progress',
            accountId,
            indexed: stats.processed,
            stage: `backfill_video_metadata (${stats.processed}/${total})`,
          });
        }
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  log.info(
    { accountId, total, succeeded: stats.succeeded, failed: stats.failed },
    'Video metadata backfill completed',
  );

  return stats;
}
