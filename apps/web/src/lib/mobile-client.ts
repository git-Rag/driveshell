/**
 * mobile-client.ts — Native Mobile Client for Project Sunflower (Android/Capacitor).
 *
 * Provides a self-contained, zero-sidecar client on Android:
 *  - Stores credentials and accounts in persistent local storage.
 *  - Manages Google OAuth 2.0 PKCE with Android loopback server & deep link handling.
 *  - Uses IndexedDB for local file metadata storage and instant offline gallery navigation.
 *  - Interacts directly with Google Drive API v3 via CapacitorHttp.
 */

import { Browser } from '@capacitor/browser';
import { App as CapApp } from '@capacitor/app';
import { CapacitorHttp } from '@capacitor/core';
import { isRealMedia } from '@driveshell/shared';
import { formatMonthKey, formatMonthLabel } from '@driveshell/shared';
import type {
  SetupStatus,
  AccountSummary,
  FileRecord,
  PhotosListResponse,
  MonthsResponse,
  PhotoMonthBucket,
  SyncStatus,
  VaultStatus,
  VaultFile,
  Album,
} from './api';

const STORAGE_KEYS = {
  CLIENT_ID: 'sunflower_mobile_client_id',
  CLIENT_SECRET: 'sunflower_mobile_client_secret',
  ACCOUNTS: 'sunflower_mobile_accounts',
  TOKENS: 'sunflower_mobile_tokens',
  PKCE_VERIFIER: 'sunflower_mobile_pkce_verifier',
  PKCE_STATE: 'sunflower_mobile_pkce_state',
  LAST_SYNC: 'sunflower_mobile_last_sync',
};

export function isCapacitor(): boolean {
  if (typeof window === 'undefined') return false;
  const anyWin = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  return Boolean(
    anyWin.Capacitor?.isNativePlatform?.() ??
    (anyWin.Capacitor && window.location.origin.includes('localhost') && !window.location.port),
  );
}

// ---------------------------------------------------------------------------
// Credentials & Setup
// ---------------------------------------------------------------------------

export function getMobileSetupStatus(): SetupStatus {
  const clientId = localStorage.getItem(STORAGE_KEYS.CLIENT_ID);
  const clientSecret = localStorage.getItem(STORAGE_KEYS.CLIENT_SECRET);
  const accounts = getMobileAccounts();

  return {
    configured: Boolean(clientId && clientSecret),
    accounts,
  };
}

export function saveMobileCredentials(clientId: string, clientSecret: string): { ok: boolean } {
  const cleanId = clientId.trim().replace(/^https?:\/\//i, '');
  const cleanSecret = clientSecret.trim();

  localStorage.setItem(STORAGE_KEYS.CLIENT_ID, cleanId);
  localStorage.setItem(STORAGE_KEYS.CLIENT_SECRET, cleanSecret);
  return { ok: true };
}

export function getMobileAccounts(): AccountSummary[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
    if (!raw) return [];
    return JSON.parse(raw) as AccountSummary[];
  } catch {
    return [];
  }
}

interface StoredTokens {
  accessToken: string;
  refreshToken?: string | undefined;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

function getStoredTokens(accountId: string): StoredTokens | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.TOKENS}_${accountId}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

function saveStoredTokens(accountId: string, tokens: StoredTokens): void {
  localStorage.setItem(`${STORAGE_KEYS.TOKENS}_${accountId}`, JSON.stringify(tokens));
}

async function getFreshAccessToken(accountId: string): Promise<string | null> {
  const tokens = getStoredTokens(accountId);
  if (!tokens) return null;

  if (tokens.expiresAt && Date.now() < tokens.expiresAt - 120_000) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    return tokens.accessToken;
  }

  const clientId = localStorage.getItem(STORAGE_KEYS.CLIENT_ID);
  const clientSecret = localStorage.getItem(STORAGE_KEYS.CLIENT_SECRET);
  if (!clientId || !clientSecret) return tokens.accessToken;

  try {
    const res = await CapacitorHttp.post({
      url: 'https://oauth2.googleapis.com/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });

    const tokenData = res.data as TokenResponse | undefined;
    if (res.status === 200 && tokenData?.access_token) {
      const newTokens: StoredTokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? tokens.refreshToken,
        expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
      };
      saveStoredTokens(accountId, newTokens);
      return newTokens.accessToken;
    }
  } catch (err) {
    console.warn('Failed to refresh token:', err);
  }

  return tokens.accessToken;
}

// ---------------------------------------------------------------------------
// PKCE Helpers (WebCrypto)
// ---------------------------------------------------------------------------

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    const val = bytes[i];
    if (val !== undefined) {
      binary += String.fromCharCode(val);
    }
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const verifier = base64UrlEncode(randomBytes.buffer);

  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const challenge = base64UrlEncode(hash);

  return { verifier, challenge };
}

function generateRandomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Google OAuth PKCE Flow on Mobile
// ---------------------------------------------------------------------------

let isAuthListening = false;

export async function startMobileAuth(scope: 'readonly' | 'full' = 'readonly'): Promise<void> {
  const clientId = localStorage.getItem(STORAGE_KEYS.CLIENT_ID);
  if (!clientId) {
    throw new Error('Please save Client ID and Secret first.');
  }

  const { verifier, challenge } = await generatePkce();
  const state = generateRandomState();

  localStorage.setItem(STORAGE_KEYS.PKCE_VERIFIER, verifier);
  localStorage.setItem(STORAGE_KEYS.PKCE_STATE, state);

  const scopeUrl =
    scope === 'full'
      ? 'https://www.googleapis.com/auth/drive'
      : 'https://www.googleapis.com/auth/drive.readonly';

  const redirectUri = 'http://127.0.0.1:3001';

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scopeUrl)}&` +
    `code_challenge=${encodeURIComponent(challenge)}&` +
    `code_challenge_method=S256&` +
    `state=${encodeURIComponent(state)}&` +
    `access_type=offline&` +
    `prompt=consent`;

  setupOAuthListeners();

  try {
    await Browser.open({ url: authUrl });
  } catch {
    window.location.href = authUrl;
  }
}

function setupOAuthListeners(): void {
  if (isAuthListening) return;
  isAuthListening = true;

  // 1. Android Loopback Server event (from MainActivity)
  window.addEventListener('sunflower-oauth-code', ((
    event: CustomEvent<{ code: string; state: string }>,
  ) => {
    const { code, state } = event.detail ?? {};
    if (code) {
      void handleOAuthCodeReceived(code, state ?? '', 'http://127.0.0.1:3001');
    }
  }) as EventListener);

  // Direct bridge function called from Java evaluateJavascript
  (
    window as unknown as { onSunflowerOAuthCode?: (code: string, state: string) => void }
  ).onSunflowerOAuthCode = (code: string, state: string) => {
    if (code) {
      void handleOAuthCodeReceived(code, state ?? '', 'http://127.0.0.1:3001');
    }
  };

  // 2. Deep link handler (com.projectsunflower.app://oauth2redirect)
  void CapApp.addListener('appUrlOpen', (data) => {
    try {
      const url = new URL(data.url);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (code) {
        void handleOAuthCodeReceived(code, state ?? '', 'http://127.0.0.1:3001');
      }
    } catch (e) {
      console.warn('Failed to parse deep link URL:', e);
    }
  });
}

// Ensure OAuth listeners are active immediately upon app launch
if (typeof window !== 'undefined') {
  setupOAuthListeners();
}

interface AboutResponse {
  user?: {
    permissionId: string;
    displayName: string;
    emailAddress: string;
    photoLink?: string;
  };
}

async function handleOAuthCodeReceived(
  code: string,
  _receivedState: string | null,
  redirectUri: string,
): Promise<void> {
  try {
    await Browser.close();
  } catch {
    /* ignore browser close errors */
  }

  const clientId = localStorage.getItem(STORAGE_KEYS.CLIENT_ID);
  const clientSecret = localStorage.getItem(STORAGE_KEYS.CLIENT_SECRET);
  const verifier = localStorage.getItem(STORAGE_KEYS.PKCE_VERIFIER);

  if (!clientId || !clientSecret || !verifier) {
    console.error('Missing PKCE credentials or verifier');
    return;
  }

  try {
    try {
      await Browser.close();
    } catch {
      /* ignore */
    }

    // Exchange authorization code for tokens
    const tokenRes = await CapacitorHttp.post({
      url: 'https://oauth2.googleapis.com/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });

    const tokenData = tokenRes.data as TokenResponse | undefined;
    if (tokenRes.status !== 200 || !tokenData?.access_token) {
      console.error('Token exchange failed:', tokenRes.data);
      return;
    }

    const { access_token, refresh_token, expires_in } = tokenData;

    // Get user profile from Google Drive About API
    const aboutRes = await CapacitorHttp.get({
      url: 'https://www.googleapis.com/drive/v3/about?fields=user(permissionId,displayName,emailAddress,photoLink)',
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const aboutData = aboutRes.data as AboutResponse | undefined;
    const user = aboutData?.user;
    if (!user) {
      console.error('Failed to get user profile from Drive');
      return;
    }

    const account: AccountSummary = {
      id: user.permissionId,
      email: user.emailAddress,
      displayName: user.displayName,
      avatarUrl: user.photoLink ?? null,
      scopeLevel: 'readonly',
      status: 'ok',
    };

    const accounts = getMobileAccounts();
    const existingIdx = accounts.findIndex((a) => a.id === account.id);
    if (existingIdx >= 0) {
      accounts[existingIdx] = account;
    } else {
      accounts.push(account);
    }

    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
    saveStoredTokens(account.id, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + (expires_in ?? 3600) * 1000,
    });

    // Start background sync
    void syncMobileDrive(account.id);

    // Refresh UI
    window.location.href = '/?auth_success=1';
  } catch (err) {
    console.error('OAuth token exchange error:', err);
  }
}

// ---------------------------------------------------------------------------
// IndexedDB Local Storage for Files
// ---------------------------------------------------------------------------

const DB_NAME = 'SunflowerMobileDB';
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('files')) {
        const store = db.createObjectStore('files', { keyPath: 'id' });
        store.createIndex('taken_at', 'taken_at', { unique: false });
        store.createIndex('account_id', 'account_id', { unique: false });
        store.createIndex('starred', 'starred', { unique: false });
      }
      if (!db.objectStoreNames.contains('vault_files')) {
        db.createObjectStore('vault_files', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('albums')) {
        db.createObjectStore('albums', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error(request.error ? request.error.message : 'Failed to open IndexedDB'));
  });
}

function parseExifTime(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const parts = dateStr.split(/[:\s-]/);
  if (
    parts.length >= 6 &&
    parts[0] !== undefined &&
    parts[1] !== undefined &&
    parts[2] !== undefined &&
    parts[3] !== undefined &&
    parts[4] !== undefined &&
    parts[5] !== undefined
  ) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const h = parseInt(parts[3], 10);
    const min = parseInt(parts[4], 10);
    const s = parseInt(parts[5], 10);
    const date = new Date(Date.UTC(y, m, d, h, min, s));
    if (!isNaN(date.getTime())) return date.getTime();
  }
  const fallback = new Date(dateStr).getTime();
  return isNaN(fallback) ? null : fallback;
}

// ---------------------------------------------------------------------------
// Background Sync
// ---------------------------------------------------------------------------

interface DriveRawFile {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  createdTime?: string;
  starred?: boolean;
  trashed?: boolean;
  thumbnailLink?: string;
  webViewLink?: string;
  imageMediaMetadata?: {
    time?: string;
    width?: number;
    height?: number;
    cameraMake?: string;
    cameraModel?: string;
  };
  videoMediaMetadata?: {
    durationMillis?: string | number;
    width?: number;
    height?: number;
  };
}

interface DriveFilesResponse {
  files?: DriveRawFile[];
  nextPageToken?: string;
}

let isSyncing = false;

export async function syncMobileDrive(
  accountId?: string,
): Promise<{ ok: boolean; message: string }> {
  if (isSyncing) return { ok: true, message: 'Sync already in progress' };

  const accounts = getMobileAccounts();
  const targetAccount = accountId ? accounts.find((a) => a.id === accountId) : accounts[0];
  if (!targetAccount) return { ok: false, message: 'No account configured' };

  const accessToken = await getFreshAccessToken(targetAccount.id);
  if (!accessToken) return { ok: false, message: 'Account needs reauthorization' };

  isSyncing = true;
  window.dispatchEvent(
    new CustomEvent('sunflower-sync-progress', {
      detail: {
        type: 'progress',
        indexed: 0,
        stage: 'media_first',
        message: 'Starting Google Drive sync…',
      },
    }),
  );

  try {
    const db = await openDB();
    let pageToken: string | undefined;
    let pageCount = 0;
    let totalIndexed = 0;

    do {
      const queryParams = new URLSearchParams({
        q: 'trashed = false',
        fields:
          'nextPageToken,files(id,name,mimeType,parents,size,modifiedTime,createdTime,starred,trashed,thumbnailLink,webViewLink,imageMediaMetadata(width,height,time,cameraMake,cameraModel),videoMediaMetadata(width,height,durationMillis))',
        pageSize: '250',
      });
      if (pageToken) queryParams.set('pageToken', pageToken);

      const res = await CapacitorHttp.get({
        url: `https://www.googleapis.com/drive/v3/files?${queryParams.toString()}`,
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.status !== 200 || !res.data) break;

      const driveData = res.data as DriveFilesResponse;
      const driveFiles = driveData.files ?? [];
      pageToken = driveData.nextPageToken;

      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      let pageMediaCount = 0;

      for (const f of driveFiles) {
        const id = f.id ?? '';
        const name = f.name ?? '';
        const mimeType = f.mimeType ?? '';
        const imageMediaMetadata = f.imageMediaMetadata;
        const videoMediaMetadata = f.videoMediaMetadata;

        if (!isRealMedia({ name, mimeType, videoMediaMetadata })) {
          continue;
        }

        const modifiedAt = f.modifiedTime ? new Date(f.modifiedTime).getTime() : Date.now();
        const createdAt = f.createdTime ? new Date(f.createdTime).getTime() : modifiedAt;
        const parsedTime = parseExifTime(imageMediaMetadata?.time);
        const takenAt =
          typeof parsedTime === 'number' && !isNaN(parsedTime) && parsedTime > 0
            ? parsedTime
            : typeof modifiedAt === 'number' && !isNaN(modifiedAt) && modifiedAt > 0
              ? modifiedAt
              : Date.now();

        const record: FileRecord = {
          rowid: Date.now() + Math.floor(Math.random() * 1000),
          account_id: targetAccount.id,
          id,
          name,
          mime_type: mimeType,
          parent_id: null,
          size_bytes: f.size ? parseInt(f.size, 10) : null,
          modified_at: modifiedAt,
          created_at_ms: createdAt,
          starred: f.starred ? 1 : 0,
          trashed: 0,
          thumbnail_url: f.thumbnailLink ?? null,
          web_view_link: f.webViewLink ?? null,
          image_width: imageMediaMetadata?.width ?? videoMediaMetadata?.width ?? null,
          image_height: imageMediaMetadata?.height ?? videoMediaMetadata?.height ?? null,
          duration_ms: videoMediaMetadata?.durationMillis
            ? parseInt(String(videoMediaMetadata.durationMillis), 10)
            : null,
          is_media: 1,
          is_hidden: 0,
          taken_at: takenAt,
          camera_make: imageMediaMetadata?.cameraMake ?? null,
          camera_model: imageMediaMetadata?.cameraModel ?? null,
        };

        store.put(record);
        pageMediaCount++;
      }

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error(tx.error ? tx.error.message : 'Transaction failed'));
      });

      totalIndexed += pageMediaCount;
      pageCount++;

      window.dispatchEvent(
        new CustomEvent('sunflower-sync-progress', {
          detail: {
            type: 'progress',
            indexed: totalIndexed,
            total: totalIndexed,
            stage: 'media_first',
            message: `Indexed ${totalIndexed} media files…`,
          },
        }),
      );
    } while (pageToken && pageCount < 100);

    localStorage.setItem('sunflower_mobile_file_count', String(totalIndexed));
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC, String(Date.now()));

    window.dispatchEvent(
      new CustomEvent('sunflower-sync-progress', {
        detail: {
          type: 'done',
          indexed: totalIndexed,
          stage: 'done',
          message: 'Sync complete',
        },
      }),
    );

    return { ok: true, message: `Sync complete (${totalIndexed} items indexed)` };
  } catch (err) {
    console.error('Mobile sync error:', err);
    window.dispatchEvent(
      new CustomEvent('sunflower-sync-progress', {
        detail: {
          type: 'error',
          message: err instanceof Error ? err.message : 'Sync failed',
        },
      }),
    );
    return { ok: false, message: err instanceof Error ? err.message : 'Sync failed' };
  } finally {
    isSyncing = false;
  }
}

export function getMobileSyncStatus(): SyncStatus {
  const accounts = getMobileAccounts();
  const rawLastSync = localStorage.getItem(STORAGE_KEYS.LAST_SYNC);
  const lastSync = rawLastSync ? Number(rawLastSync) : null;
  const rawFileCount = localStorage.getItem('sunflower_mobile_file_count');
  const fileCount = rawFileCount ? Number(rawFileCount) : 0;

  return {
    accounts: accounts.map((a) => ({
      id: a.id,
      email: a.email,
      displayName: a.displayName,
      status: isSyncing ? 'syncing' : a.status,
      fullSyncStage: isSyncing ? 'media_first' : 'done',
      lastFullSyncAt: lastSync,
      lastIncrementalAt: lastSync,
      fileCount,
    })),
  };
}

// ---------------------------------------------------------------------------
// Gallery Queries (IndexedDB)
// ---------------------------------------------------------------------------

export async function getMobilePhotos(opts: {
  accountId?: string | undefined;
  offset?: number | undefined;
  limit?: number | undefined;
  type?: 'all' | 'photos' | 'videos' | 'favorites' | undefined;
  year?: number | undefined;
  month?: string | undefined;
}): Promise<PhotosListResponse> {
  const db = await openDB();
  const tx = db.transaction('files', 'readonly');
  const store = tx.objectStore('files');

  const files: FileRecord[] = [];
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 100;

  await new Promise<void>((resolve, reject) => {
    const request = store.openCursor();
    request.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const item = cursor.value as FileRecord;
        let match = true;

        if (opts.type === 'photos' && !item.mime_type.startsWith('image/')) match = false;
        if (opts.type === 'videos' && !item.mime_type.startsWith('video/')) match = false;
        if (opts.type === 'favorites' && !item.starred) match = false;

        if (opts.year) {
          const d = new Date(item.taken_at ?? item.modified_at);
          if (d.getUTCFullYear() !== opts.year) match = false;
        }

        if (opts.month) {
          const d = new Date(item.taken_at ?? item.modified_at);
          const mk = formatMonthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
          if (mk !== opts.month) match = false;
        }

        if (match) {
          files.push(item);
        }

        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () =>
      reject(new Error(request.error ? request.error.message : 'Cursor request failed'));
  });

  // Sort newest first
  files.sort((a, b) => (b.taken_at ?? b.modified_at) - (a.taken_at ?? a.modified_at));

  const sliced = files.slice(offset, offset + limit);
  return {
    files: sliced,
    total: files.length,
    offset,
    limit,
  };
}

export async function getMobileMonths(opts?: {
  accountId?: string | undefined;
  type?: 'all' | 'photos' | 'videos' | 'favorites' | undefined;
}): Promise<MonthsResponse> {
  const photosRes = await getMobilePhotos({ type: opts?.type, limit: 10000 });
  const map = new Map<string, PhotoMonthBucket>();

  for (const f of photosRes.files) {
    const time = f.taken_at ?? f.modified_at;
    const d = new Date(time);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const key = formatMonthKey(year, month);

    const existing = map.get(key);
    if (existing) {
      existing.count++;
      if (time > existing.latestTime) existing.latestTime = time;
    } else {
      map.set(key, {
        monthKey: key,
        label: formatMonthLabel(year, month),
        year,
        count: 1,
        latestTime: time,
      });
    }
  }

  const months = Array.from(map.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  return {
    months,
    total: photosRes.total,
  };
}

export function getMobileMediaThumbUrl(
  fileId: string,
  size = 400,
  thumbnailUrl?: string | null,
): string {
  const accounts = getMobileAccounts();
  const token = accounts[0] ? getStoredTokens(accounts[0].id)?.accessToken : null;
  const params = new URLSearchParams({ size: String(size) });
  if (token) params.set('token', token);
  if (thumbnailUrl) params.set('thumbUrl', thumbnailUrl);
  return `http://127.0.0.1:3001/api/media/${encodeURIComponent(fileId)}/thumb?${params.toString()}`;
}

export function getMobileMediaStreamUrl(fileId: string): string {
  const accounts = getMobileAccounts();
  const token = accounts[0] ? getStoredTokens(accounts[0].id)?.accessToken : null;
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  const qs = params.toString();
  return `http://127.0.0.1:3001/api/media/${encodeURIComponent(fileId)}/stream${qs ? `?${qs}` : ''}`;
}

export function getMobileMediaDownloadUrl(fileId: string, fileName?: string): string {
  const accounts = getMobileAccounts();
  const token = accounts[0] ? getStoredTokens(accounts[0].id)?.accessToken : null;
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (fileName) params.set('filename', fileName);
  const qs = params.toString();
  return `http://127.0.0.1:3001/api/media/${encodeURIComponent(fileId)}/download${qs ? `?${qs}` : ''}`;
}

export async function downloadMobileFile(fileId: string, fileName: string): Promise<void> {
  const accounts = getMobileAccounts();
  const token = accounts[0] ? getStoredTokens(accounts[0].id)?.accessToken : null;

  // 1. First attempt: In-app fetch & Blob object URL trigger
  try {
    const streamUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
    const res = await fetch(streamUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
      return;
    }
  } catch (err) {
    console.warn('In-app blob download fallback:', err);
  }

  // 2. Second attempt: Android system Download Manager via direct authenticated Drive URL
  const directUrl = token
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&access_token=${encodeURIComponent(token)}`
    : `http://127.0.0.1:3001/api/media/${encodeURIComponent(fileId)}/download?filename=${encodeURIComponent(fileName)}`;

  try {
    await Browser.open({ url: directUrl });
  } catch {
    window.open(directUrl, '_system');
  }
}

// ---------------------------------------------------------------------------
// File Updates (Starred / Favorites, Rename, Trashed)
// ---------------------------------------------------------------------------

export async function updateMobileFile(
  fileId: string,
  updates: {
    name?: string | undefined;
    starred?: number | undefined;
    trashed?: number | undefined;
    parentId?: string | null | undefined;
  },
  accountId?: string,
): Promise<{ ok: boolean; file: FileRecord }> {
  const db = await openDB();
  const tx = db.transaction('files', 'readwrite');
  const store = tx.objectStore('files');

  const file = await new Promise<FileRecord | null>((resolve) => {
    const req = store.get(fileId);
    req.onsuccess = () => resolve((req.result as FileRecord) ?? null);
    req.onerror = () => resolve(null);
  });

  if (!file) {
    throw new Error('File not found in local library');
  }

  if (updates.name !== undefined) file.name = updates.name;
  if (updates.starred !== undefined) file.starred = updates.starred;
  if (updates.trashed !== undefined) file.trashed = updates.trashed;

  store.put(file);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('Transaction failed'));
  });

  // Sync update to Google Drive API in background
  const accounts = getMobileAccounts();
  const targetAccount = accountId ? accounts.find((a) => a.id === accountId) : accounts[0];
  if (targetAccount) {
    void (async () => {
      const accessToken = await getFreshAccessToken(targetAccount.id);
      if (accessToken) {
        const driveBody: Record<string, unknown> = {};
        if (updates.name !== undefined) driveBody.name = updates.name;
        if (updates.starred !== undefined) driveBody.starred = updates.starred === 1;
        if (updates.trashed !== undefined) driveBody.trashed = updates.trashed === 1;

        if (Object.keys(driveBody).length > 0) {
          try {
            await CapacitorHttp.patch({
              url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              data: driveBody,
            });
          } catch (e) {
            console.warn('Failed to sync file update to Drive:', e);
          }
        }
      }
    })();
  }

  return { ok: true, file };
}

// ---------------------------------------------------------------------------
// Private Vault (Local Encrypted Storage on Android)
// ---------------------------------------------------------------------------

const VAULT_STATUS_KEY = 'sunflower_mobile_vault_status';

export function getMobileVaultStatus(): VaultStatus {
  try {
    const raw = localStorage.getItem(VAULT_STATUS_KEY);
    if (!raw) return { initialized: false };
    return JSON.parse(raw) as VaultStatus;
  } catch {
    return { initialized: false };
  }
}

export function setupMobileVault(
  salt: string,
  canaryCiphertext: string,
  canaryIv: string,
): { ok: boolean } {
  const status: VaultStatus = {
    initialized: true,
    salt,
    canaryCiphertext,
    canaryIv,
    createdAt: Date.now(),
  };
  localStorage.setItem(VAULT_STATUS_KEY, JSON.stringify(status));
  return { ok: true };
}

export async function listMobileVaultFiles(): Promise<{ files: VaultFile[] }> {
  const db = await openDB();
  const tx = db.transaction('vault_files', 'readonly');
  const store = tx.objectStore('vault_files');
  const files: VaultFile[] = [];

  await new Promise<void>((resolve, reject) => {
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const item = cursor.value as VaultFile;
        const { encryptedPayloadBase64: _, ...rest } = item;
        files.push(rest);
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(new Error(req.error ? req.error.message : 'Cursor failed'));
  });

  return { files };
}

export async function uploadMobileVaultFile(data: {
  id?: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  encryptedPayloadBase64: string;
  iv: string;
}): Promise<{ ok: boolean; id: string }> {
  const id = data.id || `vault_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const record: VaultFile = {
    id,
    account_id: 'mobile',
    name: data.name,
    mime_type: data.mimeType,
    size_bytes: data.sizeBytes,
    iv: data.iv,
    created_at: Date.now(),
    encryptedPayloadBase64: data.encryptedPayloadBase64,
  };

  const db = await openDB();
  const tx = db.transaction('vault_files', 'readwrite');
  const store = tx.objectStore('vault_files');
  store.put(record);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(tx.error ? tx.error.message : 'Put failed'));
  });

  return { ok: true, id };
}

export async function getMobileVaultFileData(fileId: string): Promise<VaultFile> {
  const db = await openDB();
  const tx = db.transaction('vault_files', 'readonly');
  const store = tx.objectStore('vault_files');

  return new Promise((resolve, reject) => {
    const req = store.get(fileId);
    req.onsuccess = () => {
      if (req.result) resolve(req.result as VaultFile);
      else reject(new Error('Vault file not found'));
    };
    req.onerror = () => reject(new Error(req.error ? req.error.message : 'Get failed'));
  });
}

export async function deleteMobileVaultFile(fileId: string): Promise<{ ok: boolean }> {
  const db = await openDB();
  const tx = db.transaction('vault_files', 'readwrite');
  const store = tx.objectStore('vault_files');
  store.delete(fileId);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(tx.error ? tx.error.message : 'Delete failed'));
  });

  return { ok: true };
}

export async function resetMobileVault(): Promise<{ ok: boolean }> {
  localStorage.removeItem(VAULT_STATUS_KEY);
  const db = await openDB();
  const tx = db.transaction('vault_files', 'readwrite');
  const store = tx.objectStore('vault_files');
  store.clear();

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(tx.error ? tx.error.message : 'Clear failed'));
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Albums (Local Collections on Android)
// ---------------------------------------------------------------------------

interface StoredAlbum extends Album {
  item_ids: string[];
}

export async function listMobileAlbums(): Promise<{ albums: Album[] }> {
  const db = await openDB();
  const tx = db.transaction('albums', 'readonly');
  const store = tx.objectStore('albums');
  const albums: Album[] = [];

  await new Promise<void>((resolve, reject) => {
    const req = store.openCursor();
    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const item = cursor.value as StoredAlbum;
        const { item_ids: _, ...rest } = item;
        albums.push(rest);
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(new Error(req.error ? req.error.message : 'Cursor failed'));
  });

  return { albums };
}

export async function createMobileAlbum(
  title: string,
  description?: string,
  fileIds?: string[],
  accountId?: string,
): Promise<{ album: Album }> {
  const id = `album_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();
  const stored: StoredAlbum = {
    id,
    account_id: accountId || 'mobile',
    title,
    description: description || null,
    cover_file_id: fileIds?.[0] || null,
    item_count: fileIds?.length || 0,
    created_at: now,
    modified_at: now,
    item_ids: fileIds || [],
  };

  const db = await openDB();
  const tx = db.transaction('albums', 'readwrite');
  const store = tx.objectStore('albums');
  store.put(stored);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(tx.error ? tx.error.message : 'Put failed'));
  });

  const { item_ids: _, ...album } = stored;
  return { album };
}

export async function addItemsToMobileAlbum(
  albumId: string,
  fileIds: string[],
): Promise<{ ok: boolean; added: number }> {
  const db = await openDB();
  const tx = db.transaction('albums', 'readwrite');
  const store = tx.objectStore('albums');

  const stored = await new Promise<StoredAlbum | null>((resolve) => {
    const req = store.get(albumId);
    req.onsuccess = () => resolve((req.result as StoredAlbum) ?? null);
    req.onerror = () => resolve(null);
  });

  if (!stored) throw new Error('Album not found');

  const set = new Set(stored.item_ids);
  let added = 0;
  for (const id of fileIds) {
    if (!set.has(id)) {
      set.add(id);
      stored.item_ids.push(id);
      added++;
    }
  }

  stored.item_count = stored.item_ids.length;
  stored.modified_at = Date.now();
  if (!stored.cover_file_id && stored.item_ids[0]) {
    stored.cover_file_id = stored.item_ids[0];
  }

  store.put(stored);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('Update failed'));
  });

  return { ok: true, added };
}

export async function getMobileAlbum(
  albumId: string,
): Promise<{ album: Album; files: FileRecord[] }> {
  const db = await openDB();
  const albumTx = db.transaction('albums', 'readonly');
  const albumStore = albumTx.objectStore('albums');

  const stored = await new Promise<StoredAlbum | null>((resolve) => {
    const req = albumStore.get(albumId);
    req.onsuccess = () => resolve((req.result as StoredAlbum) ?? null);
    req.onerror = () => resolve(null);
  });

  if (!stored) throw new Error('Album not found');

  const filesTx = db.transaction('files', 'readonly');
  const filesStore = filesTx.objectStore('files');
  const items: FileRecord[] = [];

  for (const id of stored.item_ids) {
    const f = await new Promise<FileRecord | null>((resolve) => {
      const req = filesStore.get(id);
      req.onsuccess = () => resolve((req.result as FileRecord) ?? null);
      req.onerror = () => resolve(null);
    });
    if (f) items.push(f);
  }

  const { item_ids: _, ...album } = stored;
  return { album, files: items };
}

export async function deleteMobileAlbum(albumId: string): Promise<{ ok: boolean }> {
  const db = await openDB();
  const tx = db.transaction('albums', 'readwrite');
  const store = tx.objectStore('albums');
  store.delete(albumId);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error('Delete failed'));
  });

  return { ok: true };
}
