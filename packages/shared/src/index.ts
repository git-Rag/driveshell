/**
 * @driveshell/shared
 *
 * Zod schemas and inferred TypeScript types that are shared between
 * the server (apps/server) and web (apps/web) packages.
 *
 * API contracts live here so the two ends of the wire are always in sync.
 * Phase 0: placeholder exports only. Real schemas are added in Phase 1+.
 */

// TODO(phase-1): export AuthSchemas (setup/status, credentials, auth/start)
// TODO(phase-2): export SyncSchemas (sync state, SSE event shapes)
// TODO(phase-3): export TimelineSchemas (buckets, items)

export const SHARED_VERSION = '0.1.0' as const;
