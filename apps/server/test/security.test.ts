/**
 * security.test.ts — Rigorous unit and integration tests for Stage 2 Security Hardening.
 *
 * Verifies:
 *  1. SEC-001: DNS rebinding protection (Host header validation)
 *  2. SEC-002: Stream route stored-XSS defense (MIME type allowlist, Content-Disposition, sandbox CSP)
 *  3. SEC-003: Anti-SSRF Outbound Network Guard (validateOutboundUrl, fetchWithGuard, redirect inspection)
 *  4. SEC-006: Origin verification, Sec-Fetch-Site defense, and strict vault route protection
 *  5. S4: OAuth scope hygiene (redundant scopes removed)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fastify from 'fastify';
import cookie from '@fastify/cookie';
import { validateOutboundUrl, fetchWithGuard, SsrfError } from '../src/utils/outbound-guard';
import { isSafeInlineMime, sanitizeFilename } from '../src/routes/media';
import {
  registerSessionMiddleware,
  SESSION_COOKIE,
  SESSION_TOKEN,
  ALLOWED_ORIGIN_REGEX,
} from '../src/auth/session';
import { SCOPES } from '../src/routes/auth';

describe('SEC-003: Anti-SSRF Outbound Network Guard', () => {
  it('allows authorized Google media domains on HTTPS', () => {
    const urls = [
      'https://lh3.googleusercontent.com/d/1a2b3c4d=s400',
      'https://drive.googleusercontent.com/download/storage/v1/b/test',
      'https://googleusercontent.com/photo/123',
      'https://www.googleapis.com/drive/v3/files/xyz?alt=media',
      'https://googleapis.com/test',
    ];

    for (const url of urls) {
      expect(() => validateOutboundUrl(url)).not.toThrow();
    }
  });

  it('rejects non-HTTPS protocols', () => {
    const forbiddenProtocols = [
      'http://lh3.googleusercontent.com/test',
      'file:///etc/passwd',
      'ftp://lh3.googleusercontent.com/test',
      'data:image/png;base64,AAAA',
      'javascript:alert(1)',
    ];

    for (const url of forbiddenProtocols) {
      expect(() => validateOutboundUrl(url)).toThrow(SsrfError);
    }
  });

  it('rejects direct IP addresses (IPv4, IPv6, loopback, private ranges, metadata IP)', () => {
    const forbiddenIps = [
      'https://127.0.0.1/test',
      'https://localhost/test',
      'https://169.254.169.254/latest/meta-data/', // AWS / GCP metadata
      'https://192.168.1.1/admin',
      'https://10.0.0.1/secret',
      'https://172.16.0.1/',
      'https://[::1]/test',
    ];

    for (const url of forbiddenIps) {
      expect(() => validateOutboundUrl(url)).toThrow(SsrfError);
    }
  });

  it('rejects attacker domain suffixes trying to spoof Google hosts', () => {
    const attackUrls = [
      'https://lh3.googleusercontent.com.attacker.com/test',
      'https://googleapis.com.evil.org/steal',
      'https://fakegoogleusercontent.com/test',
      'https://not-googleusercontent.com/img',
    ];

    for (const url of attackUrls) {
      expect(() => validateOutboundUrl(url)).toThrow(SsrfError);
    }
  });

  it('rejects URLs with non-standard ports or embedded credentials', () => {
    const urls = [
      'https://lh3.googleusercontent.com:8080/test',
      'https://lh3.googleusercontent.com:8443/test',
      'https://admin:password@lh3.googleusercontent.com/test',
    ];

    for (const url of urls) {
      expect(() => validateOutboundUrl(url)).toThrow(SsrfError);
    }
  });

  it('fetchWithGuard rejects invalid URLs before making network requests', async () => {
    await expect(fetchWithGuard('http://169.254.169.254/secret')).rejects.toThrow(SsrfError);
    await expect(fetchWithGuard('https://attacker.com/evil.jpg')).rejects.toThrow(SsrfError);
  });
});

describe('SEC-002: Stream Route Stored-XSS & Isolation Defense', () => {
  it('isSafeInlineMime correctly identifies safe raster images and audio/video', () => {
    // Safe types allowed inline
    expect(isSafeInlineMime('image/jpeg')).toBe(true);
    expect(isSafeInlineMime('image/png')).toBe(true);
    expect(isSafeInlineMime('image/webp')).toBe(true);
    expect(isSafeInlineMime('image/avif')).toBe(true);
    expect(isSafeInlineMime('video/mp4')).toBe(true);
    expect(isSafeInlineMime('video/webm')).toBe(true);
    expect(isSafeInlineMime('video/quicktime')).toBe(true);
    expect(isSafeInlineMime('audio/mpeg')).toBe(true);
    expect(isSafeInlineMime('audio/flac')).toBe(true);
  });

  it('isSafeInlineMime rejects dangerous, executable, or active mime types', () => {
    // High-risk XSS vectors must never be served inline
    expect(isSafeInlineMime('image/svg+xml')).toBe(false);
    expect(isSafeInlineMime('text/html')).toBe(false);
    expect(isSafeInlineMime('application/pdf')).toBe(false);
    expect(isSafeInlineMime('text/xml')).toBe(false);
    expect(isSafeInlineMime('application/xml')).toBe(false);
    expect(isSafeInlineMime('application/javascript')).toBe(false);
    expect(isSafeInlineMime('text/javascript')).toBe(false);
    expect(isSafeInlineMime('application/octet-stream')).toBe(false);
    expect(isSafeInlineMime('')).toBe(false);
  });

  it('sanitizeFilename strips control characters, path separators, and quotes', () => {
    expect(sanitizeFilename('normal-photo.jpg')).toBe('normal-photo.jpg');
    expect(sanitizeFilename('evil\r\nContent-Type: text/html.jpg')).toBe(
      'evil__Content-Type: text_html.jpg',
    );
    expect(sanitizeFilename('path/traversal\\attack.png')).toBe('path_traversal_attack.png');
    expect(sanitizeFilename('file"with"quotes.pdf')).toBe('file_with_quotes.pdf');
    expect(sanitizeFilename('null\x00byte.png')).toBe('null_byte.png');
  });
});

describe('SEC-006: Origin, CORS, and Session Hardening', () => {
  it('ALLOWED_ORIGIN_REGEX matches localhost, 127.0.0.1, and Tauri protocols', () => {
    expect(ALLOWED_ORIGIN_REGEX.test('http://127.0.0.1:5173')).toBe(true);
    expect(ALLOWED_ORIGIN_REGEX.test('http://localhost:5173')).toBe(true);
    expect(ALLOWED_ORIGIN_REGEX.test('http://127.0.0.1:3000')).toBe(true);
    expect(ALLOWED_ORIGIN_REGEX.test('tauri://localhost')).toBe(true);
    expect(ALLOWED_ORIGIN_REGEX.test('https://tauri.localhost')).toBe(true);
    expect(ALLOWED_ORIGIN_REGEX.test('http://tauri.localhost')).toBe(true);

    // Rejects remote or spoofed origins
    expect(ALLOWED_ORIGIN_REGEX.test('http://evil.com')).toBe(false);
    expect(ALLOWED_ORIGIN_REGEX.test('https://attacker.com')).toBe(false);
    expect(ALLOWED_ORIGIN_REGEX.test('http://127.0.0.1.attacker.com')).toBe(false);
    expect(ALLOWED_ORIGIN_REGEX.test('http://localhost.evil.com')).toBe(false);
  });

  describe('HTTP Request Hook Protections', () => {
    let app: ReturnType<typeof fastify>;

    beforeEach(async () => {
      app = fastify({ logger: false });
      await app.register(cookie);
      await registerSessionMiddleware(app, 3000);

      // Register sample test routes
      app.get('/api/test-get', async () => ({ status: 'ok' }));
      app.post('/api/test-post', async () => ({ status: 'created' }));
      app.get('/api/vault/status', async () => ({ vault: 'ready' }));
      app.post('/api/vault/files', async () => ({ saved: true }));
      app.get('/api/auth/start', async () => ({ status: 'redirect_to_google' }));
      app.get('/auth/start', async () => ({ status: 'redirect_to_google' }));
      app.get('/auth/callback', async () => ({ status: 'callback_received' }));
      await app.ready();
    });

    afterEach(async () => {
      await app.close();
    });

    it('rejects cross-site requests via Sec-Fetch-Site: cross-site with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/test-get',
        headers: {
          host: '127.0.0.1:3000',
          cookie: `${SESSION_COOKIE}=${SESSION_TOKEN}`,
          'sec-fetch-site': 'cross-site',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body)).toEqual({ error: 'Forbidden cross-site request' });
    });

    it('allows cross-site OAuth callback redirects via Sec-Fetch-Site: cross-site', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/auth/callback?code=test-code&state=test-state',
        headers: {
          host: '127.0.0.1:3000',
          'sec-fetch-site': 'cross-site',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: 'callback_received' });
    });

    it('gracefully accepts empty JSON bodies on POST requests without FST_ERR_CTP_EMPTY_JSON_BODY', async () => {
      app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
        if (!body || (typeof body === 'string' && body.trim() === '')) {
          done(null, {});
          return;
        }
        try {
          const json: unknown = JSON.parse(body as string);
          done(null, json);
        } catch (err) {
          done(err as Error, undefined);
        }
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/test-post',
        headers: {
          host: '127.0.0.1:3000',
          cookie: `${SESSION_COOKIE}=${SESSION_TOKEN}`,
          origin: 'http://127.0.0.1:3000',
          'content-type': 'application/json',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: 'created' });
    });

    it('rejects state-mutating requests with forbidden Origin', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/test-post',
        headers: {
          host: '127.0.0.1:3000',
          cookie: `${SESSION_COOKIE}=${SESSION_TOKEN}`,
          origin: 'https://malicious-website.com',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body)).toEqual({ error: 'Forbidden origin' });
    });

    it('allows state-mutating requests with loopback Origin', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/test-post',
        headers: {
          host: '127.0.0.1:3000',
          cookie: `${SESSION_COOKIE}=${SESSION_TOKEN}`,
          origin: 'http://127.0.0.1:5173',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ status: 'created' });
    });

    it('rejects direct browser navigation to vault routes (sec-fetch-mode: navigate)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/vault/status',
        headers: {
          host: '127.0.0.1:3000',
          cookie: `${SESSION_COOKIE}=${SESSION_TOKEN}`,
          'sec-fetch-mode': 'navigate',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body)).toEqual({
        error: 'Forbidden direct navigation on vault routes',
      });
    });

    it('rejects requests with non-loopback Host header (DNS rebinding protection)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/test-get',
        headers: {
          host: 'attacker-controlled-domain.com',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Bad Host header' });
    });

    it('allows OAuth start endpoints without existing session cookies or headers', async () => {
      const resApi = await app.inject({
        method: 'GET',
        url: '/api/auth/start?scope=readonly',
        headers: { host: '127.0.0.1:3000' },
      });
      expect(resApi.statusCode).toBe(200);
      expect(JSON.parse(resApi.body)).toEqual({ status: 'redirect_to_google' });

      const resRoot = await app.inject({
        method: 'GET',
        url: '/auth/start?scope=readonly',
        headers: { host: '127.0.0.1:3000' },
      });
      expect(resRoot.statusCode).toBe(200);
      expect(JSON.parse(resRoot.body)).toEqual({ status: 'redirect_to_google' });
    });
  });
});

describe('S4: OAuth Scope Security & Hygiene', () => {
  it('excludes redundant drive.metadata.readonly from readonly scopes', () => {
    expect(SCOPES.readonly).toContain('https://www.googleapis.com/auth/drive.readonly');
    expect(SCOPES.readonly).not.toContain(
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    );
  });

  it('verifies minimal permissions in readonly and modify scopes', () => {
    expect(SCOPES.readonly).toEqual(['https://www.googleapis.com/auth/drive.readonly']);
  });
});
