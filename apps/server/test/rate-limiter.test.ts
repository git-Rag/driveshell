/**
 * rate-limiter.test.ts — Unit tests for in-memory rate limiting and backoff guard.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fastify from 'fastify';
import { createRateLimiter } from '../src/utils/rate-limiter';

describe('In-Memory Rate Limiter', () => {
  let app: ReturnType<typeof fastify>;

  beforeEach(async () => {
    app = fastify({ logger: false });
    const limiter = createRateLimiter({ maxRequests: 3, windowMs: 10_000 });

    app.post('/api/limited', { preHandler: limiter }, async () => ({ status: 'ok' }));
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('permits requests within the defined threshold', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/limited',
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
    }
  });

  it('rejects subsequent requests with HTTP 429 and Retry-After header', async () => {
    // First 3 requests succeed
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: 'POST', url: '/api/limited' });
    }

    // 4th request must be rejected with 429
    const blockedRes = await app.inject({
      method: 'POST',
      url: '/api/limited',
    });

    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.headers['retry-after']).toBeDefined();
    const body = JSON.parse(blockedRes.body) as { error: string; retryAfter: number };
    expect(body.error).toBe('Too many requests, please try again later');
    expect(body.retryAfter).toBeGreaterThanOrEqual(1);
  });
});
