/**
 * Shared API client used by all web pages.
 *
 * All requests go to the same origin (proxied to :3001 by Vite in dev).
 * The session cookie is attached automatically by the browser — no manual
 * headers needed (SameSite=Strict, HttpOnly).
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin', // always send cookies
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore parse failure */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export interface SetupStatus {
  configured: boolean;
  accounts: AccountSummary[];
}

export interface AccountSummary {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  scopeLevel: 'readonly' | 'full';
  status: 'ok' | 'syncing' | 'needs_reauth' | 'error';
}

export function getSetupStatus(): Promise<SetupStatus> {
  return request<SetupStatus>('/api/setup/status');
}

export function saveCredentials(clientId: string, clientSecret: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/setup/credentials', {
    method: 'POST',
    body: JSON.stringify({ clientId, clientSecret }),
  });
}

/** Navigate the browser to the Google consent screen (server redirects). */
export function startAuth(scope: 'readonly' | 'full' = 'readonly'): void {
  window.location.href = `/api/auth/start?scope=${scope}`;
}
