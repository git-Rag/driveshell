/**
 * OAuth2 + setup routes.
 *
 * Routes:
 *   POST /api/setup/credentials   — store clientId + clientSecret to keychain
 *   GET  /api/setup/status        — return {configured, accounts[]}
 *   GET  /api/auth/start          — build consent URL, redirect browser
 *   GET  /auth/callback           — exchange code, store tokens, upsert account
 *
 * Session cookie requirement:
 *   All /api/* routes require the ds_session cookie (enforced in session.ts).
 *   /auth/callback is explicitly exempt (browser redirect from Google).
 *
 * In-memory PKCE state store:
 *   Map<state, {codeVerifier, scope, expiresAt}>
 *   Entries expire after 10 minutes to prevent unbounded memory growth.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { google } from 'googleapis';
import { CodeChallengeMethod } from 'google-auth-library';
import { z } from 'zod';
import {
  createKeychain,
  KC_SERVICE,
  KC_CLIENT_ID,
  KC_CLIENT_SECRET,
  kcTokenKey,
} from '../auth/keychain';
import { createRateLimiter } from '../utils/rate-limiter';
import { generatePkce, generateState } from '../auth/pkce';
import { setSessionCookie } from '../auth/session';
import { buildAccountQueries } from '../db/queries/accounts';
import type { Db } from '../db/connection';
import type { ScopeLevel } from '../db/queries/accounts';

// ---------------------------------------------------------------------------
// PKCE in-memory state store
// ---------------------------------------------------------------------------

interface PendingAuth {
  codeVerifier: string;
  scope: ScopeLevel;
  expiresAt: number;
  clientUrl?: string;
}

const pendingAuth = new Map<string, PendingAuth>();
const PKCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Purge expired entries — called before every read/write. */
function purgePkceExpired(): void {
  const now = Date.now();
  for (const [state, entry] of pendingAuth) {
    if (entry.expiresAt < now) pendingAuth.delete(state);
  }
}

// ---------------------------------------------------------------------------
// Drive OAuth scopes
// ---------------------------------------------------------------------------

export const SCOPES: Record<ScopeLevel, string[]> = {
  readonly: ['https://www.googleapis.com/auth/drive.readonly'],
  full: ['https://www.googleapis.com/auth/drive'],
};

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

const CredentialsSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin convention: async functions used for consistency even when route registration is synchronous
export async function registerAuthRoutes(
  app: FastifyInstance,
  db: Db,
  port: number,
): Promise<void> {
  const keychain = createKeychain(app.log);
  const accountQ = buildAccountQueries(db);

  const redirectUri = `http://127.0.0.1:${port}/auth/callback`;
  const credentialsRateLimiter = createRateLimiter({ maxRequests: 20, windowMs: 60_000 });

  // -------------------------------------------------------------------------
  // POST /api/setup/credentials
  // Store the Google OAuth client ID and secret as SEPARATE keychain entries.
  // -------------------------------------------------------------------------
  app.post(
    '/api/setup/credentials',
    { preHandler: credentialsRateLimiter },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = CredentialsSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'Invalid body', details: body.error.format() });
      }
      keychain.set(KC_SERVICE, KC_CLIENT_ID, body.data.clientId);
      keychain.set(KC_SERVICE, KC_CLIENT_SECRET, body.data.clientSecret);
      return reply.code(200).send({ ok: true });
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/setup/status
  // -------------------------------------------------------------------------
  app.get('/api/setup/status', async (_req: FastifyRequest, reply: FastifyReply) => {
    const clientId = keychain.get(KC_SERVICE, KC_CLIENT_ID);
    const accounts = accountQ.findAll().map((a) => ({
      id: a.id,
      email: a.email,
      displayName: a.display_name,
      avatarUrl: a.avatar_url,
      scopeLevel: a.scope_level,
      status: a.status,
    }));
    return reply.send({ configured: !!clientId, accounts });
  });

  // -------------------------------------------------------------------------
  // GET /api/auth/start & GET /auth/start?scope=readonly|full
  // Initiates the OAuth PKCE flow; redirects the browser to Google consent.
  // -------------------------------------------------------------------------
  const handleAuthStart = async (req: FastifyRequest, reply: FastifyReply) => {
    const clientId = keychain.get(KC_SERVICE, KC_CLIENT_ID);
    const clientSecret = keychain.get(KC_SERVICE, KC_CLIENT_SECRET);

    if (!clientId || !clientSecret) {
      return reply.code(400).send({ error: 'Credentials not configured. Run setup first.' });
    }

    const rawScope = (req.query as Record<string, string>)['scope'] ?? 'readonly';
    const scope: ScopeLevel = rawScope === 'full' ? 'full' : 'readonly';

    const { codeVerifier, codeChallenge } = generatePkce();
    const state = generateState();

    const referer = req.headers['referer'] ?? '';
    let clientUrl = `http://127.0.0.1:${port}/?auth_success=1`;
    if (referer) {
      try {
        const u = new URL(referer);
        if (/^(127\.0\.0\.1|localhost)$/.test(u.hostname)) {
          clientUrl = `${u.origin}/?auth_success=1`;
        }
      } catch {
        /* ignore invalid referer */
      }
    }

    purgePkceExpired();
    pendingAuth.set(state, {
      codeVerifier,
      scope,
      expiresAt: Date.now() + PKCE_TTL_MS,
      clientUrl,
    });

    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const url = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // always request refresh token
      scope: SCOPES[scope],
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });

    // Set the session cookie on this redirect response so the browser has it
    // before it returns to our callback page.
    setSessionCookie(reply, port);
    return reply.redirect(url);
  };

  app.get('/api/auth/start', handleAuthStart);
  app.get('/auth/start', handleAuthStart);

  // -------------------------------------------------------------------------
  // GET /auth/callback  (NO session cookie required — browser redirect from Google)
  // Exchange authorization code for tokens, store account.
  // -------------------------------------------------------------------------
  app.get('/auth/callback', async (req: FastifyRequest, reply: FastifyReply) => {
    const qs = req.query as Record<string, string | undefined>;
    const code = qs['code'];
    const state = qs['state'];
    const error = qs['error'];

    // OAuth error from Google (user denied, etc.)
    if (error) {
      req.log.warn({ error }, 'OAuth error from Google');
      return reply.redirect(`http://127.0.0.1:${port}/?auth_error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return reply.code(400).send({ error: 'Missing code or state' });
    }

    // Validate state + retrieve PKCE verifier
    purgePkceExpired();
    const pending = pendingAuth.get(state);
    if (!pending) {
      req.log.warn({ state }, 'Unknown or expired OAuth state');
      return reply.code(400).send({ error: 'Invalid or expired state' });
    }
    pendingAuth.delete(state);

    const clientId = keychain.get(KC_SERVICE, KC_CLIENT_ID);
    const clientSecret = keychain.get(KC_SERVICE, KC_CLIENT_SECRET);
    if (!clientId || !clientSecret) {
      return reply.code(500).send({ error: 'Credentials missing from keychain' });
    }

    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    // Exchange code for tokens
    let tokens: { access_token?: string | null; refresh_token?: string | null };
    try {
      const { tokens: t } = await oAuth2Client.getToken({
        code,
        codeVerifier: pending.codeVerifier,
      });
      tokens = t;
    } catch (err) {
      req.log.error({ err }, 'Token exchange failed');
      return reply.redirect(`http://127.0.0.1:${port}/?auth_error=token_exchange_failed`);
    }

    if (!tokens.access_token) {
      req.log.error('No access_token in token response');
      return reply.redirect(`http://127.0.0.1:${port}/?auth_error=no_access_token`);
    }

    oAuth2Client.setCredentials(tokens);

    // Fetch account identity via about.get (permissionId is the stable account ID)
    let permissionId: string;
    let email: string;
    let displayName: string;
    let avatarUrl: string | null;

    try {
      const drive = google.drive({ version: 'v3', auth: oAuth2Client });
      const { data } = await drive.about.get({
        fields: 'user(permissionId,emailAddress,displayName,photoLink)',
      });
      const user = data.user;
      if (!user?.permissionId || !user.emailAddress) {
        throw new Error('about.get returned incomplete user data');
      }
      permissionId = user.permissionId;
      email = user.emailAddress;
      displayName = user.displayName ?? email;
      avatarUrl = user.photoLink ?? null;
    } catch (err) {
      req.log.error({ err }, 'about.get failed');
      return reply.redirect(`http://127.0.0.1:${port}/?auth_error=identity_fetch_failed`);
    }

    // Upsert account into DB
    accountQ.upsert({
      id: permissionId,
      email,
      display_name: displayName,
      avatar_url: avatarUrl,
      scope_level: pending.scope,
    });

    // Store refresh token to keychain — separate entry per account
    if (tokens.refresh_token) {
      keychain.set(KC_SERVICE, kcTokenKey(permissionId), tokens.refresh_token);
    } else {
      req.log.warn(
        { permissionId },
        'No refresh token returned — user may need to re-auth if the access token expires',
      );
    }

    req.log.info({ permissionId, email }, 'Account authorised');

    // Redirect back to the app; web will poll /api/setup/status
    setSessionCookie(reply, port);
    const returnUrl = pending.clientUrl ?? `http://127.0.0.1:${port}/?auth_success=1`;
    return reply.redirect(returnUrl);
  });
}
