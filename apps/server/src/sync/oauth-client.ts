/**
 * oauth-client.ts — builds an authenticated google.drive client for a given account.
 *
 * Loads the refresh token from keychain, constructs an OAuth2 client,
 * and handles `invalid_grant` by marking the account as needing re-auth.
 */

import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type { FastifyBaseLogger } from 'fastify';
import type { Keychain } from '../auth/keychain';
import { KC_SERVICE, kcTokenKey } from '../auth/keychain';
import type { AccountQueries } from '../db/queries/accounts';

export interface AuthenticatedDrive {
  drive: drive_v3.Drive;
  oAuth2Client: OAuth2Client;
}

/**
 * Build an authenticated Drive v3 client for `accountId`.
 *
 * Throws if the refresh token is missing or the grant is revoked.
 * On `invalid_grant`, marks the account as `needs_reauth` before throwing.
 */
export async function getAuthenticatedDrive(
  accountId: string,
  keychain: Keychain,
  accountQ: AccountQueries,
  clientId: string,
  clientSecret: string,
  port: number,
  log: FastifyBaseLogger,
): Promise<AuthenticatedDrive> {
  const refreshToken = keychain.get(KC_SERVICE, kcTokenKey(accountId));
  if (!refreshToken) {
    throw new Error(`No refresh token found for account ${accountId}`);
  }

  const redirectUri = `http://127.0.0.1:${port}/auth/callback`;
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oAuth2Client.setCredentials({ refresh_token: refreshToken });

  // Eagerly refresh to surface invalid_grant before we start syncing
  try {
    await oAuth2Client.getAccessToken();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('invalid_grant') || msg.includes('Token has been expired or revoked')) {
      log.warn({ accountId }, 'invalid_grant — marking account needs_reauth');
      accountQ.setStatus(accountId, 'needs_reauth');
    }
    throw err;
  }

  const drive = google.drive({ version: 'v3', auth: oAuth2Client });
  return { drive, oAuth2Client };
}

