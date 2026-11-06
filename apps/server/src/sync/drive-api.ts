/**
 * drive-api.ts — Drive API helpers with rate-limit backoff.
 *
 * All file listing uses the documented Drive v3 fields only.
 * Backoff: exponential with ±25% jitter on HTTP 429/500/503.
 */

import type { drive_v3 } from 'googleapis';
import type { FastifyBaseLogger } from 'fastify';
import { isRealMedia } from '@driveshell/shared';

// Fields requested on every files.list call.
// Using only documented Drive v3 API fields — never invent field names.
const FILE_FIELDS =
  'nextPageToken,files(id,name,mimeType,parents,size,modifiedTime,createdTime,' +
  'starred,trashed,thumbnailLink,webViewLink,' +
  'imageMediaMetadata(width,height,time,cameraMake,cameraModel),' +
  'videoMediaMetadata(width,height,durationMillis))';

const CHANGE_FIELDS =
  'nextPageToken,newStartPageToken,changes(changeType,removed,fileId,' +
  'file(id,name,mimeType,parents,size,modifiedTime,createdTime,' +
  'starred,trashed,thumbnailLink,webViewLink,' +
  'imageMediaMetadata(width,height,time,cameraMake,cameraModel),' +
  'videoMediaMetadata(width,height,durationMillis)))';

export interface DriveFilePage {
  files: drive_v3.Schema$File[];
  nextPageToken: string | null;
}

export interface DriveChangePage {
  changes: drive_v3.Schema$Change[];
  nextPageToken: string | null;
  newStartPageToken: string | null;
}

// ---------------------------------------------------------------------------
// Exponential backoff with ±25% jitter
// ---------------------------------------------------------------------------

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function isRateLimitOrTransientError(err: unknown, status: number): boolean {
  if (RETRYABLE_STATUS.has(status)) return true;
  if (status === 403) {
    const gErr = err as {
      errors?: Array<{ reason?: string; domain?: string }>;
      message?: string;
    };
    const reason = gErr.errors?.[0]?.reason ?? '';
    const msg = typeof gErr.message === 'string' ? gErr.message.toLowerCase() : '';
    if (
      reason === 'rateLimitExceeded' ||
      reason === 'userRateLimitExceeded' ||
      reason === 'dailyLimitExceeded' ||
      reason === 'quotaExceeded' ||
      msg.includes('ratelimitexceeded') ||
      msg.includes('userratelimitexceeded') ||
      msg.includes('quota exceeded')
    ) {
      return true;
    }
  }
  return false;
}

function jitter(base: number): number {
  // ±25% of base
  return base * (0.75 + Math.random() * 0.5);
}

/**
 * Wraps an async Drive API call with exponential backoff.
 * Retries on 429, 500, 502, 503, 504, and 403 rate limits. Re-throws immediately on other errors.
 */
export async function withBackoff<T>(
  fn: () => Promise<T>,
  log: FastifyBaseLogger,
  maxRetries = 5,
): Promise<T> {
  let attempt = 0;
  let delayMs = 1000;

  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;

      // Extract HTTP status if available (googleapis wraps errors with .code or .status)
      const status =
        (err as { code?: number; status?: number }).code ??
        (err as { code?: number; status?: number }).status ??
        0;

      const isRetryable = isRateLimitOrTransientError(err, status);

      if (!isRetryable || attempt >= maxRetries) {
        log.error({ err, attempt, status }, 'Drive API call failed (not retrying)');
        throw err;
      }

      const wait = Math.round(jitter(delayMs));
      log.warn({ attempt, status, waitMs: wait }, 'Drive API rate limited — retrying');
      await new Promise((resolve) => setTimeout(resolve, wait));
      delayMs = Math.min(delayMs * 2, 60_000); // cap at 60s
    }
  }
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/**
 * Fetch one page of files from Drive.
 * Pass `pageToken` for subsequent pages; `undefined` for the first page.
 */
export async function listFilesPage(
  drive: drive_v3.Drive,
  log: FastifyBaseLogger,
  pageToken?: string,
): Promise<DriveFilePage> {
  const res = await withBackoff(
    () =>
      drive.files.list({
        pageSize: 1000,
        fields: FILE_FIELDS,
        // No q filter: include trashed files so we can store trashed=1
        // and handle deletions from Drive correctly.
        ...(pageToken ? { pageToken } : {}),
      }),
    log,
  );

  return {
    files: res.data.files ?? [],
    nextPageToken: res.data.nextPageToken ?? null,
  };
}

/**
 * Fetch one page of changes from Drive.
 * `pageToken` is the cursor from the last incremental sync (or getStartPageToken).
 */
export async function listChangesPage(
  drive: drive_v3.Drive,
  log: FastifyBaseLogger,
  pageToken: string,
): Promise<DriveChangePage> {
  const res = await withBackoff(
    () =>
      drive.changes.list({
        pageToken,
        fields: CHANGE_FIELDS,
        pageSize: 1000,
        includeRemoved: true,
        includeItemsFromAllDrives: false,
        supportsAllDrives: false,
      }),
    log,
  );

  return {
    changes: res.data.changes ?? [],
    nextPageToken: res.data.nextPageToken ?? null,
    newStartPageToken: res.data.newStartPageToken ?? null,
  };
}

/**
 * Obtain the initial changes page token (call before the first full sync).
 * This token marks the point from which incremental syncs will start.
 */
export async function getStartPageToken(
  drive: drive_v3.Drive,
  log: FastifyBaseLogger,
): Promise<string> {
  const res = await withBackoff(() => drive.changes.getStartPageToken({}), log);
  const token = res.data.startPageToken;
  if (!token) throw new Error('Drive.changes.getStartPageToken returned no token');
  return token;
}

// ---------------------------------------------------------------------------
// Drive file → DB row mapper
// ---------------------------------------------------------------------------

export interface MappedFile {
  account_id: string;
  id: string;
  name: string;
  mime_type: string;
  parent_id: string | null;
  size_bytes: number | null;
  modified_at: number;
  created_at_ms: number;
  starred: number;
  trashed: number;
  thumbnail_url: string | null;
  web_view_link: string | null;
  image_width: number | null;
  image_height: number | null;
  duration_ms: number | null;
  is_media: number;
  taken_at: number | null;
  camera_make: string | null;
  camera_model: string | null;
}

/** Parse EXIF date strings (YYYY:MM:DD HH:MM:SS) or date encoded in filenames. */
export function extractMediaDate(
  rawExifTime?: string | null,
  filename?: string | null,
  fallbackTime?: number | null,
): number | null {
  const currentYear = new Date().getFullYear();

  function isValidYMD(y: number, m: number, d: number): boolean {
    return y >= 1990 && y <= currentYear && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  }

  if (rawExifTime) {
    const trimmed = rawExifTime.trim();
    // EXIF format: YYYY:MM:DD HH:MM:SS
    const m = /^(\d{4}):(\d{2}):(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(trimmed);
    if (m && m[1] && m[2] && m[3]) {
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10);
      const dy = parseInt(m[3], 10);
      if (isValidYMD(y, mo, dy)) {
        const d = new Date(
          y,
          mo - 1,
          dy,
          parseInt(m[4] ?? '0', 10),
          parseInt(m[5] ?? '0', 10),
          parseInt(m[6] ?? '0', 10),
        );
        if (!isNaN(d.getTime())) return d.getTime();
      }
    }
    const d2 = new Date(trimmed);
    if (!isNaN(d2.getTime())) {
      const y2 = d2.getFullYear();
      if (y2 >= 1990 && y2 <= currentYear) return d2.getTime();
    }
  }

  if (filename) {
    // Exclude Snapchat random ID numbers (Snapchat-20...)
    if (!filename.toLowerCase().startsWith('snapchat-')) {
      // 1. Screenshot_2026-06-13-22-45-48 or 2026-06-13
      const m1 =
        /(?:^|\D)(20\d\d)[-_](\d{2})[-_](\d{2})(?:[-_](\d{2})[-_](\d{2})[-_](\d{2}))?/.exec(
          filename,
        );
      if (m1 && m1[1] && m1[2] && m1[3]) {
        const y = parseInt(m1[1], 10);
        const mo = parseInt(m1[2], 10);
        const dy = parseInt(m1[3], 10);
        if (isValidYMD(y, mo, dy)) {
          const d = new Date(
            y,
            mo - 1,
            dy,
            parseInt(m1[4] ?? '12', 10),
            parseInt(m1[5] ?? '0', 10),
            parseInt(m1[6] ?? '0', 10),
          );
          if (!isNaN(d.getTime())) return d.getTime();
        }
      }

      // 2. IMG20260723170306 or IMG-20260526-WA or 20260723
      const m2 =
        /(?:IMG|VID|PHOTO|PXL)?[-_]?(20\d\d)(\d{2})(\d{2})(?:[-_]?(\d{2})(\d{2})(\d{2}))?/.exec(
          filename,
        );
      if (m2 && m2[1] && m2[2] && m2[3]) {
        const y = parseInt(m2[1], 10);
        const mo = parseInt(m2[2], 10);
        const dy = parseInt(m2[3], 10);
        if (isValidYMD(y, mo, dy)) {
          const d = new Date(
            y,
            mo - 1,
            dy,
            parseInt(m2[4] ?? '12', 10),
            parseInt(m2[5] ?? '0', 10),
            parseInt(m2[6] ?? '0', 10),
          );
          if (!isNaN(d.getTime())) return d.getTime();
        }
      }
    }
  }

  return fallbackTime ?? null;
}

/** Map a Drive API file object to a DB row. */
export function mapDriveFile(accountId: string, f: drive_v3.Schema$File): MappedFile | null {
  if (!f.id || !f.name || !f.mimeType) return null;

  const modifiedAt = f.modifiedTime ? new Date(f.modifiedTime).getTime() : Date.now();
  const createdAtMs = f.createdTime ? new Date(f.createdTime).getTime() : Date.now();

  const takenAt = extractMediaDate(f.imageMediaMetadata?.time, f.name, null);

  const duration_ms = f.videoMediaMetadata?.durationMillis
    ? parseInt(String(f.videoMediaMetadata.durationMillis), 10)
    : null;
  const image_width = f.imageMediaMetadata?.width ?? f.videoMediaMetadata?.width ?? null;
  const image_height = f.imageMediaMetadata?.height ?? f.videoMediaMetadata?.height ?? null;

  const isMediaBool = isRealMedia({
    name: f.name,
    mime_type: f.mimeType,
    duration_ms,
    image_width,
    image_height,
    videoMediaMetadata: f.videoMediaMetadata,
  });

  return {
    account_id: accountId,
    id: f.id,
    name: f.name,
    mime_type: f.mimeType,
    parent_id: f.parents?.[0] ?? null,
    size_bytes: f.size != null ? Number(f.size) : null,
    modified_at: modifiedAt,
    created_at_ms: createdAtMs,
    starred: f.starred ? 1 : 0,
    trashed: f.trashed ? 1 : 0,
    thumbnail_url: f.thumbnailLink ?? null,
    web_view_link: f.webViewLink ?? null,
    image_width,
    image_height,
    duration_ms,
    is_media: isMediaBool ? 1 : 0,
    taken_at: takenAt,
    camera_make: f.imageMediaMetadata?.cameraMake ?? null,
    camera_model: f.imageMediaMetadata?.cameraModel ?? null,
  };
}
