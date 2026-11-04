import Fastify from 'fastify';
import cors from '@fastify/cors';
import { findAvailablePort } from './utils/port';

const DEFAULT_PORT = Number(process.env['SERVER_PORT'] ?? 3001);
const LOG_LEVEL = process.env['LOG_LEVEL'] ?? 'info';

async function main(): Promise<void> {
  const port = await findAvailablePort(DEFAULT_PORT);

  const app = Fastify({
    logger: {
      level: LOG_LEVEL,
      // Redact sensitive fields from all log output
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization'],
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
    // Phase 1: tighten CSP once the session cookie mechanism is in place
    done();
  });

  // -------------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------------

  /**
   * Health check — unauthenticated, used by CI and dev tooling.
   * Returns 200 with version info.
   * async is required by Fastify's route handler signature even when no await is used.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify route handlers must be async; no async work needed here yet
  app.get('/health', async () => {
    return { status: 'ok', version: '0.1.0' };
  });

  // TODO(phase-1): Register auth routes (OAuth PKCE, session cookie)
  // TODO(phase-1): Register setup routes
  // TODO(phase-2): Register sync routes
  // TODO(phase-3): Register timeline / media routes

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
