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

let sessionPromise: Promise<void> | null = null;

export async function ensureSession(): Promise<void> {
  if (!sessionPromise) {
    sessionPromise = fetch('/health', { credentials: 'same-origin' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to bootstrap session');
      })
      .catch((err: unknown) => {
        sessionPromise = null;
        throw err;
      });
  }
  return sessionPromise;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  await ensureSession();
  let res = await fetch(path, {
    credentials: 'same-origin', // always send cookies
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  // If unauthorized, re-bootstrap session once (e.g. server restarted and token changed)
  if (res.status === 401) {
    sessionPromise = null;
    await ensureSession();
    res = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  }

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

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export interface SyncAccountStatus {
  id: string;
  email: string;
  displayName: string;
  status: 'ok' | 'syncing' | 'needs_reauth' | 'error';
  fullSyncStage: string | null;
  lastFullSyncAt: number | null;
  lastIncrementalAt: number | null;
  fileCount: number;
}

export interface SyncStatus {
  accounts: SyncAccountStatus[];
}

export function getSyncStatus(): Promise<SyncStatus> {
  return request<SyncStatus>('/api/sync/status');
}

export function triggerSync(accountId: string): Promise<{ ok: boolean; message: string }> {
  return request<{ ok: boolean; message: string }>(`/api/sync/start/${accountId}`, {
    method: 'POST',
  });
}

export interface SyncProgressEvent {
  type: 'progress' | 'done' | 'error' | 'connected';
  accountId?: string;
  indexed?: number;
  stage?: string;
  message?: string;
}

/** Subscribe to sync progress SSE events. Returns an unsubscribe function. */
export function subscribeSyncProgress(onEvent: (e: SyncProgressEvent) => void): () => void {
  const es = new EventSource('/api/sync/progress', { withCredentials: true });
  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data as string) as SyncProgressEvent;
      onEvent(data);
    } catch {
      /* ignore malformed events */
    }
  };
  es.onerror = () => {
    // EventSource auto-reconnects; just emit an error event so UI can react
    onEvent({ type: 'error', message: 'SSE connection lost — reconnecting…' });
  };
  return () => es.close();
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export interface FileRecord {
  rowid: number;
  account_id: string;
  id: string;
  name: string;
  mime_type: string;
  parent_id: string | null;
  size_bytes: number | null;
  modified_at: number;
  created_at_ms: number;
  starred: number;
  trashed: number;
  thumbnail_url: string | null;
  web_view_link: string | null;
  image_width: number | null;
  image_height: number | null;
  taken_at: number | null;
  camera_make: string | null;
  camera_model: string | null;
}

export interface FilesListResponse {
  files: FileRecord[];
  total: number;
  offset: number;
  limit: number;
}

export interface PhotosListResponse {
  files: FileRecord[];
  offset: number;
  limit: number;
}

export interface SearchResponse {
  files: FileRecord[];
  query: string;
  limit: number;
}

export function getFiles(opts: {
  accountId?: string;
  offset?: number;
  limit?: number;
}): Promise<FilesListResponse> {
  const params = new URLSearchParams();
  if (opts.accountId) params.set('accountId', opts.accountId);
  if (opts.offset != null) params.set('offset', String(opts.offset));
  if (opts.limit != null) params.set('limit', String(opts.limit));
  return request<FilesListResponse>(`/api/files/list?${params.toString()}`);
}

export function getPhotos(opts: {
  accountId?: string;
  offset?: number;
  limit?: number;
}): Promise<PhotosListResponse> {
  const params = new URLSearchParams();
  if (opts.accountId) params.set('accountId', opts.accountId);
  if (opts.offset != null) params.set('offset', String(opts.offset));
  if (opts.limit != null) params.set('limit', String(opts.limit));
  return request<PhotosListResponse>(`/api/files/photos?${params.toString()}`);
}

export function searchFiles(opts: {
  q: string;
  accountId?: string;
  limit?: number;
}): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: opts.q });
  if (opts.accountId) params.set('accountId', opts.accountId);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  return request<SearchResponse>(`/api/files/search?${params.toString()}`);
}
