# ADR 0003 — Account identity: Drive permissionId from about.get

**Date:** 2024  
**Status:** Accepted

## Context

We need a stable, unique identifier for each linked Google account to key all rows in the `files`,
`sync_jobs`, and future tables. Options:

**Option A:** `sub` claim from Google's OIDC token — requires requesting the `openid` scope.  
**Option B:** `permissionId` from the Drive API's `about.get` — available without extra scopes.  
**Option C:** email address — not stable (users can change their email).

## Decision

Use **Option B**: `accounts.id = permissionId` from
`about.get(fields: 'user(permissionId,emailAddress,displayName,photoLink)')`.

Call `about.get` immediately after the OAuth token exchange to hydrate the account row. Store
`email`, `displayName`, and `photoLink` from the same response.

## Rationale

- Avoids requesting `openid`, `email`, or `profile` scopes. DriveShell requests only Drive scopes;
  adding OIDC scopes would expand the OAuth consent screen and potentially complicate the
  unverified-app warning.
- `permissionId` is the Drive-native stable identifier for a user; it is used internally by Drive's
  sharing and permissions model.
- Fetching `about.get` immediately post-auth is a single lightweight request and gives us display
  info (email, name, avatar) without a separate People API call.

## Consequences

- The account ID is opaque (a numeric string). Do not display it to users; show `email` and
  `displayName` instead.
- If a user has multiple accounts, each will have a different `permissionId`. This is correct.
- `about.get` must be retried with backoff on failure; without it, we cannot create the account row.
