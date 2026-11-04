/**
 * albums.ts — REST endpoints for Phase 6 Photo Albums.
 *
 * Invariants:
 *  - Albums are account-scoped.
 *  - Adding/removing items updates album's modified_at timestamp.
 *  - Deleting an album cascades to delete associations without deleting actual files.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/connection';
import { buildAlbumQueries } from '../db/queries/albums';
import { buildAccountQueries } from '../db/queries/accounts';

const CreateAlbumSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(1000).optional(),
  fileIds: z.array(z.string().min(1)).max(1000).optional(),
});

const UpdateAlbumSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  coverFileId: z.string().min(1).optional(),
});

const AddItemsSchema = z.object({
  fileIds: z.array(z.string().min(1)).min(1, 'At least one file ID is required').max(1000),
});

interface AlbumParams {
  albumId: string;
}

interface ItemParams {
  albumId: string;
  fileId: string;
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
  app.post('/api/albums', async (req: FastifyRequest, reply: FastifyReply) => {
    const accountId = resolveAccountId(req);
    if (!accountId) return reply.code(404).send({ error: 'Account not found' });

    const parsed = CreateAlbumSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid album payload', details: parsed.error.format() });
    }

    const { title, description, fileIds } = parsed.data;
    const album = albumQ.create({
      accountId,
      title,
      description: description ?? null,
    });

    if (fileIds && fileIds.length > 0) {
      albumQ.addFiles(accountId, album.id, fileIds);
    }

    return reply.code(201).send({ album });
  });

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
    async (req: FastifyRequest<{ Params: AlbumParams }>, reply: FastifyReply) => {
      const accountId = resolveAccountId(req);
      if (!accountId) return reply.code(404).send({ error: 'Account not found' });

      const parsed = UpdateAlbumSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'Invalid album update payload', details: parsed.error.format() });
      }

      const { albumId } = req.params;
      const patchData: {
        title?: string;
        description?: string | null;
        coverFileId?: string | null;
      } = {};
      if (parsed.data.title !== undefined) patchData.title = parsed.data.title;
      if (parsed.data.description !== undefined) patchData.description = parsed.data.description;
      if (parsed.data.coverFileId !== undefined) patchData.coverFileId = parsed.data.coverFileId;

      const updated = albumQ.update(accountId, albumId, patchData);
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
    async (req: FastifyRequest<{ Params: AlbumParams }>, reply: FastifyReply) => {
      const accountId = resolveAccountId(req);
      if (!accountId) return reply.code(404).send({ error: 'Account not found' });

      const parsed = AddItemsSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'Invalid items payload', details: parsed.error.format() });
      }

      const { albumId } = req.params;
      const album = albumQ.findById(accountId, albumId);
      if (!album) return reply.code(404).send({ error: 'Album not found' });

      const added = albumQ.addFiles(accountId, albumId, parsed.data.fileIds);
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
