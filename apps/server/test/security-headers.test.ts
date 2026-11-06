/**
 * security-headers.test.ts — Snapshot and integration tests for baseline HTTP security headers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fastify from 'fastify';
import { registerSecurityHeaders, BASELINE_SECURITY_HEADERS } from '../src/auth/security-headers';

describe('Uniform Security Headers Plugin', () => {
  let app: ReturnType<typeof fastify>;

  beforeEach(async () => {
    app = fastify({ logger: false });
    await registerSecurityHeaders(app);

    app.get('/test', async () => ({ ok: true }));
    app.post('/test-post', async () => ({ created: true }));
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('snapshots baseline security headers on GET responses', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(res.statusCode).toBe(200);

    for (const [header, expectedValue] of Object.entries(BASELINE_SECURITY_HEADERS)) {
      expect(res.headers[header]).toBe(expectedValue);
    }
  });

  it('snapshots baseline security headers on POST responses', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/test-post',
    });

    expect(res.statusCode).toBe(200);

    for (const [header, expectedValue] of Object.entries(BASELINE_SECURITY_HEADERS)) {
      expect(res.headers[header]).toBe(expectedValue);
    }
  });
});
