/**
 * Session token middleware.
 *
 * Security model:
 *  - On first web load (`GET /`), the server sets an HttpOnly, SameSite=Strict
 *    cookie named `ds_session` containing a random token generated at startup.
 *  - Every `/api/*` route verifies the cookie is present and matches.
 *  - `/auth/callback` is explicitly exempt (it is a browser redirect from Google;
 *    the browser cannot attach custom cookies that were set in a different tab
 *    during the OAuth dance).
 *  - DNS rebinding protection: the `Host` header must be `127.0.0.1:<port>`.
 *  - Origin validation on mutating requests (POST/PUT/PATCH/DELETE).
 *
 * Cookie flags:
 *   HttpOnly  — not accessible from JS
 *   SameSite=Strict — never sent on cross-site requests
 *   Path=/    — sent on all paths
 *   (no Secure — the server is HTTP-only on 127.0.0.1; browsers allow cookies
 *    without Secure for localhost, but we document this limitation)
 */

import crypto from 'node:crypto';
import type {
  FastifyRequest,
  FastifyReply,
  FastifyInstance,
  HookHandlerDoneFunction,
} from 'fastify';

/** Token generated once per server process lifetime. */
export const SESSION_TOKEN: string = crypto.randomBytes(16).toString('hex');

/** Cookie name. */
export const SESSION_COOKIE = 'ds_session';

/** Routes that do NOT require the session token. */
const EXEMPT_PATHS = new Set(['/auth/callback']);

const LOOPBACK_HOST_REGEX = /^(127\.0\.0\.1|localhost)(:\d+)?$/;
/** Allowed loopback and Tauri desktop origins */
export const ALLOWED_ORIGIN_REGEX =
  /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?|tauri:\/\/localhost|https?:\/\/tauri\.localhost)$/;

/**
 * Register:
 *  1. `onRequest` hook — DNS rebinding + Origin checks + Sec-Fetch-Site + session validation.
 *  2. `GET /` passthrough that stamps the session cookie on the first browser load.
 *
 * Call this BEFORE registering any API route plugins.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin convention: addHook is synchronous, async used for consistency
export async function registerSessionMiddleware(
  app: FastifyInstance,
  _port: number,
): Promise<void> {
  app.addHook(
    'onRequest',
    (req: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
      const { url, method } = req;
      const path = url?.split('?')[0] ?? '/';

      // -----------------------------------------------------------------------
      // 1. DNS rebinding protection — Host must be a loopback address.
      //    Protects against attacker domains resolving to 127.0.0.1.
      // -----------------------------------------------------------------------
      const host = req.headers['host'];
      if (host && !LOOPBACK_HOST_REGEX.test(host)) {
        req.log.warn({ host }, 'Rejected: Host header mismatch (DNS rebinding guard)');
        void reply.code(400).send({ error: 'Bad Host header' });
        return;
      }

      // -----------------------------------------------------------------------
      // 2. Sec-Fetch-Site check — reject cross-site requests.
      //    Defends against remote malicious sites issuing requests to localhost.
      // -----------------------------------------------------------------------
      const secFetchSite = req.headers['sec-fetch-site'];
      if (secFetchSite === 'cross-site') {
        req.log.warn({ secFetchSite, path }, 'Rejected: Cross-site fetch detected');
        void reply.code(403).send({ error: 'Forbidden cross-site request' });
        return;
      }

      // -----------------------------------------------------------------------
      // 3. Origin check on state-mutating requests (POST, PUT, PATCH, DELETE).
      // -----------------------------------------------------------------------
      const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
      const origin = req.headers['origin'];
      if (MUTATING.has(method ?? '')) {
        if (origin && !ALLOWED_ORIGIN_REGEX.test(origin)) {
          req.log.warn({ origin, path }, 'Rejected: Forbidden origin on mutating route');
          void reply.code(403).send({ error: 'Forbidden origin' });
          return;
        }
      }

      // -----------------------------------------------------------------------
      // 4. Strict Vault Route Protection (/api/vault/*).
      //    - Reject direct browser navigation (sec-fetch-mode: navigate).
      //    - Require valid Origin on all requests when Origin header is present.
      //    - Ensure encrypted payloads are never cached.
      // -----------------------------------------------------------------------
      if (path.startsWith('/api/vault')) {
        const secFetchMode = req.headers['sec-fetch-mode'];
        if (secFetchMode === 'navigate') {
          req.log.warn({ path }, 'Rejected: Direct navigation forbidden on vault route');
          void reply.code(403).send({ error: 'Forbidden direct navigation on vault routes' });
          return;
        }
        if (origin && !ALLOWED_ORIGIN_REGEX.test(origin)) {
          req.log.warn({ origin, path }, 'Rejected: Forbidden origin on vault route');
          void reply.code(403).send({ error: 'Forbidden origin on vault route' });
          return;
        }
      }

      // -----------------------------------------------------------------------
      // 5. Session token check — all /api/* routes except the exempt list.
      // -----------------------------------------------------------------------
      const needsSession = path.startsWith('/api/') && !EXEMPT_PATHS.has(path);

      if (needsSession) {
        const cookieHeader = req.headers['cookie'] ?? '';
        const token = parseCookie(cookieHeader, SESSION_COOKIE);
        if (!token || !safeEqual(token, SESSION_TOKEN)) {
          req.log.warn({ path }, 'Rejected: missing or invalid session cookie');
          void reply.code(401).send({ error: 'Unauthorized' });
          return;
        }
      }

      done();
    },
  );
}

/**
 * Set the session cookie on a reply.
 * Called from the route that serves the web SPA on first load.
 */
export function setSessionCookie(reply: FastifyReply, port: number): void {
  reply.header(
    'Set-Cookie',
    `${SESSION_COOKIE}=${SESSION_TOKEN}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
  );
  void port; // port kept as parameter for future Secure + __Host- prefix when HTTPS
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a single cookie value from a Cookie header string. */
function parseCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k?.trim() === name) return v.join('=').trim();
  }
  return null;
}

/** Constant-time string comparison to avoid timing attacks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}
