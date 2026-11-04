/**
 * media.ts — Media thumbnail proxy, video range streaming, and download.
 *
 * Invariants:
 *  - Thumbnails cached locally under `<dataDir>/thumbs/<fileId>_<size>.jpg`.
 *  - Video streaming supports HTTP Range requests (206 Partial Content) for seeking.
 *  - All external requests use the authenticated Drive API client via OS keychain.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/connection';
import { getDataDir } from '../db/connection';
import { buildFileQueries } from '../db/queries/files';
import { buildAccountQueries } from '../db/queries/accounts';
import { createKeychain, KC_CLIENT_ID, KC_CLIENT_SECRET, KC_SERVICE } from '../auth/keychain';
import { getAuthenticatedDrive } from '../sync/oauth-client';
import { fetchWithGuard } from '../utils/outbound-guard';

export const SAFE_INLINE_MIME_PATTERNS = [
  /^image\/(jpeg|png|webp|avif)$/i,
  /^audio\/(mpeg|mp4|ogg|wav|webm|flac|aac)$/i,
  /^video\/(mp4|webm|quicktime|ogg|x-matroska)$/i,
];

/** Check if a MIME type is safe to render inline without XSS risk (never allow SVG or HTML). */
export function isSafeInlineMime(mime: string): boolean {
  if (!mime) return false;
  const lower = mime.toLowerCase().trim();
  if (
    lower.includes('svg') ||
    lower.includes('html') ||
    lower.includes('xml') ||
    lower.includes('javascript')
  ) {
    return false;
  }
  return SAFE_INLINE_MIME_PATTERNS.some((p) => p.test(lower));
}

/** Sanitize filenames to prevent header injection or path traversal in Content-Disposition. */
export function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\x00-\x1f\x7f"/\\]/g, '_');
}

interface MediaParams {
  fileId: string;
}

interface ThumbQuery {
  size?: string;
  accountId?: string;
}

interface DriveStreamResponse {
  data: NodeJS.ReadableStream;
  headers: Record<string, string | undefined>;
  status?: number;
}

/** Check whether a buffer begins with a decodable image magic number (JPEG, PNG, WebP, GIF). */
function isValidImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  // JPEG: 0xFF 0xD8
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  // PNG: 0x89 0x50 0x4E 0x47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // WebP: RIFF .... WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return true;
  }
  // GIF: GIF87a / GIF89a
  if (buf.subarray(0, 3).toString('ascii') === 'GIF') return true;
  return false;
}

export async function registerMediaRoutes(
  app: FastifyInstance,
  db: Db,
  port: number,
): Promise<void> {
  await Promise.resolve();
  const fileQ = buildFileQueries(db);
  const accountQ = buildAccountQueries(db);
  const keychain = createKeychain(app.log);

  const thumbsDir = path.join(getDataDir(), 'thumbs');
  fs.mkdirSync(thumbsDir, { recursive: true });

  function resolveAccountId(raw?: string): string | null {
    if (raw) return raw;
    const accounts = accountQ.findAll();
    return accounts[0]?.id ?? null;
  }

  // -------------------------------------------------------------------------
  // GET /api/media/:fileId/thumb — Cached thumbnail proxy
  // -------------------------------------------------------------------------
  app.get(
    '/api/media/:fileId/thumb',
    async (
      req: FastifyRequest<{ Params: MediaParams; Querystring: ThumbQuery }>,
      reply: FastifyReply,
    ) => {
      const { fileId } = req.params;
      const sizeParam = parseInt(req.query.size ?? '400', 10);
      const size = isNaN(sizeParam) || sizeParam <= 0 ? 400 : Math.min(sizeParam, 1600);

      const cacheFile = path.join(thumbsDir, `${fileId}_s${size}.jpg`);

      // 1. Return from disk cache if present and valid
      if (fs.existsSync(cacheFile)) {
        try {
          const stats = fs.statSync(cacheFile);
          if (stats.size > 100) {
            const fd = fs.openSync(cacheFile, 'r');
            const head = Buffer.alloc(16);
            fs.readSync(fd, head, 0, 16, 0);
            fs.closeSync(fd);
            if (isValidImage(head)) {
              reply.header('Content-Type', 'image/jpeg');
              reply.header('X-Content-Type-Options', 'nosniff');
              reply.header('Content-Security-Policy', "sandbox; default-src 'none'");
              reply.header('Cache-Control', 'public, max-age=604800, immutable');
              return reply.send(fs.createReadStream(cacheFile));
            }
          }
          // Corrupted or raw non-image file cached previously, remove it
          fs.unlinkSync(cacheFile);
        } catch {
          // ignore cache validation error
        }
      }

      const accountId = resolveAccountId(req.query.accountId);
      if (!accountId) {
        return reply.code(404).send({ error: 'Account not found' });
      }

      const file = fileQ.findById(accountId, fileId);
      if (!file) {
        return reply.code(404).send({ error: 'File not found' });
      }

      // 2. If thumbnail_url is recorded from Drive, fetch and scale it
      if (file.thumbnail_url) {
        try {
          // Drive thumbnailLinks accept '=s<size>' parameter at the end
          let driveThumbUrl = file.thumbnail_url;
          if (driveThumbUrl.includes('=s')) {
            driveThumbUrl = driveThumbUrl.replace(/=s\d+.*$/, `=s${size}`);
          } else {
            driveThumbUrl = `${driveThumbUrl}=s${size}`;
          }

          // Use outbound guard: HTTPS only, exact suffix match, size cap, no token forwarding
          const { buffer } = await fetchWithGuard(driveThumbUrl);

          if (isValidImage(buffer)) {
            // Save to disk asynchronously
            fs.writeFile(cacheFile, buffer, () => {});

            reply.header('Content-Type', 'image/jpeg');
            reply.header('X-Content-Type-Options', 'nosniff');
            reply.header('Content-Security-Policy', "sandbox; default-src 'none'");
            reply.header('Cache-Control', 'public, max-age=604800, immutable');
            return reply.send(buffer);
          }
        } catch {
          // Fall through to Drive API if direct fetch fails
        }
      }

      // 3. Drive API fallback: fetch fresh thumbnail link (works for HEIC, video, camera raw)
      try {
        const clientId = keychain.get(KC_SERVICE, KC_CLIENT_ID);
        const clientSecret = keychain.get(KC_SERVICE, KC_CLIENT_SECRET);
        if (!clientId || !clientSecret) {
          return reply.code(500).send({ error: 'Credentials not configured' });
        }

        const { drive } = await getAuthenticatedDrive(
          accountId,
          keychain,
          accountQ,
          clientId,
          clientSecret,
          port,
          req.log,
        );

        // 3a. Request fresh thumbnailLink from Drive metadata API
        // Google Drive CDN automatically transcodes HEIC/HEIF and camera RAWs into JPEG
        const meta = await drive.files.get({
          fileId,
          fields: 'id, name, thumbnailLink',
        });

        const freshThumbLink = meta.data.thumbnailLink;
        if (freshThumbLink) {
          // Persist the fresh thumbnail_url in SQLite so future requests bypass Drive metadata lookup
          fileQ.updateThumbnailUrl(accountId, fileId, freshThumbLink);

          let scaledUrl = freshThumbLink;
          if (scaledUrl.includes('=s')) {
            scaledUrl = scaledUrl.replace(/=s\d+.*$/, `=s${size}`);
          } else {
            scaledUrl = `${scaledUrl}=s${size}`;
          }

          const thumbRes = await fetch(scaledUrl);
          if (thumbRes.ok) {
            const arrayBuffer = await thumbRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            if (isValidImage(buffer)) {
              fs.writeFile(cacheFile, buffer, () => {});
              reply.header('Content-Type', 'image/jpeg');
              reply.header('Cache-Control', 'public, max-age=604800, immutable');
              return reply.send(buffer);
            }
          }
        }

        // 3b. Last-ditch fallback for standard decodable images (JPEG, PNG, WebP) ONLY.
        // NEVER stream raw HEIC or video files as thumbnails because browsers fail to decode them.
        const isDecodableImage =
          file.mime_type.startsWith('image/') &&
          file.mime_type !== 'image/heic' &&
          file.mime_type !== 'image/heif' &&
          !file.name.toLowerCase().endsWith('.heic') &&
          !file.name.toLowerCase().endsWith('.heif');

        if (isDecodableImage) {
          const res = (await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' },
          )) as unknown as DriveStreamResponse;

          reply.header('Content-Type', file.mime_type || 'image/jpeg');
          reply.header('Cache-Control', 'public, max-age=86400');
          return reply.send(res.data);
        }
      } catch (err) {
        req.log.warn({ fileId, err }, 'Failed to fetch media thumbnail from Drive API');
      }

      return reply.code(404).send({ error: 'Thumbnail not available' });
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/media/:fileId/stream — Video / audio / media Range streaming
  // -------------------------------------------------------------------------
  app.get(
    '/api/media/:fileId/stream',
    async (
      req: FastifyRequest<{ Params: MediaParams; Querystring: { accountId?: string } }>,
      reply: FastifyReply,
    ) => {
      const { fileId } = req.params;
      const accountId = resolveAccountId(req.query.accountId);
      if (!accountId) {
        return reply.code(404).send({ error: 'Account not found' });
      }

      const file = fileQ.findById(accountId, fileId);
      if (!file) {
        return reply.code(404).send({ error: 'File not found' });
      }

      const clientId = keychain.get(KC_SERVICE, KC_CLIENT_ID);
      const clientSecret = keychain.get(KC_SERVICE, KC_CLIENT_SECRET);
      if (!clientId || !clientSecret) {
        return reply.code(500).send({ error: 'Credentials not configured' });
      }

      const { drive } = await getAuthenticatedDrive(
        accountId,
        keychain,
        accountQ,
        clientId,
        clientSecret,
        port,
        req.log,
      );

      const rangeHeader = req.headers['range'];

      try {
        const reqOptions = rangeHeader
          ? { responseType: 'stream' as const, headers: { Range: rangeHeader } }
          : { responseType: 'stream' as const };

        const driveRes = (await drive.files.get(
          { fileId, alt: 'media' },
          reqOptions,
        )) as unknown as DriveStreamResponse;

        // Forward content headers from Google Drive
        const headers = driveRes.headers;
        if (headers['content-range']) reply.header('Content-Range', headers['content-range']);
        if (headers['content-length']) reply.header('Content-Length', headers['content-length']);
        if (headers['accept-ranges']) reply.header('Accept-Ranges', headers['accept-ranges']);
        else reply.header('Accept-Ranges', 'bytes');

        // SEC-002: Restrict inline rendering strictly to safe raster images and audio/video.
        // Never render SVG, HTML, PDF, or active content inline.
        const safeInline = isSafeInlineMime(file.mime_type);
        if (safeInline) {
          reply.header('Content-Type', file.mime_type);
          reply.header('Content-Disposition', 'inline');
        } else {
          reply.header('Content-Type', 'application/octet-stream');
          reply.header(
            'Content-Disposition',
            `attachment; filename="${sanitizeFilename(file.name)}"`,
          );
        }

        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('Content-Security-Policy', "sandbox; default-src 'none'");
        reply.header('Cache-Control', 'private, max-age=86400');
        reply.code(driveRes.status ?? 200);

        return reply.send(driveRes.data);
      } catch (err) {
        req.log.error({ fileId, err }, 'Error streaming media');
        return reply.code(500).send({ error: 'Streaming failed' });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/media/:fileId/download — Download file
  // -------------------------------------------------------------------------
  app.get(
    '/api/media/:fileId/download',
    async (
      req: FastifyRequest<{ Params: MediaParams; Querystring: { accountId?: string } }>,
      reply: FastifyReply,
    ) => {
      const { fileId } = req.params;
      const accountId = resolveAccountId(req.query.accountId);
      if (!accountId) return reply.code(404).send({ error: 'Account not found' });

      const file = fileQ.findById(accountId, fileId);
      if (!file) return reply.code(404).send({ error: 'File not found' });

      const clientId = keychain.get(KC_SERVICE, KC_CLIENT_ID);
      const clientSecret = keychain.get(KC_SERVICE, KC_CLIENT_SECRET);
      if (!clientId || !clientSecret) {
        return reply.code(500).send({ error: 'Credentials not configured' });
      }

      const { drive } = await getAuthenticatedDrive(
        accountId,
        keychain,
        accountQ,
        clientId,
        clientSecret,
        port,
        req.log,
      );

      const driveRes = (await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' },
      )) as unknown as DriveStreamResponse;

      const safeName = sanitizeFilename(file.name);
      reply.header('Content-Disposition', `attachment; filename="${safeName}"`);
      reply.header('Content-Type', 'application/octet-stream');
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('Content-Security-Policy', "sandbox; default-src 'none'");
      if (file.size_bytes) reply.header('Content-Length', file.size_bytes);

      return reply.send(driveRes.data);
    },
  );
}
