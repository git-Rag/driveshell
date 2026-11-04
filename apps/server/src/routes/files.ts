/**
 * files.ts — File listing and search routes.
 *
 * Routes:
 *   GET /api/files/list    — paginated file listing (all non-trashed)
 *   GET /api/files/photos  — paginated photo listing (image/* + video/*)
 *   GET /api/files/search  — FTS5 / LIKE hybrid search
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '../db/connection';
import { buildFileQueries } from '../db/queries/files';
import { buildAccountQueries } from '../db/queries/accounts';

interface ListQuery {
  accountId?: string;
  offset?: string;
  limit?: string;
}

interface SearchQuery {
  accountId?: string;
  q?: string;
  limit?: string;
}

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin convention
export async function registerFileRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const fileQ = buildFileQueries(db);
  const accountQ = buildAccountQueries(db);

  // Helper: resolve accountId — if not provided, use the first account
  function resolveAccountId(raw: string | undefined): string | null {
    if (raw) return raw;
    const all = accountQ.findAll();
    return all[0]?.id ?? null;
  }

  // -------------------------------------------------------------------------
  // GET /api/files/list
  // -------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/require-await
  app.get('/api/files/list', async (req: FastifyRequest<{ Querystring: ListQuery }>, reply: FastifyReply) => {
    const accountId = resolveAccountId(req.query.accountId);
    if (!accountId) return reply.code(404).send({ error: 'No account found' });

    const offset = Math.max(0, parseInt(req.query.offset ?? '0', 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit ?? '50', 10) || 50));

    const files = fileQ.listFiles(accountId, { offset, limit });
    const total = fileQ.countByAccount(accountId);

    return reply.send({ files, total, offset, limit });
  });

  // -------------------------------------------------------------------------
  // GET /api/files/photos
  // -------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/require-await
  app.get('/api/files/photos', async (req: FastifyRequest<{ Querystring: ListQuery }>, reply: FastifyReply) => {
    const accountId = resolveAccountId(req.query.accountId);
    if (!accountId) return reply.code(404).send({ error: 'No account found' });

    const offset = Math.max(0, parseInt(req.query.offset ?? '0', 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit ?? '50', 10) || 50));

    const files = fileQ.listPhotos(accountId, { offset, limit });

    return reply.send({ files, offset, limit });
  });

  // -------------------------------------------------------------------------
  // GET /api/files/search
  // -------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/require-await
  app.get('/api/files/search', async (req: FastifyRequest<{ Querystring: SearchQuery }>, reply: FastifyReply) => {
    const accountId = resolveAccountId(req.query.accountId);
    if (!accountId) return reply.code(404).send({ error: 'No account found' });

    const q = (req.query.q ?? '').trim();
    if (!q) return reply.send({ files: [], query: q });

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '50', 10) || 50));
    const files = fileQ.searchFiles(accountId, q, limit);

    return reply.send({ files, query: q, limit });
  });
}

