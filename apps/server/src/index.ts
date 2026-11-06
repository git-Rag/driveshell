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
    allowedHeaders: ['Content-Type', 'Authorization', 'x-session-token', 'Range'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
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
   * Root ping / bootstrap / OAuth redirect completion page.
   */

  app.get('/', async (req, reply) => {
    setSessionCookie(reply, port);
    const qs = req.query as Record<string, string | undefined>;

    if (qs['auth_success'] === '1') {
      reply.type('text/html');
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Account Connected — Sunflower Drive</title>
  <style>
    body {
      margin: 0;
      background: #09090b;
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      padding: 36px 32px;
      max-width: 400px;
      text-align: center;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    .icon {
      font-size: 44px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 1.35rem;
      font-weight: 700;
      margin: 0 0 8px 0;
      color: #a3e635;
    }
    p {
      color: #a1a1aa;
      font-size: 0.95rem;
      line-height: 1.5;
      margin: 0 0 24px 0;
    }
    .btn {
      display: inline-block;
      background: #a3e635;
      color: #09090b;
      font-weight: 600;
      font-size: 0.9rem;
      padding: 10px 24px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #bef264;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🌻</div>
    <h1>Account Connected!</h1>
    <p>Your Google account was successfully linked. You can close this tab and return to <strong>Sunflower Drive</strong>.</p>
    <button class="btn" onclick="window.close()">Close tab</button>
  </div>
</body>
</html>`;
    }

    if (qs['auth_error']) {
      reply.type('text/html');
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authentication Error — Sunflower Drive</title>
  <style>
    body {
      margin: 0;
      background: #09090b;
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #18181b;
      border: 1px solid #ef4444;
      border-radius: 16px;
      padding: 36px 32px;
      max-width: 400px;
      text-align: center;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    .icon {
      font-size: 44px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 1.35rem;
      font-weight: 700;
      margin: 0 0 8px 0;
      color: #ef4444;
    }
    p {
      color: #a1a1aa;
      font-size: 0.95rem;
      line-height: 1.5;
      margin: 0 0 24px 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>Authentication Failed</h1>
    <p>Google authentication could not be completed: <code>${encodeURIComponent(qs['auth_error'])}</code>.<br>Please return to Sunflower Drive and try again.</p>
  </div>
</body>
</html>`;
    }

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
