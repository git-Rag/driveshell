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
import { Transform } from 'node:stream';
import type { Db } from '../db/connection';
import { getDataDir } from '../db/connection';
import { buildFileQueries } from '../db/queries/files';
import { buildAccountQueries } from '../db/queries/accounts';
import { createKeychain, KC_CLIENT_ID, KC_CLIENT_SECRET, KC_SERVICE } from '../auth/keychain';
import { getAuthenticatedDrive } from '../sync/oauth-client';
import { fetchWithGuard } from '../utils/outbound-guard';
import { resolveSafePath } from '../utils/path-safety';
import { isRealMedia } from '@driveshell/shared';
import { isFFmpegAvailable, getCachedTranscodePath, transcodeToH264 } from '../media/transcoder';

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

export interface ParsedByteRange {
  start: number;
  end: number;
}

/** Parse an HTTP bytes=start-end Range header safely against a known file size. */
export function parseByteRange(
  rangeHeader: string,
  totalSize?: number | null,
): { valid: boolean; range?: ParsedByteRange; isPastEof?: boolean } {
  const match = /^bytes=(\d+)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return { valid: false };

  const start = parseInt(match[1]!, 10);
  const end = match[2] ? parseInt(match[2], 10) : totalSize != null ? totalSize - 1 : undefined;

  if (totalSize != null && totalSize > 0) {
    if (start >= totalSize || (end !== undefined && start > end)) {
      return { valid: false, isPastEof: true };
    }
    const finalEnd = Math.min(end ?? totalSize - 1, totalSize - 1);
    return { valid: true, range: { start, end: finalEnd } };
  }

  if (end !== undefined && start > end) {
    return { valid: false };
  }

  return { valid: true, range: { start, end: end ?? -1 } };
}

/** Create a Transform stream that slices a Readable stream to the [start, end] byte range inclusive. */
export function createRangeSliceStream(start: number, end: number): Transform {
  let bytesRead = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      const chunkLen = chunk.length;
      const chunkStart = bytesRead;
      const chunkEnd = bytesRead + chunkLen - 1;
      bytesRead += chunkLen;

      if (chunkEnd < start) {
        callback();
        return;
      }
      if (chunkStart > end) {
        this.push(null);
        callback();
        return;
      }

      const sliceStart = Math.max(0, start - chunkStart);
      const sliceEnd = Math.min(chunkLen, end - chunkStart + 1);
      this.push(chunk.subarray(sliceStart, sliceEnd));

      if (chunkEnd >= end) {
        this.push(null);
      }
      callback();
    },
  });
}

/** Serve a locally cached media file with full RFC 7233 HTTP Range 206/416 support. */
export function serveLocalMediaFile(
  filePath: string,
  contentType: string,
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const stat = fs.statSync(filePath);
  const totalSize = stat.size;
  const rangeHeader = req.headers['range'];

  reply.header('Content-Type', contentType);
  reply.header('Accept-Ranges', 'bytes');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Cache-Control', 'public, max-age=86400');

  if (rangeHeader) {
    const parsed = parseByteRange(rangeHeader, totalSize);
    if (parsed.isPastEof) {
      reply.header('Content-Range', `bytes */${totalSize}`);
      return reply.code(416).send({ error: 'Range Not Satisfiable' });
    }
    if (parsed.valid && parsed.range) {
      const { start, end } = parsed.range;
      const sliceLen = end - start + 1;
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      reply.header('Content-Length', sliceLen.toString());
      return reply.send(fs.createReadStream(filePath, { start, end }));
    }
  }

  reply.code(200);
  reply.header('Content-Length', totalSize.toString());
  return reply.send(fs.createReadStream(filePath));
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

      const safeFileId = sanitizeFilename(fileId);
      let cacheFile: string;
      try {
        cacheFile = resolveSafePath(thumbsDir, `${safeFileId}_s${size}.jpg`);
      } catch {
        return reply.code(400).send({ error: 'Invalid file ID' });
      }

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

      // Reject non-media or hidden files immediately to avoid hammering Google Drive API
      if (file.is_hidden === 1 || !isRealMedia(file)) {
        return reply.code(404).send({ error: 'File is not a media item' });
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
            reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
            reply.header('Access-Control-Allow-Origin', '*');
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
  // GET /api/media/transcode/status — Check if Tier 2 FFmpeg is available
  // -------------------------------------------------------------------------
  app.get('/api/media/transcode/status', () => {
    return { available: isFFmpegAvailable() };
  });

  // -------------------------------------------------------------------------
  // POST /api/media/:fileId/transcode — Trigger or check on-demand video transcoding
  // -------------------------------------------------------------------------
  app.post(
    '/api/media/:fileId/transcode',
    async (
      req: FastifyRequest<{
        Params: MediaParams;
        Querystring: { accountId?: string };
      }>,
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

      if (!isFFmpegAvailable()) {
        return reply.code(503).send({ error: 'FFmpeg transcoder not available on host' });
      }

      // 1. Check if already cached on disk
      const cachedPath = getCachedTranscodePath(fileId);
      if (cachedPath) {
        return reply.send({ ready: true, cached: true });
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

      try {
        await transcodeToH264({
          fileId,
          sourceStreamFetcher: async () => {
            const driveRes = await drive.files.get(
              { fileId, alt: 'media' },
              { responseType: 'stream' },
            );
            return driveRes.data;
          },
        });
        return reply.send({ ready: true, cached: false });
      } catch (err: unknown) {
        req.log.error({ fileId, err }, 'Failed to transcode video');
        return reply.code(500).send({ error: 'Transcoding failed' });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/media/:fileId/stream — Video / audio / media Range streaming
  // -------------------------------------------------------------------------
  app.get(
    '/api/media/:fileId/stream',
    async (
      req: FastifyRequest<{
        Params: MediaParams;
        Querystring: { accountId?: string; transcode?: string };
      }>,
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

      // Reject non-media or hidden files immediately to avoid hammering Google Drive API
      if (file.is_hidden === 1 || !isRealMedia(file)) {
        return reply.code(404).send({ error: 'File is not a media item' });
      }

      // Handle Tier 2 on-demand video transcoding
      const wantsTranscode = req.query.transcode === '1' || req.query.transcode === 'true';
      if (wantsTranscode) {
        const cachedPath = getCachedTranscodePath(fileId);
        if (cachedPath) {
          return serveLocalMediaFile(cachedPath, 'video/mp4', req, reply);
        }
        if (!isFFmpegAvailable()) {
          return reply.code(503).send({ error: 'FFmpeg transcoder not available on host' });
        }
      }

      const rangeHeader = req.headers['range'];
      if (!wantsTranscode && rangeHeader && file.size_bytes != null && file.size_bytes > 0) {
        const parsed = parseByteRange(rangeHeader, file.size_bytes);
        if (parsed.isPastEof) {
          reply.header('Content-Range', `bytes */${file.size_bytes}`);
          reply.header('Accept-Ranges', 'bytes');
          return reply.code(416).send({ error: 'Range Not Satisfiable' });
        }
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

      // Perform on-demand transcode if requested
      if (wantsTranscode) {
        try {
          const transcodedPath = await transcodeToH264({
            fileId,
            sourceStreamFetcher: async () => {
              const driveRes = await drive.files.get(
                { fileId, alt: 'media' },
                { responseType: 'stream' },
              );
              return driveRes.data;
            },
          });
          return serveLocalMediaFile(transcodedPath, 'video/mp4', req, reply);
        } catch (err: unknown) {
          req.log.error({ fileId, err }, 'Failed to transcode video');
          return reply.code(500).send({ error: 'Transcoding failed' });
        }
      }

      try {
        const reqOptions = rangeHeader
          ? { responseType: 'stream' as const, headers: { Range: rangeHeader } }
          : { responseType: 'stream' as const };

        const driveRes = (await drive.files.get(
          { fileId, alt: 'media' },
          reqOptions,
        )) as unknown as DriveStreamResponse;

        // Propagate client abort to destroy upstream stream and prevent leaked network reads
        req.raw.on('close', () => {
          if (!req.raw.complete && driveRes?.data) {
            const stream = driveRes.data as { destroy?: () => void };
            if (typeof stream.destroy === 'function') {
              stream.destroy();
            }
          }
        });

        // Forward content headers from Google Drive
        const headers = driveRes.headers;
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
        reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cache-Control', 'private, max-age=86400');

        // Upstream returned 206 Partial Content with Content-Range
        if (headers['content-range']) {
          reply.header('Content-Range', headers['content-range']);
          if (headers['content-length']) reply.header('Content-Length', headers['content-length']);
          reply.code(206);
          return reply.send(driveRes.data);
        }

        // Fallback: Client asked for Range, but upstream returned 200 without Content-Range
        if (rangeHeader && driveRes.status === 200) {
          const parsed = parseByteRange(rangeHeader, file.size_bytes);
          if (parsed.valid && parsed.range && parsed.range.end >= parsed.range.start) {
            const { start, end } = parsed.range;
            const sliceLen = end - start + 1;
            reply.header('Content-Range', `bytes ${start}-${end}/${file.size_bytes ?? '*'}`);
            reply.header('Content-Length', sliceLen.toString());
            reply.code(206);
            const sliceStream = createRangeSliceStream(start, end);
            driveRes.data.pipe(sliceStream);
            return reply.send(sliceStream);
          }
        }

        if (headers['content-length']) reply.header('Content-Length', headers['content-length']);
        reply.code(driveRes.status ?? 200);

        return reply.send(driveRes.data);
      } catch (err: unknown) {
        const errorObj = err as { status?: number; response?: { status?: number } };
        const status = errorObj?.status ?? errorObj?.response?.status;
        if (status === 416) {
          reply.header('Content-Range', `bytes */${file.size_bytes ?? '*'}`);
          reply.header('Accept-Ranges', 'bytes');
          return reply.code(416).send({ error: 'Range Not Satisfiable' });
        }
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
