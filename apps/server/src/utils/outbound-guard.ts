/**
 * outbound-guard.ts — Anti-SSRF Outbound Network Guard.
 *
 * Security Invariants (INV-06, INV-07):
 *  1. Protocol strictly HTTPS. Reject HTTP, file:, data:, etc.
 *  2. Disallow direct IP addresses (IPv4, IPv6, loopback, private ranges, link-local metadata).
 *  3. Host allowlist strictly verified via parsed domain suffix (.googleusercontent.com, .googleapis.com).
 *  4. Manual redirect inspection: every redirect hop passes through the guard (max 3 redirects).
 *  5. Strict timeout (10s) and payload size limit (15 MB) to prevent denial-of-service.
 *  6. Never forward OAuth tokens or credentials to media hosts.
 */

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

const ALLOWED_DOMAIN_SUFFIXES = ['.googleusercontent.com', '.googleapis.com'];
const ALLOWED_EXACT_HOSTS = ['googleusercontent.com', 'googleapis.com'];

/**
 * Validates that an outbound URL strictly targets authorized Google media domains via HTTPS.
 * Throws SsrfError if any rule is violated.
 */
export function validateOutboundUrl(rawUrl: string): URL {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new SsrfError('URL must be a non-empty string');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError(`Invalid URL: ${rawUrl}`);
  }

  // 1. Strictly HTTPS
  if (parsed.protocol !== 'https:') {
    throw new SsrfError(`Forbidden protocol: '${parsed.protocol}'. Only HTTPS is permitted.`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Reject direct IP addresses and localhost
  const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  const isIpv6 = hostname.includes(':') || hostname.startsWith('[') || hostname.endsWith(']');
  if (isIpv4 || isIpv6 || hostname === 'localhost') {
    throw new SsrfError(`Direct IP address or localhost access is forbidden: ${hostname}`);
  }

  // 3. Reject hostnames containing credentials or strange ports
  if (parsed.port && parsed.port !== '443') {
    throw new SsrfError(`Non-standard HTTPS port forbidden: ${parsed.port}`);
  }
  if (parsed.username || parsed.password) {
    throw new SsrfError('Embedded credentials in URL are forbidden');
  }

  // 4. Exact or domain suffix match
  const isAllowedHost =
    ALLOWED_EXACT_HOSTS.includes(hostname) ||
    ALLOWED_DOMAIN_SUFFIXES.some((suffix) => hostname.endsWith(suffix));

  if (!isAllowedHost) {
    throw new SsrfError(
      `Forbidden destination host: '${hostname}'. Only official Google media domains are permitted.`,
    );
  }

  return parsed;
}

export interface FetchGuardOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  maxSizeBytes?: number;
  headers?: Record<string, string>;
}

export interface FetchGuardResult {
  buffer: Buffer;
  contentType: string | null;
}

/**
 * Fetch a remote resource with full SSRF protection, manual redirect validation,
 * timeout enforcement, and size caps.
 */
export async function fetchWithGuard(
  rawUrl: string,
  options: FetchGuardOptions = {},
): Promise<FetchGuardResult> {
  const maxRedirects = options.maxRedirects ?? 3;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxSizeBytes = options.maxSizeBytes ?? 15 * 1024 * 1024; // 15 MB

  let currentUrl = rawUrl;
  let redirectCount = 0;

  while (redirectCount <= maxRedirects) {
    validateOutboundUrl(currentUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Invariant: Do NOT include Authorization headers when fetching media
      const res = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual', // Manual redirect inspection
        signal: controller.signal,
        headers: options.headers ?? {},
      });

      clearTimeout(timer);

      // Inspect HTTP redirects (301, 302, 303, 307, 308)
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        if (!location) {
          throw new SsrfError(`Redirect status ${res.status} missing Location header`);
        }

        const nextUrl = new URL(location, currentUrl).toString();
        redirectCount++;
        if (redirectCount > maxRedirects) {
          throw new SsrfError(`Exceeded maximum redirect limit of ${maxRedirects}`);
        }
        currentUrl = nextUrl;
        continue;
      }

      if (!res.ok) {
        throw new Error(`Upstream returned HTTP ${res.status}`);
      }

      // Check Content-Length header if present
      const cl = res.headers.get('content-length');
      if (cl) {
        const parsedCl = parseInt(cl, 10);
        if (!isNaN(parsedCl) && parsedCl > maxSizeBytes) {
          throw new SsrfError(
            `Content-Length ${parsedCl} exceeds maximum allowed size of ${maxSizeBytes} bytes`,
          );
        }
      }

      if (!res.body) {
        return { buffer: Buffer.alloc(0), contentType: res.headers.get('content-type') };
      }

      const reader: ReadableStreamDefaultReader<Uint8Array> = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.length;
          if (totalBytes > maxSizeBytes) {
            await reader.cancel();
            throw new SsrfError(
              `Response payload exceeded maximum allowed size of ${maxSizeBytes} bytes`,
            );
          }
          chunks.push(value);
        }
      }

      return {
        buffer: Buffer.concat(chunks),
        contentType: res.headers.get('content-type'),
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof SsrfError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new SsrfError(`Request timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }

  throw new SsrfError(`Exceeded maximum redirect limit of ${maxRedirects}`);
}
