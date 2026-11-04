/**
 * PKCE (Proof Key for Code Exchange) helpers — RFC 7636.
 *
 * We use the S256 method exclusively.  The plain method is not supported.
 *
 * verifier  = base64url(32 random bytes)   → 43 characters
 * challenge = base64url(SHA-256(verifier)) → 43 characters
 * state     = hex(16 random bytes)         → 32 hex chars (CSRF protection)
 */

import crypto from 'node:crypto';

export interface PkceChallenge {
  codeVerifier: string;
  codeChallenge: string;
  method: 'S256';
}

/** Generate a fresh PKCE verifier + challenge pair. */
export function generatePkce(): PkceChallenge {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  return { codeVerifier, codeChallenge, method: 'S256' };
}

/** Generate a random state token for CSRF protection. */
export function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Verify that a received code_challenge matches the stored code_verifier.
 * Used in tests; the production flow lets Google verify via the token endpoint.
 */
export function verifyChallengeRoundTrip(verifier: string, challenge: string): boolean {
  const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(challenge));
}
