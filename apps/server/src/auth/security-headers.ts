/**
 * security-headers.ts — Fastify plugin for uniform defensive HTTP security headers.
 *
 * Enforces baseline HTTP response security headers across all endpoints.
 */

import type { FastifyInstance } from 'fastify';

export const BASELINE_SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'cross-origin',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

// eslint-disable-next-line @typescript-eslint/require-await -- Fastify plugin convention: async function for plugin registration
export async function registerSecurityHeaders(app: FastifyInstance): Promise<void> {
  app.addHook('onSend', async (_req, reply) => {
    for (const [header, value] of Object.entries(BASELINE_SECURITY_HEADERS)) {
      if (!reply.hasHeader(header)) {
        void reply.header(header, value);
      }
    }
  });
}
