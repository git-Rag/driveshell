/**
 * albums.ts — REST endpoints for Phase 6 Photo Albums.
 *
 * Invariants:
 *  - Albums are account-scoped.
 *  - Adding/removing items updates album's modified_at timestamp.
 *  - Deleting an album cascades to delete associations without deleting actual files.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '../db/connection';
import { buildAlbumQueries } from '../db/queries/albums';
import { buildAccountQueries } from '../db/queries/accounts';

interface AlbumParams {
  albumId: string;
}

interface ItemParams {
  albumId: string;
  fileId: string;
}

interface CreateAlbumBody {
  title: string;
  description?: string;
  fileIds?: string[];
}

interface UpdateAlbumBody {
  title?: string;
  description?: string;
  coverFileId?: string;
}

interface AddItemsBody {
  fileIds: string[];
}

export async function registerAlbumRoutes(app: FastifyInstance, db: Db): Promise<void> {
  await Promise.resolve();
  const albumQ = buildAlbumQueries(db);
  const accountQ = buildAccountQueries(db);

  function resolveAccountId(req: FastifyRequest): string | null {
    const query = req.query as { accountId?: string };
    if (query?.accountId) return query.accountId;
    const accounts = accountQ.findAll();
    return accounts[0]?.id ?? null;
  }

  // -------------------------------------------------------------------------
  // GET /api/albums — List all albums for current account
  // -------------------------------------------------------------------------
  app.get('/api/albums', async (req: FastifyRequest, reply: FastifyReply) => {
    const accountId = resolveAccountId(req);
    if (!accountId) return reply.code(404).send({ error: 'Account not found' });

    const albums = albumQ.list(accountId);
    return reply.send({ albums });
  });

  // -------------------------------------------------------------------------
  // POST /api/albums — Create a new album
  // -------------------------------------------------------------------------
  app.post(
    '/api/albums',
    async (req: FastifyRequest<{ Body: CreateAlbumBody }>, reply: FastifyReply) => {
      const accountId = resolveAccountId(req);
      if (!accountId) return reply.code(404).send({ error: 'Account not found' });

      const { title, description, fileIds } = req.body ?? {};
      if (!title || typeof title !== 'string' || !title.trim()) {
        return reply.code(400).send({ error: 'Title is required' });
      }

      const album = albumQ.create({
        accountId,
        title: title.trim(),
        description: description?.trim() || null,
      });

      if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
        albumQ.addFiles(accountId, album.id, fileIds);
      }

      return reply.code(201).send({ album });
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/albums/:albumId — Get album details and member files
  // -------------------------------------------------------------------------
  app.get(
    '/api/albums/:albumId',
    async (req: FastifyRequest<{ Params: AlbumParams }>, reply: FastifyReply) => {
      const accountId = resolveAccountId(req);
      if (!accountId) return reply.code(404).send({ error: 'Account not found' });

      const { albumId } = req.params;
      const album = albumQ.findById(accountId, albumId);
      if (!album) return reply.code(404).send({ error: 'Album not found' });

      const files = albumQ.getFiles(accountId, albumId);
      return reply.send({ album, files });
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /api/albums/:albumId — Update album title/description/cover
  // -------------------------------------------------------------------------
  app.patch(
    '/api/albums/:albumId',
    async (
      req: FastifyRequest<{ Params: AlbumParams; Body: UpdateAlbumBody }>,
      reply: FastifyReply,
    ) => {
      const accountId = resolveAccountId(req);
      if (!accountId) return reply.code(404).send({ error: 'Account not found' });

      const { albumId } = req.params;
      const updated = albumQ.update(accountId, albumId, req.body ?? {});
      if (!updated) return reply.code(404).send({ error: 'Album not found' });

      return reply.send({ album: updated });
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /api/albums/:albumId — Delete an album
  // -------------------------------------------------------------------------
  app.delete(
    '/api/albums/:albumId',
    async (req: FastifyRequest<{ Params: AlbumParams }>, reply: FastifyReply) => {
      const accountId = resolveAccountId(req);
      if (!accountId) return reply.code(404).send({ error: 'Account not found' });

      const { albumId } = req.params;
      const deleted = albumQ.delete(accountId, albumId);
      if (!deleted) return reply.code(404).send({ error: 'Album not found' });

      return reply.send({ ok: true });
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/albums/:albumId/items — Add files to album
  // -------------------------------------------------------------------------
  app.post(
    '/api/albums/:albumId/items',
    async (
      req: FastifyRequest<{ Params: AlbumParams; Body: AddItemsBody }>,
      reply: FastifyReply,
    ) => {
      const accountId = resolveAccountId(req);
      if (!accountId) return reply.code(404).send({ error: 'Account not found' });

      const { albumId } = req.params;
      const { fileIds } = req.body ?? {};
      if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        return reply.code(400).send({ error: 'fileIds array is required' });
      }

      const album = albumQ.findById(accountId, albumId);
      if (!album) return reply.code(404).send({ error: 'Album not found' });

      const added = albumQ.addFiles(accountId, albumId, fileIds);
      return reply.send({ ok: true, added });
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /api/albums/:albumId/items/:fileId — Remove file from album
  // -------------------------------------------------------------------------
  app.delete(
    '/api/albums/:albumId/items/:fileId',
    async (req: FastifyRequest<{ Params: ItemParams }>, reply: FastifyReply) => {
      const accountId = resolveAccountId(req);
      if (!accountId) return reply.code(404).send({ error: 'Account not found' });

      const { albumId, fileId } = req.params;
      const removed = albumQ.removeFile(accountId, albumId, fileId);
      return reply.send({ ok: true, removed });
    },
  );
}
