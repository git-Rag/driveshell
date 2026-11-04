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

interface MediaParams {
  fileId: string;
}

interface ThumbQuery {
  size?: string;
  accountId?: string;
}

export async function registerMediaRoutes(
  app: FastifyInstance,
  db: Db,
  port: number,
): Promise<void> {
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

      // 1. Return from disk cache if present
      if (fs.existsSync(cacheFile)) {
        reply.header('Content-Type', 'image/jpeg');
        reply.header('Cache-Control', 'public, max-age=604800, immutable');
        return reply.send(fs.createReadStream(cacheFile));
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

          const response = await fetch(driveThumbUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Save to disk asynchronously
            fs.writeFile(cacheFile, buffer, () => {});

            reply.header('Content-Type', 'image/jpeg');
            reply.header('Cache-Control', 'public, max-age=604800, immutable');
            return reply.send(buffer);
          }
        } catch {
          // Fall through to Drive API if direct fetch fails
        }
      }

      // 3. Fallback: stream directly from Google Drive API
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res: any = await drive.files.get(
          { fileId, alt: 'media' },
          { responseType: 'stream' },
        );

        reply.header('Content-Type', file.mime_type || 'image/jpeg');
        reply.header('Cache-Control', 'public, max-age=86400');
        return reply.send(res.data);
      } catch (err) {
        req.log.warn({ fileId, err }, 'Failed to fetch media thumbnail');
        return reply.code(404).send({ error: 'Thumbnail not available' });
      }
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const driveRes: any = await drive.files.get(
          { fileId, alt: 'media' },
          reqOptions,
        );

        // Forward content headers from Google Drive
        const headers = driveRes.headers as Record<string, string | undefined>;
        if (headers['content-range']) reply.header('Content-Range', headers['content-range']);
        if (headers['content-length']) reply.header('Content-Length', headers['content-length']);
        if (headers['accept-ranges']) reply.header('Accept-Ranges', headers['accept-ranges']);
        else reply.header('Accept-Ranges', 'bytes');

        reply.header('Content-Type', file.mime_type);
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const driveRes: any = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

      const filename = encodeURIComponent(file.name);
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.header('Content-Type', file.mime_type || 'application/octet-stream');
      if (file.size_bytes) reply.header('Content-Length', file.size_bytes);

      return reply.send(driveRes.data);
    },
  );
}
