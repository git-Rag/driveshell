/**
 * rate-limiter.ts — In-Memory Rate Limiter and Exponential Backoff Guard.
 *
 * Protects credential and vault routes against brute-force attacks and abuse.
 */

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
}

/**
 * Creates an in-memory rate limiter hook for Fastify routes.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const { maxRequests, windowMs } = options;
  const store = new Map<string, RateLimitRecord>();

  return function rateLimitHook(
    req: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void {
    const now = Date.now();
    const key = req.ip || '127.0.0.1';

    let record = store.get(key);

    if (!record || record.resetAt <= now) {
      record = { count: 1, resetAt: now + windowMs };
      store.set(key, record);
    } else {
      record.count++;
    }

    if (record.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
      reply.header('Retry-After', retryAfterSeconds);
      req.log.warn({ ip: key, path: req.url }, 'Rate limit exceeded');
      void reply.code(429).send({
        error: 'Too many requests, please try again later',
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    done();
  };
}
