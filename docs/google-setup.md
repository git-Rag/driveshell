# Setting Up Google Cloud Credentials for DriveShell

> **Not affiliated with or endorsed by Google.** DriveShell uses Google Drive as storage. You need
> your own Google Cloud project and OAuth client. This is free for personal use.
>
> **Note:** Google periodically redesigns the Cloud Console UI. If your console looks different from
> these steps, the concepts stay the same — look for the same section names (Branding, Audience,
> Data Access, Clients).

---

## Overview

You will:

1. Create a Google Cloud project
2. Enable the Google Drive API
3. Set up the **Google Auth Platform** (consent screen, audience, scopes, client)
4. ⚠️ **Publish to "In production" BEFORE your first sign-in** (read why below)
5. Create an OAuth 2.0 Desktop app client

Time required: ~15–20 minutes.

---

## Step 1 — Create a Google Cloud Project

1. Go to [https://console.cloud.google.com/](https://console.cloud.google.com/) and sign in.
2. At the top of the page, click the **project selector** (may say "Select a project" or show your
   last project).
3. In the dialog, click **"New Project"** (top-right corner).
4. Fill in:
   - **Project name:** e.g. `DriveShell Personal` (your internal label only)
   - **Organization:** leave as "No organization" for personal use
5. Click **"Create"**. Wait a few seconds for provisioning.
6. Make sure the new project is selected in the top bar before continuing.

---

## Step 2 — Enable the Google Drive API

1. In the left sidebar, go to **"APIs & Services" → "Library"**.
2. Search for **"Google Drive API"** and press Enter.
3. Click the **Google Drive API** result.
4. Click the blue **"Enable"** button.
5. You will land on the Drive API dashboard. ✅

---

## Step 3 — Google Auth Platform: Get Started

> In the current console, the OAuth consent screen is under **"APIs & Services" → "Google Auth
> Platform"** (sometimes labelled "OAuth consent screen"). The sub-pages are: Overview, Branding,
> Audience, Data Access, Clients, Verification Center.

1. Go to **"APIs & Services" → "Google Auth Platform"** (or "OAuth consent screen").
2. If prompted to **"Get started"**, click it and fill in:
   - **App name:** `DriveShell` (this appears on the Google consent screen)
   - **User support email:** your email address
   - **User type:** select **"External"** (required for personal Google accounts)
   - **Developer contact email:** your email address again
3. Click **"Save and continue"** through any remaining intro steps.

---

## Step 4 — Audience: Add Test Users

1. Navigate to the **"Audience"** sub-page.
2. Under "Test users", click **"Add users"**.
3. Add your own Google email address (and any other personal accounts you plan to sync).
4. Click **"Save"**.

> You will come back here in a moment to publish the app. Do that **before** signing in.

---

## Step 5 — Data Access: Add Both Scopes Now

> Adding both scopes now means you will not need to revisit the console when write features are
> enabled later.

1. Navigate to the **"Data Access"** sub-page.
2. Click **"Add or remove scopes"**.
3. In the filter/search box, type `drive`.
4. Check **both** of the following:
   - `https://www.googleapis.com/auth/drive.readonly`
   - `https://www.googleapis.com/auth/drive`
5. Click **"Update"**, then **"Save"**.

**Why both?** DriveShell starts in read-only mode. When you enable write features (rename, trash,
upload, vault), it will re-authorize with the full `drive` scope. Having it pre-approved avoids
returning to this console.

---

## Step 6 — ⚠️ Publish to "In Production" BEFORE Your First Sign-In

> **This is the most important step to get right, in this order.**

**If you sign in while the app is in Testing mode, your refresh token will expire in 7 days.**
Publishing to "In production" does NOT extend a token that was already issued in Testing mode — you
would need to re-authorize after publishing anyway. So: **publish first, then sign in.**

### How to publish

1. Navigate to the **"Audience"** sub-page (or the main Overview if there's a publish button there).
2. Click **"Publish app"** (or **"Push to production"**).
3. A warning appears: _"Your app will be available to any user with a Google Account."_

> **This does NOT make your app public.** No one can use DriveShell except whoever has the client
> credentials (you). Google uses "available to any user" to mean the token lifetime restriction is
> lifted, not that the app is listed anywhere.

4. Click **"Confirm"**.

Your app is now "In production" and **unverified**. This is expected and permanently fine for
personal use:

- Refresh tokens no longer expire (unless revoked or unused for 6+ months).
- **You will always see an "unverified app" warning** on the Google consent screen (a screen saying
  "Google hasn't verified this app"). Click **"Advanced" → "Go to DriveShell (unsafe)"** to proceed.
  This warning never goes away without a formal Google security review — that is a process for
  published consumer apps, not personal tools.
- DriveShell supports up to **100 users** without Google review. For personal use, this is more than
  enough.

---

## Step 7 — Create the OAuth Client

> ⚠️ **The client secret is shown only once.** Download the JSON or copy it immediately. If you lose
> it, you must create a new client (the old one can be deleted).

1. Navigate to the **"Clients"** sub-page.
2. Click **"+ Create client"** (or **"Create OAuth client ID"**).
3. Under **"Application type"**, select **"Desktop app"**.
4. **Name:** e.g. `DriveShell Desktop`.
5. Click **"Create"**.
6. A dialog shows your **Client ID** and **Client Secret**.
   - **Client ID** looks like: `1234567890-abc123.apps.googleusercontent.com`
   - **Client Secret** looks like: `GOCSPX-...`
7. Click **"Download JSON"** to save a backup in a safe place (not inside the project folder, never
   committed to git).
8. Click **"OK"**.

> **Never commit or share your Client ID or Client Secret.** Anyone with both values can impersonate
> your app and request access to users' Drive data under your project.

---

## Step 8 — Enter Credentials in DriveShell

When DriveShell first launches, the **Setup Wizard** will appear and ask for your Client ID and
Client Secret. Enter them there.

DriveShell stores them in your OS keychain:

- **Windows:** Windows Credential Manager
- **macOS:** macOS Keychain
- **Linux:** Secret Service (libsecret / GNOME Keyring / KWallet)

After that, DriveShell opens a browser window for the Google sign-in flow. Because you published the
app first (Step 6), the refresh token you receive will not expire.

---

## Troubleshooting

| Problem                                                                     | Fix                                                                                                                                                        |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Access blocked: This app's request is invalid"                             | OAuth client type is wrong. Must be **Desktop app**, not Web application. Delete and recreate the client.                                                  |
| "Error 400: redirect_uri_mismatch"                                          | Same as above — Desktop app type uses the loopback redirect automatically.                                                                                 |
| "Access blocked: app has not completed verification" or "403 access_denied" | Your email is not in the Test users list (Audience page). Add it, then try again. This only applies if the app is still in Testing mode.                   |
| Token expires every 7 days                                                  | You signed in while in Testing mode. Publish to "In production" (Step 6), then sign out and re-authorize in DriveShell.                                    |
| "This app isn't verified" warning                                           | Expected and permanent for personal use. Click "Advanced" → "Go to DriveShell (unsafe)".                                                                   |
| I lost the client secret                                                    | The secret cannot be recovered. Go to Clients, delete the old client, and create a new one. Enter the new secret in DriveShell Settings → Credentials.     |
| I want to add a second Google account                                       | Go to DriveShell Settings → Accounts → Add account. The same client ID/secret is reused; you just go through the OAuth flow again with the second account. |
| Up to 100 users is not enough                                               | Submit your app for Google's security review (CASA Tier 2). For a personal tool, this is not needed.                                                       |

---

## Revoking Access

To remove DriveShell's access to your Drive:

1. Go to [https://myaccount.google.com/connections](https://myaccount.google.com/connections).
2. Find **DriveShell** (or your chosen app name) and click **"Remove Access"**.
3. Tokens are invalidated immediately. DriveShell will show a re-auth prompt.
