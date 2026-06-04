import "server-only";

import type { OAuthTokens } from "@/lib/calendar/types";

// Google OAuth 2.0 — calendar connection (NOT login). The user is already
// signed in (email/password); this is a standalone authorization-code flow that
// grants read-only calendar access and yields a refresh token so the
// server-side sync worker can pull events later (DATA-MODEL §9-C). Tokens are
// stored in calendar_secrets (service-role only), never sent to the browser.
//
// Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (see docs/GOOGLE-SETUP.md) and
// an authorized redirect URI of `${NEXT_PUBLIC_SITE_URL}/api/calendars/google/callback`.

// CSRF state cookie name for the connect flow (shared by the action that starts
// the flow and the callback that finishes it).
export const OAUTH_STATE_COOKIE = "google_oauth_state";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

// Read calendar busy/free + write back locked events (Phase 3) + the account
// email (for provider_account display). `calendar.events` is the writable scope
// that powers write-back; connections made before Phase 3 had only
// `calendar.readonly` and must reconnect to enable it (docs/GOOGLE-SETUP.md).
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

export type GoogleTokens = OAuthTokens;

function clientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error("Missing GOOGLE_CLIENT_ID. See docs/GOOGLE-SETUP.md.");
  return v;
}

function clientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error("Missing GOOGLE_CLIENT_SECRET. See docs/GOOGLE-SETUP.md.");
  return v;
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export function redirectUri(): string {
  return `${siteUrl().replace(/\/$/, "")}/api/calendars/google/callback`;
}

// The consent-screen URL. `state` carries our CSRF nonce; offline access +
// prompt=consent ensure a refresh token comes back (Google only returns one on
// the first consent unless prompt=consent is forced).
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

function expiresAtIso(expiresInSeconds: number): string {
  // Shave 60s so we refresh slightly early rather than racing expiry.
  return new Date(Date.now() + (expiresInSeconds - 60) * 1000).toISOString();
}

// Exchange the authorization code for tokens (initial connect).
export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: expiresAtIso(json.expires_in),
    scope: json.scope ?? null,
  };
}

// Mint a fresh access token from a stored refresh token (used by the worker).
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
    refresh_token?: string;
  };
  return {
    accessToken: json.access_token,
    // Google usually omits a new refresh token on refresh; keep the old one.
    refreshToken: json.refresh_token ?? null,
    expiresAt: expiresAtIso(json.expires_in),
    scope: json.scope ?? null,
  };
}

// The connected Google account's email, for provider_account / display_name.
export async function fetchAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { email?: string };
  return json.email ?? null;
}
