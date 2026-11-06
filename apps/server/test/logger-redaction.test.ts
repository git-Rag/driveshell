/**
 * logger-redaction.test.ts — Unit tests for sensitive data redaction in logger output.
 */

import { describe, it, expect } from 'vitest';
import pino from 'pino';

describe('Logger Sensitive Data Redaction', () => {
  it('redacts tokens, client secrets, passwords, and encryption parameters from log output', async () => {
    let logOutput = '';
    const destination = {
      write(chunk: string) {
        logOutput += chunk;
      },
    };

    const logger = pino(
      {
        level: 'info',
        redact: {
          paths: [
            'req.headers.cookie',
            'req.headers.authorization',
            'access_token',
            'refreshToken',
            'client_secret',
            'clientSecret',
            'password',
            'token',
            'code_verifier',
            'canaryCiphertext',
            'encryptedPayloadBase64',
          ],
          censor: '[REDACTED]',
        },
      },
      destination,
    );

    logger.info({
      user: 'alice',
      access_token: 'secret-oauth-token-12345',
      client_secret: 'GOCSPX-supersecretkey',
      password: 'vault-master-password',
      code_verifier: 'pkce-challenge-verifier-string',
      canaryCiphertext: 'encrypted-canary-payload',
      safeData: 'visible-metadata',
    });

    const parsed = JSON.parse(logOutput) as Record<string, unknown>;

    // Sensitive properties MUST be replaced with [REDACTED]
    expect(parsed['access_token']).toBe('[REDACTED]');
    expect(parsed['client_secret']).toBe('[REDACTED]');
    expect(parsed['password']).toBe('[REDACTED]');
    expect(parsed['code_verifier']).toBe('[REDACTED]');
    expect(parsed['canaryCiphertext']).toBe('[REDACTED]');

    // Non-sensitive fields remain intact
    expect(parsed['user']).toBe('alice');
    expect(parsed['safeData']).toBe('visible-metadata');

    // Never contain raw secret strings in raw log output
    expect(logOutput).not.toContain('secret-oauth-token-12345');
    expect(logOutput).not.toContain('GOCSPX-supersecretkey');
    expect(logOutput).not.toContain('vault-master-password');
  });
});
