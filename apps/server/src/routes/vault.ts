/**
 * vault.ts — REST endpoints for Phase 8 & 9 Private Vault.
 *
 * Invariants:
 *  - Zero-knowledge: the server never handles plain text or master keys.
 *  - Authentication relies on the client verifying canary ciphertext with its derived key.
 *  - Payload sizes up to 50 MiB supported.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../db/connection';
import { buildVaultQueries } from '../db/queries/vault';
import { buildAccountQueries } from '../db/queries/accounts';

const VaultSetupSchema = z.object({
  salt: z.string().min(1),
  canaryCiphertext: z.string().min(1),
  canaryIv: z.string().min(1),
});

const VaultUploadSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(255),
  mimeType: z.string().max(128).default('application/octet-stream'),
  sizeBytes: z.number().int().min(0).max(52428800).optional(),
  encryptedPayloadBase64: z.string().min(1),
  iv: z.string().min(1),
});

const VaultFileParamsSchema = z.object({
  fileId: z.string().min(1),
});

export async function registerVaultRoutes(app: FastifyInstance, db: Db): Promise<void> {
  await Promise.resolve();
  const vaultQ = buildVaultQueries(db);
  const accountQ = buildAccountQueries(db);

  app.addHook('onSend', async (_req, reply) => {
    void reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    void reply.header('Pragma', 'no-cache');
  });

  function resolveAccountId(req: FastifyRequest): string | null {
    const query = req.query as { accountId?: string };
    if (query?.accountId) return query.accountId;
    const accounts = accountQ.findAll();
    return accounts[0]?.id ?? null;
  }

  // -------------------------------------------------------------------------
  // GET /api/vault/status — Check if vault is initialized
  // -------------------------------------------------------------------------
  app.get('/api/vault/status', async (req: FastifyRequest, reply: FastifyReply) => {
    const accountId = resolveAccountId(req);
    if (!accountId) return reply.code(404).send({ error: 'Account not found' });

    const settings = vaultQ.getSettings(accountId);
    if (!settings) {
      return reply.send({ initialized: false });
    }

    return reply.send({
      initialized: true,
      salt: settings.salt,
      canaryCiphertext: settings.canary_ciphertext,
      canaryIv: settings.canary_iv,
      createdAt: settings.created_at,
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/vault/setup — Initialize or update vault canary
  // -------------------------------------------------------------------------
  app.post('/api/vault/setup', async (req: FastifyRequest, reply: FastifyReply) => {
    const accountId = resolveAccountId(req);
    if (!accountId) return reply.code(404).send({ error: 'Account not found' });

    const parsed = VaultSetupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid vault setup payload', details: parsed.error.format() });
    }

    const { salt, canaryCiphertext, canaryIv } = parsed.data;
    vaultQ.setup(accountId, salt, canaryCiphertext, canaryIv);
    return reply.code(201).send({ ok: true });
  });

  // -------------------------------------------------------------------------
  // GET /api/vault/files — List encrypted files in vault
  // -------------------------------------------------------------------------
  app.get('/api/vault/files', async (req: FastifyRequest, reply: FastifyReply) => {
    const accountId = resolveAccountId(req);
    if (!accountId) return reply.code(404).send({ error: 'Account not found' });

    const files = vaultQ.listFiles(accountId);
    return reply.send({ files });
  });

  // -------------------------------------------------------------------------
  // POST /api/vault/files — Store client-encrypted file
  // -------------------------------------------------------------------------
  app.post(
    '/api/vault/files',
    { bodyLimit: 50 * 1024 * 1024 }, // 50MB
    async (req: FastifyRequest, reply: FastifyReply) => {
      const accountId = resolveAccountId(req);
      if (!accountId) return reply.code(404).send({ error: 'Account not found' });

      const parsed = VaultUploadSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'Invalid vault file payload', details: parsed.error.format() });
      }

      const { name, mimeType, sizeBytes, encryptedPayloadBase64, iv } = parsed.data;
      const id = parsed.data.id ?? randomUUID();
      const payloadBuf = Buffer.from(encryptedPayloadBase64, 'base64');

      vaultQ.saveFile(
        accountId,
        id,
        name,
        mimeType,
        sizeBytes ?? payloadBuf.length,
        payloadBuf,
        iv,
      );

      return reply.code(201).send({ ok: true, id });
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/vault/files/:fileId/data — Retrieve encrypted file payload
  // -------------------------------------------------------------------------
  app.get('/api/vault/files/:fileId/data', async (req: FastifyRequest, reply: FastifyReply) => {
    const accountId = resolveAccountId(req);
    if (!accountId) return reply.code(404).send({ error: 'Account not found' });

    const parsedParams = VaultFileParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'Invalid file ID param' });
    }

    const { fileId } = parsedParams.data;
    const file = vaultQ.getFile(accountId, fileId);
    if (!file) return reply.code(404).send({ error: 'Vault file not found' });

    return reply.send({
      id: file.id,
      name: file.name,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      iv: file.iv,
      createdAt: file.created_at,
      encryptedPayloadBase64: file.encrypted_payload.toString('base64'),
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/vault/files/:fileId — Delete file from vault
  // -------------------------------------------------------------------------
  app.delete('/api/vault/files/:fileId', async (req: FastifyRequest, reply: FastifyReply) => {
    const accountId = resolveAccountId(req);
    if (!accountId) return reply.code(404).send({ error: 'Account not found' });

    const parsedParams = VaultFileParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ error: 'Invalid file ID param' });
    }

    const { fileId } = parsedParams.data;
    const deleted = vaultQ.deleteFile(accountId, fileId);
    if (!deleted) return reply.code(404).send({ error: 'Vault file not found' });

    return reply.send({ ok: true });
  });

  // -------------------------------------------------------------------------
  // POST /api/vault/reset — Reset vault
  // -------------------------------------------------------------------------
  app.post('/api/vault/reset', async (req: FastifyRequest, reply: FastifyReply) => {
    const accountId = resolveAccountId(req);
    if (!accountId) return reply.code(404).send({ error: 'Account not found' });

    vaultQ.reset(accountId);
    return reply.send({ ok: true });
  });
}
