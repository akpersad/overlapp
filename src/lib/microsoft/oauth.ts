import "server-only";

import type { OAuthTokens } from "@/lib/calendar/types";

// Microsoft identity platform (v2.0) OAuth — calendar connection (NOT login).
// The Google twin: the user is already signed in (email/password); this is a
// standalone authorization-code flow that grants Outlook calendar access and a
// refresh token (via the `offline_access` scope) so the server-side sync worker
// can pull events later (DATA-MODEL §9-C). Tokens are stored in calendar_secrets
// (service-role only), never sent to the browser.
//
// Requires MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET (see
// docs/MICROSOFT-SETUP.md) and an authorized redirect URI of
// `${NEXT_PUBLIC_SITE_URL}/api/calendars/microsoft/callback`. MICROSOFT_TENANT is
// optional (defaults to `common` = work + personal Microsoft accounts).

// CSRF state cookie name for the connect flow (shared by the action that starts
// the flow and the callback that finishes it). Distinct from Google's so the two
// flows never collide.
export const MS_OAUTH_STATE_COOKIE = "microsoft_oauth_state";

function tenant(): string {
  return process.env.MICROSOFT_TENANT || "common";
}

function authEndpoint(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`;
}

function tokenEndpoint(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`;
}

// Read calendar busy/free + write back locked events. `offline_access` is what
// yields a refresh token; `Calendars.ReadWrite` covers both the read sync and
// write-back; `User.Read` lets us fetch the account email for display.
export const MICROSOFT_SCOPES = [
  "openid",
  "email",
  "offline_access",
  "User.Read",
  "Calendars.ReadWrite",
];

function clientId(): string {
  const v = process.env.MICROSOFT_CLIENT_ID;
  if (!v) throw new Error("Missing MICROSOFT_CLIENT_ID. See docs/MICROSOFT-SETUP.md.");
  return v;
}

function clientSecret(): string {
  const v = process.env.MICROSOFT_CLIENT_SECRET;
  if (!v) throw new Error("Missing MICROSOFT_CLIENT_SECRET. See docs/MICROSOFT-SETUP.md.");
  return v;
}

// Microsoft Calendar is SHELVED from the MVP launch — the code is built and
// unit-tested (the Google twin), but it is not a launch surface. This hard flag
// keeps the entire MS connect path dormant: the Connect-Microsoft button, the
// `connectMicrosoft` action, and the OAuth callback all gate on
// microsoftConfigured(), so a single `false` here hides the whole feature
// REGARDLESS of whether MICROSOFT_* env vars are set. To bring it back
// post-launch, flip this to `true` (then env presence governs as usual).
const MICROSOFT_MVP_ENABLED = false;

export function microsoftConfigured(): boolean {
  return (
    MICROSOFT_MVP_ENABLED &&
    Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET)
  );
}

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export function redirectUri(): string {
  return `${siteUrl().replace(/\/$/, "")}/api/calendars/microsoft/callback`;
}

// The consent-screen URL. `state` carries our CSRF nonce; the offline_access
// scope ensures a refresh token comes back.
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    response_mode: "query",
    scope: MICROSOFT_SCOPES.join(" "),
    prompt: "consent",
    state,
  });
  return `${authEndpoint()}?${params.toString()}`;
}

function expiresAtIso(expiresInSeconds: number): string {
  // Shave 60s so we refresh slightly early rather than racing expiry.
  return new Date(Date.now() + (expiresInSeconds - 60) * 1000).toISOString();
}

// Exchange the authorization code for tokens (initial connect).
export async function exchangeCode(code: string): Promise<OAuthTokens> {
  const res = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      scope: MICROSOFT_SCOPES.join(" "),
    }),
  });
  if (!res.ok) {
    throw new Error(`Microsoft token exchange failed (${res.status}): ${await res.text()}`);
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
// Microsoft rotates the refresh token, so a new one usually comes back.
export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const res = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
      scope: MICROSOFT_SCOPES.join(" "),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    // invalid_grant = the refresh token was revoked/expired (or consent lapsed).
    // Surface it as reauth_required so the worker marks the calendar "reconnect
    // needed" with a friendly message instead of leaking the raw error JSON.
    if (res.status === 400 && body.includes("invalid_grant")) {
      throw new Error("reauth_required");
    }
    throw new Error(`Microsoft token refresh failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
    refresh_token?: string;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: expiresAtIso(json.expires_in),
    scope: json.scope ?? null,
  };
}

// The connected account's email, for provider_account / display_name (via the
// Microsoft Graph /me endpoint; needs the User.Read scope).
export async function fetchAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(
    "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName",
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { mail?: string; userPrincipalName?: string };
  return json.mail ?? json.userPrincipalName ?? null;
}
