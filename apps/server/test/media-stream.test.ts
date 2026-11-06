/**
 * media-stream.test.ts — Unit tests for /api/media/:fileId/stream range streaming
 *
 * Verifies:
 *  1. parseByteRange logic: valid ranges, open-ended ranges, past-EOF detection
 *  2. createRangeSliceStream: slicing Node streams into precise byte ranges
 *  3. Fastify stream endpoint:
 *     - Standard 200 full response (no Range)
 *     - 206 Partial Content when upstream supplies Content-Range
 *     - 206 Fallback slicing when upstream returns 200
 *     - 416 Range Not Satisfiable on past-EOF or invalid range
 *     - 500 on unexpected upstream errors
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fastify from 'fastify';
import { Readable } from 'node:stream';
import Database from 'better-sqlite3';
import pino from 'pino';
import {
  parseByteRange,
  createRangeSliceStream,
  getHeaderValue,
  registerMediaRoutes,
} from '../src/routes/media';
import { openDb } from '../src/db/connection';
import { runMigrations } from '../src/db/migrations';
import { registerSessionMiddleware, SESSION_COOKIE, SESSION_TOKEN } from '../src/auth/session';
import * as oauthClient from '../src/sync/oauth-client';
import * as keychainModule from '../src/auth/keychain';

describe('Media Stream Unit Tests', () => {
  describe('parseByteRange', () => {
    it('parses valid start-end byte range', () => {
      const res = parseByteRange('bytes=0-1023', 5000);
      expect(res.valid).toBe(true);
      expect(res.isPastEof).toBeFalsy();
      expect(res.range).toEqual({ start: 0, end: 1023 });
    });

    it('parses open-ended range bytes=100-', () => {
      const res = parseByteRange('bytes=100-', 5000);
      expect(res.valid).toBe(true);
      expect(res.range).toEqual({ start: 100, end: 4999 });
    });

    it('clamps end to fileSize - 1', () => {
      const res = parseByteRange('bytes=0-9999', 5000);
      expect(res.valid).toBe(true);
      expect(res.range).toEqual({ start: 0, end: 4999 });
    });

    it('detects past-EOF range when start >= fileSize', () => {
      const res = parseByteRange('bytes=5000-6000', 5000);
      expect(res.valid).toBe(false);
      expect(res.isPastEof).toBe(true);
    });

    it('detects inverted range when start > end', () => {
      const res = parseByteRange('bytes=500-100', 5000);
      expect(res.valid).toBe(false);
      expect(res.isPastEof).toBe(true);
    });

    it('rejects invalid range header format', () => {
      expect(parseByteRange('invalid').valid).toBe(false);
      expect(parseByteRange('chars=0-10').valid).toBe(false);
    });
  });

  describe('createRangeSliceStream', () => {
    it('slices stream accurately between start and end bytes', async () => {
      const inputBuffer = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
      const readable = Readable.from(inputBuffer);
      const sliceStream = createRangeSliceStream(5, 14);

      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        readable
          .pipe(sliceStream)
          .on('data', (c) => chunks.push(Buffer.from(c)))
          .on('end', () => resolve())
          .on('error', reject);
      });

      const sliced = Buffer.concat(chunks).toString('utf-8');
      expect(sliced).toBe(inputBuffer.subarray(5, 15).toString('utf-8'));
      expect(sliced.length).toBe(10);
    });
  });

  describe('getHeaderValue', () => {
    it('retrieves header from plain record case-insensitively', () => {
      const plain = { 'Content-Range': 'bytes 0-10/100', 'accept-ranges': 'bytes' };
      expect(getHeaderValue(plain, 'content-range')).toBe('bytes 0-10/100');
      expect(getHeaderValue(plain, 'Content-Range')).toBe('bytes 0-10/100');
      expect(getHeaderValue(plain, 'accept-ranges')).toBe('bytes');
      expect(getHeaderValue(plain, 'missing')).toBeUndefined();
    });

    it('retrieves header from standard Fetch Headers instance', () => {
      const headers = new Headers({
        'content-range': 'bytes 100-200/5000',
        'content-length': '101',
      });
      expect(getHeaderValue(headers, 'content-range')).toBe('bytes 100-200/5000');
      expect(getHeaderValue(headers, 'content-length')).toBe('101');
      expect(getHeaderValue(headers, 'missing')).toBeUndefined();
    });
  });

  describe('Fastify /api/media/:fileId/stream Integration', () => {
    let app: ReturnType<typeof fastify>;
    let db: ReturnType<typeof openDb>;
    const testPort = 3188;

    beforeEach(async () => {
      app = fastify({ logger: false });
      db = new Database(':memory:') as any;
      runMigrations(db, pino({ level: 'silent' }));

      // Insert account and test media file
      db.prepare(
        `
        INSERT INTO accounts (id, email, display_name, scope_level, status, created_at)
        VALUES ('acc1', 'test@test.com', 'Test User', 'full', 'active', 1000)
      `,
      ).run();

      db.prepare(
        `
        INSERT INTO files (id, account_id, name, mime_type, size_bytes, modified_at, created_at_ms, duration_ms, image_width, image_height)
        VALUES ('v1', 'acc1', 'sample.mp4', 'video/mp4', 1000, 2000, 1000, 5000, 1920, 1080)
      `,
      ).run();

      await registerSessionMiddleware(app, testPort);

      // Mock keychain
      vi.spyOn(keychainModule, 'createKeychain').mockReturnValue({
        get: (_svc: string, key: string) =>
          key.includes('token') || key.includes('client') ? 'mock-secret' : null,
        set: () => {},
        delete: () => true,
      } as any);

      await registerMediaRoutes(app, db, testPort);
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await app.close();
      db.close();
    });

    it('returns 200 with full stream when no Range header is sent', async () => {
      const mockStream = Readable.from([Buffer.from('full-video-payload')]);
      vi.spyOn(oauthClient, 'getAuthenticatedDrive').mockResolvedValue({
        drive: {
          files: {
            get: vi.fn().mockResolvedValue({
              status: 200,
              headers: { 'content-length': '18', 'accept-ranges': 'bytes' },
              data: mockStream,
            }),
          },
        },
      } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/api/media/v1/stream',
        headers: {
          cookie: `${SESSION_COOKIE}=${SESSION_TOKEN}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('video/mp4');
      expect(res.headers['accept-ranges']).toBe('bytes');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.payload).toBe('full-video-payload');
    });

    it('returns 206 Partial Content when upstream returns 206 with Content-Range', async () => {
      const mockStream = Readable.from([Buffer.from('bytes-0-9')]);
      vi.spyOn(oauthClient, 'getAuthenticatedDrive').mockResolvedValue({
        drive: {
          files: {
            get: vi.fn().mockResolvedValue({
              status: 206,
              headers: {
                'content-range': 'bytes 0-9/1000',
                'content-length': '10',
                'accept-ranges': 'bytes',
              },
              data: mockStream,
            }),
          },
        },
      } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/api/media/v1/stream',
        headers: {
          cookie: `${SESSION_COOKIE}=${SESSION_TOKEN}`,
          range: 'bytes=0-9',
        },
      });

      expect(res.statusCode).toBe(206);
      expect(res.headers['content-range']).toBe('bytes 0-9/1000');
      expect(res.headers['content-length']).toBe('10');
      expect(res.payload).toBe('bytes-0-9');
    });

    it('returns 206 Partial Content when upstream returns 206 with Fetch Headers instance', async () => {
      const mockStream = Readable.from([Buffer.from('bytes-10-19')]);
      const fetchHeaders = new Headers({
        'content-range': 'bytes 10-19/1000',
        'content-length': '10',
        'accept-ranges': 'bytes',
      });
      vi.spyOn(oauthClient, 'getAuthenticatedDrive').mockResolvedValue({
        drive: {
          files: {
            get: vi.fn().mockResolvedValue({
              status: 206,
              headers: fetchHeaders,
              data: mockStream,
            }),
          },
        },
      } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/api/media/v1/stream',
        headers: {
          cookie: `${SESSION_COOKIE}=${SESSION_TOKEN}`,
          range: 'bytes=10-19',
        },
      });

      expect(res.statusCode).toBe(206);
      expect(res.headers['content-range']).toBe('bytes 10-19/1000');
      expect(res.headers['content-length']).toBe('10');
      expect(res.payload).toBe('bytes-10-19');
    });

    it('returns 206 and slices content when upstream returns 200 for range request', async () => {
      const fullBuffer = Buffer.from('0123456789abcdefghij');
      const mockStream = Readable.from([fullBuffer]);
      vi.spyOn(oauthClient, 'getAuthenticatedDrive').mockResolvedValue({
        drive: {
          files: {
            get: vi.fn().mockResolvedValue({
              status: 200,
              headers: { 'accept-ranges': 'bytes' },
              data: mockStream,
            }),
          },
        },
      } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/api/media/v1/stream',
        headers: {
          cookie: `${SESSION_COOKIE}=${SESSION_TOKEN}`,
          range: 'bytes=5-9',
        },
      });

      expect(res.statusCode).toBe(206);
      expect(res.headers['content-range']).toBe('bytes 5-9/1000');
      expect(res.headers['content-length']).toBe('5');
      expect(res.payload).toBe('56789');
    });

    it('returns 416 Range Not Satisfiable when start >= fileSize', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/media/v1/stream',
        headers: {
          cookie: `${SESSION_COOKIE}=${SESSION_TOKEN}`,
          range: 'bytes=1500-2000',
        },
      });

      expect(res.statusCode).toBe(416);
      expect(res.headers['content-range']).toBe('bytes */1000');
      expect(res.headers['accept-ranges']).toBe('bytes');
      expect(JSON.parse(res.payload).error).toBe('Range Not Satisfiable');
    });

    it('returns 416 Range Not Satisfiable when upstream throws 416', async () => {
      vi.spyOn(oauthClient, 'getAuthenticatedDrive').mockResolvedValue({
        drive: {
          files: {
            get: vi.fn().mockRejectedValue({
              status: 416,
              response: { status: 416 },
            }),
          },
        },
      } as any);

      // Range within file size in header, but Drive throws 416
      const res = await app.inject({
        method: 'GET',
        url: '/api/media/v1/stream',
        headers: {
          cookie: `${SESSION_COOKIE}=${SESSION_TOKEN}`,
          range: 'bytes=900-999',
        },
      });

      expect(res.statusCode).toBe(416);
      expect(res.headers['content-range']).toBe('bytes */1000');
    });

    it('returns 500 when upstream fails unexpectedly', async () => {
      vi.spyOn(oauthClient, 'getAuthenticatedDrive').mockResolvedValue({
        drive: {
          files: {
            get: vi.fn().mockRejectedValue(new Error('Network failure')),
          },
        },
      } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/api/media/v1/stream',
        headers: {
          cookie: `${SESSION_COOKIE}=${SESSION_TOKEN}`,
        },
      });

      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.payload).error).toBe('Streaming failed');
    });
  });
});
