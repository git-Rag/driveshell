import Fastify from 'fastify';
import cors from '@fastify/cors';
import { findAvailablePort } from './utils/port';
import { openDb, closeDb } from './db/connection';
import {
  registerSessionMiddleware,
  setSessionCookie,
  isAllowedOrigin,
  SESSION_TOKEN,
} from './auth/session';
import { registerSecurityHeaders } from './auth/security-headers';
import { registerAuthRoutes } from './routes/auth';
import { registerSyncRoutes } from './routes/sync';
import { registerFileRoutes } from './routes/files';
import { registerMediaRoutes } from './routes/media';
import { registerAlbumRoutes } from './routes/albums';
import { registerVaultRoutes } from './routes/vault';
import { createSyncScheduler } from './sync/scheduler';
import { buildAccountQueries } from './db/queries/accounts';
import { buildFileQueries } from './db/queries/files';
import { createKeychain } from './auth/keychain';

const DEFAULT_PORT = Number(process.env['SERVER_PORT'] ?? 3001);
const LOG_LEVEL = process.env['LOG_LEVEL'] ?? 'info';

async function main(): Promise<void> {
  const port = await findAvailablePort(DEFAULT_PORT);

  const app = Fastify({
    logger: {
      level: LOG_LEVEL,
      // Redact sensitive secrets and tokens from all log output
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          '*.access_token',
          '*.accessToken',
          '*.refresh_token',
          '*.refreshToken',
          '*.client_secret',
          '*.clientSecret',
          '*.password',
          '*.token',
          '*.code_verifier',
          '*.canaryCiphertext',
          '*.encryptedPayloadBase64',
        ],
        censor: '[REDACTED]',
      },
    },
  });

  // -------------------------------------------------------------------------
  // CORS — allow only verified loopback and Tauri origins
  // -------------------------------------------------------------------------
  await app.register(cors, {
    origin: (origin, cb) => {
      // No origin header = same-origin request (server-to-server or curl) — allow
      if (origin === undefined || origin === null) {
        cb(null, true);
        return;
      }
      if (
        isAllowedOrigin(origin, { isProduction: process.env['NODE_ENV'] === 'production', port })
      ) {
        cb(null, true);
      } else {
        cb(new Error('CORS: origin not allowed'), false);
      }
    },
    credentials: true,
  });

  // -------------------------------------------------------------------------
  // Baseline defensive security headers
  // -------------------------------------------------------------------------
  await registerSecurityHeaders(app);

  // -------------------------------------------------------------------------
  // Database
  // -------------------------------------------------------------------------
  const db = openDb(app.log);

  // -------------------------------------------------------------------------
  // Session cookie middleware (must be registered before API routes)
  // -------------------------------------------------------------------------
  await registerSessionMiddleware(app, port);

  // -------------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------------

  /**
   * Health check — unauthenticated, sets session cookie for web client bootstrap.
   */

  app.get('/health', async (_req, reply) => {
    setSessionCookie(reply, port);
    return { status: 'ok', version: '0.1.0', sessionToken: SESSION_TOKEN };
  });

  /**
   * Root ping / bootstrap.
   */

  app.get('/', async (_req, reply) => {
    setSessionCookie(reply, port);
    return { status: 'ok', message: 'Sunflower Drive API server' };
  });

  // Auth + setup routes (Phase 1)
  await registerAuthRoutes(app, db, port);

  // -------------------------------------------------------------------------
  // Sync engine (Phase 2)
  // -------------------------------------------------------------------------
  const keychain = createKeychain(app.log);
  const accountQ = buildAccountQueries(db);
  const fileQ = buildFileQueries(db);

  const scheduler = createSyncScheduler(db, keychain, accountQ, fileQ, port, app.log);

  await registerSyncRoutes(app, db, scheduler);
  await registerFileRoutes(app, db);
  await registerMediaRoutes(app, db, port);
  await registerAlbumRoutes(app, db);
  await registerVaultRoutes(app, db);

  // -------------------------------------------------------------------------
  // Graceful shutdown
  // -------------------------------------------------------------------------
  const shutdown = (): void => {
    app.log.info('Shutting down…');
    scheduler.shutdown();
    app
      .close()
      .then(() => {
        closeDb();
        process.exit(0);
      })
      .catch((err: unknown) => {
        app.log.error(err, 'Error during shutdown');
        process.exit(1);
      });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // -------------------------------------------------------------------------
  // Start
  // -------------------------------------------------------------------------
  await app.listen({ port, host: '127.0.0.1' });

  // Print a clean startup line regardless of log level
  process.stdout.write(`\n  ✓ Sunflower Drive server  http://127.0.0.1:${port}\n\n`);
}

main().catch((err: unknown) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
