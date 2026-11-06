/**
 * sync.ts — Sync routes.
 *
 * Routes:
 *   GET  /api/sync/status          — sync state for all accounts
 *   POST /api/sync/start/:accountId — trigger full sync (202 Accepted)
 *   GET  /api/sync/progress        — SSE stream of progress events
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '../db/connection';
import type { SyncScheduler } from '../sync/scheduler';
import { buildAccountQueries } from '../db/queries/accounts';
import { buildFileQueries } from '../db/queries/files';

export async function registerSyncRoutes(
  app: FastifyInstance,
  db: Db,
  scheduler: SyncScheduler,
): Promise<void> {
  await Promise.resolve();
  const accountQ = buildAccountQueries(db);
  const fileQ = buildFileQueries(db);

  // -------------------------------------------------------------------------
  // GET /api/sync/status
  // -------------------------------------------------------------------------

  app.get('/api/sync/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    const accounts = accountQ.findAll().map((a) => ({
      id: a.id,
      email: a.email,
      displayName: a.display_name,
      status: a.status,
      fullSyncStage: a.full_sync_stage,
      lastFullSyncAt: a.last_full_sync_at,
      lastIncrementalAt: a.last_incremental_at,
      fileCount: fileQ.countByAccount(a.id),
    }));
    return reply.send({ accounts });
  });

  // -------------------------------------------------------------------------
  // POST /api/sync/start/:accountId — trigger full sync
  // -------------------------------------------------------------------------
  app.post(
    '/api/sync/start/:accountId',

    async (req: FastifyRequest<{ Params: { accountId: string } }>, reply: FastifyReply) => {
      const { accountId } = req.params;
      const account = accountQ.findById(accountId);
      if (!account) {
        return reply.code(404).send({ error: 'Account not found' });
      }
      if (account.status === 'syncing') {
        return reply.code(409).send({ error: 'Sync already in progress' });
      }
      scheduler.triggerFullSync(accountId);
      return reply.code(202).send({ ok: true, message: 'Full sync started' });
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/sync/backfill-video-metadata/:accountId — Backfill video metadata
  // -------------------------------------------------------------------------
  app.post(
    '/api/sync/backfill-video-metadata/:accountId',
    async (req: FastifyRequest<{ Params: { accountId: string } }>, reply: FastifyReply) => {
      const { accountId } = req.params;
      const account = accountQ.findById(accountId);
      if (!account) {
        return reply.code(404).send({ error: 'Account not found' });
      }
      // Non-blocking trigger — progress surfaces via SSE
      void scheduler.triggerBackfill(accountId).catch((err: unknown) => {
        app.log.error({ err, accountId }, 'Background video metadata backfill error');
      });
      return reply.code(202).send({ ok: true, message: 'Video metadata backfill started' });
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/sync/progress — SSE stream
  // -------------------------------------------------------------------------
  app.get('/api/sync/progress', async (req: FastifyRequest, reply: FastifyReply) => {
    // Set SSE headers
    void reply.hijack();
    const raw = reply.raw;
    raw.setHeader('Content-Type', 'text/event-stream');
    raw.setHeader('Cache-Control', 'no-cache, no-transform');
    raw.setHeader('Connection', 'keep-alive');
    raw.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering if proxied
    raw.flushHeaders();

    if (raw.socket) {
      raw.socket.setTimeout(0);
      raw.socket.setNoDelay(true);
      raw.socket.setKeepAlive(true, 10_000);
    }

    function sendEvent(data: object): void {
      if (!raw.destroyed) {
        raw.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    }

    // Send a heartbeat immediately so the client knows it's connected
    sendEvent({ type: 'connected' });

    // Subscribe to sync events
    const unsubscribe = scheduler.subscribe((event) => {
      sendEvent(event);
      if (event.type === 'done' || event.type === 'error') {
        // Keep stream open — client may want to receive events from future syncs
      }
    });

    // Heartbeat every 10s to prevent proxy timeouts
    const heartbeat = setInterval(() => {
      if (!raw.destroyed) {
        raw.write(': heartbeat\n\n');
      } else {
        clearInterval(heartbeat);
        unsubscribe();
      }
    }, 10_000);

    // Cleanup on client disconnect
    raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      req.log.debug('SSE client disconnected');
    });

    // Fastify expects the route to return a promise — keep it pending
    return new Promise<void>((resolve) => {
      raw.on('close', resolve);
      raw.on('error', resolve);
    });
  });
}
