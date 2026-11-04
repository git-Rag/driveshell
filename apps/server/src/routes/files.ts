/**
 * files.ts — File listing, browse, search, timeline months, and operations.
 *
 * Routes:
 *   GET   /api/files/list        — paginated file listing (non-media or all)
 *   GET   /api/files/photos      — paginated photo listing (image/* + video/*)
 *   GET   /api/files/months      — timeline month groupings with counts
 *   GET   /api/files/browse      — folder-level browsing with folder-first sorting
 *   GET   /api/files/breadcrumbs — breadcrumb trail for folder navigation
 *   GET   /api/files/search      — FTS5 / LIKE hybrid search
 *   PATCH /api/files/:fileId     — star, rename, trash file
 *   POST  /api/files/folder      — create a new folder
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/connection';
import { buildFileQueries } from '../db/queries/files';
import { buildAccountQueries } from '../db/queries/accounts';

interface PhotosQuery {
  accountId?: string;
  offset?: string;
  limit?: string;
  type?: 'all' | 'photos' | 'videos' | 'favorites';
  year?: string;
  month?: string;
}

interface ListQuery {
  accountId?: string;
  offset?: string;
  limit?: string;
}

interface BrowseQuery {
  accountId?: string;
  parentId?: string;
  offset?: string;
  limit?: string;
  search?: string;
  sortBy?: 'name' | 'modified_at' | 'size_bytes';
  sortDir?: 'asc' | 'desc';
}

interface SearchQuery {
  accountId?: string;
  q?: string;
  limit?: string;
}

const UpdateFileSchema = z.object({
  name: z.string().min(1).optional(),
  starred: z.number().int().min(0).max(1).optional(),
  trashed: z.number().int().min(0).max(1).optional(),
  parentId: z.string().nullable().optional(),
});

const CreateFolderSchema = z.object({
  name: z.string().min(1),
  parentId: z.string().nullable().optional(),
  accountId: z.string().optional(),
});

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin convention
export async function registerFileRoutes(app: FastifyInstance, db: Db): Promise<void> {
  const fileQ = buildFileQueries(db);
  const accountQ = buildAccountQueries(db);

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
  // GET /api/files/photos — Progressive loading & filtering
  // -------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/require-await
  app.get('/api/files/photos', async (req: FastifyRequest<{ Querystring: PhotosQuery }>, reply: FastifyReply) => {
    const accountId = resolveAccountId(req.query.accountId);
    if (!accountId) return reply.code(404).send({ error: 'No account found' });

    const offset = Math.max(0, parseInt(req.query.offset ?? '0', 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit ?? '120', 10) || 120));
    const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
    const month = req.query.month;
    const type = req.query.type ?? 'all';

    const { files, total } = fileQ.listPhotos(accountId, {
      offset,
      limit,
      type,
      year: isNaN(year ?? NaN) ? undefined : year,
      month,
    });

    return reply.send({ files, total, offset, limit });
  });

  // -------------------------------------------------------------------------
  // GET /api/files/months — Timeline groupings
  // -------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/require-await
  app.get('/api/files/months', async (req: FastifyRequest<{ Querystring: { accountId?: string } }>, reply: FastifyReply) => {
    const accountId = resolveAccountId(req.query.accountId);
    if (!accountId) return reply.code(404).send({ error: 'No account found' });

    const months = fileQ.getPhotoMonths(accountId);
    const total = fileQ.countPhotos(accountId);

    return reply.send({ months, total });
  });

  // -------------------------------------------------------------------------
  // GET /api/files/browse — Folder drilldown with sorting & count
  // -------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/require-await
  app.get('/api/files/browse', async (req: FastifyRequest<{ Querystring: BrowseQuery }>, reply: FastifyReply) => {
    const accountId = resolveAccountId(req.query.accountId);
    if (!accountId) return reply.code(404).send({ error: 'No account found' });

    const parentId = req.query.parentId && req.query.parentId !== 'root' ? req.query.parentId : null;
    const offset = Math.max(0, parseInt(req.query.offset ?? '0', 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit ?? '50', 10) || 50));

    const { files, total } = fileQ.listByParent(accountId, parentId, {
      offset,
      limit,
      search: req.query.search,
      sortBy: req.query.sortBy,
      sortDir: req.query.sortDir,
    });

    const breadcrumbs = fileQ.getBreadcrumbs(accountId, parentId);

    return reply.send({ files, total, offset, limit, breadcrumbs, parentId });
  });

  // -------------------------------------------------------------------------
  // GET /api/files/search
  // -------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/require-await
  app.get('/api/files/search', async (req: FastifyRequest<{ Querystring: SearchQuery }>, reply: FastifyReply) => {
    const accountId = resolveAccountId(req.query.accountId);
    if (!accountId) return reply.code(404).send({ error: 'No account found' });

    const q = (req.query.q ?? '').trim();
    if (!q) return reply.send({ files: [], query: q, limit: 50 });

    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '50', 10) || 50));
    const files = fileQ.searchFiles(accountId, q, limit);

    return reply.send({ files, query: q, limit });
  });

  // -------------------------------------------------------------------------
  // PATCH /api/files/:fileId — Star, Rename, Trash
  // -------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/require-await
  app.patch(
    '/api/files/:fileId',
    async (
      req: FastifyRequest<{
        Params: { fileId: string };
        Body: z.infer<typeof UpdateFileSchema>;
        Querystring: { accountId?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { fileId } = req.params;
      const accountId = resolveAccountId(req.query.accountId);
      if (!accountId) return reply.code(404).send({ error: 'No account found' });

      const parsed = UpdateFileSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid update payload', details: parsed.error.format() });
      }

      fileQ.updateFileMeta(accountId, fileId, {
        name: parsed.data.name,
        starred: parsed.data.starred,
        trashed: parsed.data.trashed,
        parent_id: parsed.data.parentId,
      });

      const updated = fileQ.findById(accountId, fileId);
      return reply.send({ ok: true, file: updated });
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/files/folder — Create local folder record
  // -------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/require-await
  app.post(
    '/api/files/folder',
    async (
      req: FastifyRequest<{ Body: z.infer<typeof CreateFolderSchema> }>,
      reply: FastifyReply,
    ) => {
      const parsed = CreateFolderSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid body', details: parsed.error.format() });
      }

      const accountId = resolveAccountId(parsed.data.accountId);
      if (!accountId) return reply.code(404).send({ error: 'No account found' });

      const folderId = `local_folder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = Date.now();

      fileQ.upsertFile({
        account_id: accountId,
        id: folderId,
        name: parsed.data.name.trim(),
        mime_type: 'application/vnd.google-apps.folder',
        parent_id: parsed.data.parentId && parsed.data.parentId !== 'root' ? parsed.data.parentId : null,
        size_bytes: null,
        modified_at: now,
        created_at_ms: now,
        starred: 0,
        trashed: 0,
        thumbnail_url: null,
        web_view_link: null,
        image_width: null,
        image_height: null,
        taken_at: null,
        camera_make: null,
        camera_model: null,
      });

      const created = fileQ.findById(accountId, folderId);
      return reply.code(201).send({ ok: true, folder: created });
    },
  );
}
