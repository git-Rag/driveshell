import Fastify from 'fastify';
import cors from '@fastify/cors';
import { findAvailablePort } from './utils/port';
import { openDb, closeDb } from './db/connection';
import { registerSessionMiddleware } from './auth/session';
import { registerAuthRoutes } from './routes/auth';

const DEFAULT_PORT = Number(process.env['SERVER_PORT'] ?? 3001);
const LOG_LEVEL = process.env['LOG_LEVEL'] ?? 'info';

async function main(): Promise<void> {
  const port = await findAvailablePort(DEFAULT_PORT);

  const app = Fastify({
    logger: {
      level: LOG_LEVEL,
      // Redact sensitive fields from all log output
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          '*.access_token',
          '*.refresh_token',
          '*.client_secret',
          '*.clientSecret',
        ],
        remove: true,
      },
    },
  });

  // -------------------------------------------------------------------------
  // CORS — allow only localhost origins (loopback)
  // -------------------------------------------------------------------------
  await app.register(cors, {
    origin: (origin, cb) => {
      // No origin header = same-origin request (server-to-server or curl) — allow
      if (origin === undefined || origin === null) {
        cb(null, true);
        return;
      }
      // Allow any loopback origin (127.0.0.1 or localhost, any port)
      const loopback = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
      if (loopback.test(origin)) {
        cb(null, true);
      } else {
        cb(new Error('CORS: origin not allowed'), false);
      }
    },
    credentials: true,
  });

  // -------------------------------------------------------------------------
  // Security headers
  // -------------------------------------------------------------------------
  app.addHook('onSend', (_req, reply, _payload, done) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' https://lh3.googleusercontent.com data:; style-src 'self' 'unsafe-inline'; script-src 'self'",
    );
    done();
  });

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
   * Health check — unauthenticated, used by CI and dev tooling.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify route handlers must be async
  app.get('/health', async () => {
    return { status: 'ok', version: '0.1.0' };
  });

  // Auth + setup routes (Phase 1)
  await registerAuthRoutes(app, db, port);

  // TODO(phase-2): Register sync routes
  // TODO(phase-3): Register timeline / media routes

  // -------------------------------------------------------------------------
  // Graceful shutdown
  // -------------------------------------------------------------------------
  const shutdown = (): void => {
    app.log.info('Shutting down…');
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
  process.stdout.write(`\n  ✓ DriveShell server  http://127.0.0.1:${port}\n\n`);
}

main().catch((err: unknown) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
