import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAccountEmail, refreshAccessToken, type GoogleTokens } from "./oauth";
import { fetchCalendarEvents, type MappedEvent } from "./calendar";

type Admin = SupabaseClient<Database>;

// Rolling sync window. We don't care about the distant past, and the heatmap
// only looks a few weeks ahead, so a small window keeps pulls cheap.
const PAST_DAYS = 1;
const FUTURE_DAYS = 60;

export type SyncResult = {
  ok: boolean;
  eventCount?: number;
  error?: string;
};

function windowBounds(): { timeMin: string; timeMax: string } {
  const now = Date.now();
  return {
    timeMin: new Date(now - PAST_DAYS * 86_400_000).toISOString(),
    timeMax: new Date(now + FUTURE_DAYS * 86_400_000).toISOString(),
  };
}

// Persist a freshly-authorized Google connection: the calendar row (metadata)
// + its secret tokens. Returns the calendar id. Run with the service role.
export async function saveGoogleConnection(
  admin: Admin,
  userId: string,
  tokens: GoogleTokens,
): Promise<string> {
  const email = await fetchAccountEmail(tokens.accessToken);
  const providerAccount = email ?? "primary";

  const { data: calendar, error: calErr } = await admin
    .from("calendars")
    .upsert(
      {
        user_id: userId,
        provider: "google",
        provider_account: providerAccount,
        display_name: email ? `Google (${email})` : "Google Calendar",
        sync_state: "ok",
        sync_cursor: null, // force a full sync on first pull
        last_error: null,
      },
      { onConflict: "user_id,provider,provider_account" },
    )
    .select("id")
    .single();
  if (calErr) throw new Error(calErr.message);

  const { error: secErr } = await admin.from("calendar_secrets").upsert({
    calendar_id: calendar.id,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    token_expires_at: tokens.expiresAt,
    scope: tokens.scope,
  });
  if (secErr) throw new Error(secErr.message);

  return calendar.id;
}

// Ensure a non-expired access token, refreshing (and persisting) if needed.
async function ensureAccessToken(
  admin: Admin,
  calendarId: string,
  secret: {
    access_token: string;
    refresh_token: string | null;
    token_expires_at: string | null;
  },
): Promise<string> {
  const expired =
    !secret.token_expires_at ||
    new Date(secret.token_expires_at).getTime() <= Date.now();
  if (!expired) return secret.access_token;

  if (!secret.refresh_token) {
    throw new Error("reauth_required");
  }
  const refreshed = await refreshAccessToken(secret.refresh_token);
  await admin
    .from("calendar_secrets")
    .update({
      access_token: refreshed.accessToken,
      token_expires_at: refreshed.expiresAt,
      // Google rarely re-issues a refresh token; keep the existing one if not.
      refresh_token: refreshed.refreshToken ?? secret.refresh_token,
      scope: refreshed.scope ?? undefined,
    })
    .eq("calendar_id", calendarId);
  return refreshed.accessToken;
}

// Apply a fetched batch: delete cancelled events, upsert the rest (WITHOUT the
// override column so a user's per-event override survives), and — on a full
// sync — prune rows in the window that Google no longer returns.
async function applyEvents(
  admin: Admin,
  userId: string,
  calendarId: string,
  events: MappedEvent[],
  fullSync: boolean,
  window: { timeMin: string; timeMax: string },
): Promise<number> {
  const cancelled = events.filter((e) => e.cancelled).map((e) => e.provider_event_id);
  const live = events.filter((e) => !e.cancelled);

  if (cancelled.length > 0) {
    await admin
      .from("events")
      .delete()
      .eq("calendar_id", calendarId)
      .in("provider_event_id", cancelled);
  }

  if (live.length > 0) {
    const rows = live.map((e) => ({
      user_id: userId,
      calendar_id: calendarId,
      provider_event_id: e.provider_event_id,
      title: e.title,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      is_all_day: e.is_all_day,
      provider_busy: e.provider_busy,
      category: e.category,
      // NB: no `override` — upsert must not clobber the user's choice.
    }));
    const { error } = await admin
      .from("events")
      .upsert(rows, { onConflict: "calendar_id,provider_event_id" });
    if (error) throw new Error(error.message);
  }

  if (fullSync) {
    // Remove events in-window that Google no longer lists (deleted upstream).
    const keep = live.map((e) => e.provider_event_id);
    let prune = admin
      .from("events")
      .delete()
      .eq("calendar_id", calendarId)
      .gte("starts_at", window.timeMin)
      .lt("starts_at", window.timeMax);
    if (keep.length > 0) {
      prune = prune.not(
        "provider_event_id",
        "in",
        `(${keep.map((id) => `"${id}"`).join(",")})`,
      );
    }
    await prune;
  }

  return live.length;
}

// Sync one calendar end-to-end. Idempotent. Marks sync_state along the way so
// the UI can show progress/errors. Used by the connect callback, "Sync now",
// and the background cron.
export async function syncCalendar(calendarId: string): Promise<SyncResult> {
  const admin = createAdminClient();

  const { data: calendar, error: calErr } = await admin
    .from("calendars")
    .select("id, user_id, provider, sync_cursor")
    .eq("id", calendarId)
    .single();
  if (calErr || !calendar) return { ok: false, error: "calendar_not_found" };
  if (calendar.provider !== "google") return { ok: false, error: "unsupported_provider" };

  const { data: secret, error: secErr } = await admin
    .from("calendar_secrets")
    .select("access_token, refresh_token, token_expires_at")
    .eq("calendar_id", calendarId)
    .single();
  if (secErr || !secret) {
    await admin
      .from("calendars")
      .update({ sync_state: "revoked", last_error: "Missing tokens — reconnect." })
      .eq("id", calendarId);
    return { ok: false, error: "no_tokens" };
  }

  await admin.from("calendars").update({ sync_state: "syncing" }).eq("id", calendarId);

  try {
    const accessToken = await ensureAccessToken(admin, calendarId, secret);
    const window = windowBounds();

    let fullSync = !calendar.sync_cursor;
    let result = await fetchCalendarEvents(accessToken, {
      timeMin: window.timeMin,
      timeMax: window.timeMax,
      syncToken: calendar.sync_cursor,
    });

    // Stale sync token → start over with a full windowed pull.
    if (result.syncTokenExpired) {
      fullSync = true;
      result = await fetchCalendarEvents(accessToken, {
        timeMin: window.timeMin,
        timeMax: window.timeMax,
        syncToken: null,
      });
    }

    const count = await applyEvents(
      admin,
      calendar.user_id,
      calendarId,
      result.events,
      fullSync,
      window,
    );

    await admin
      .from("calendars")
      .update({
        sync_state: "ok",
        sync_cursor: result.nextSyncToken ?? calendar.sync_cursor,
        last_synced_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", calendarId);

    return { ok: true, eventCount: count };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const revoked = message === "reauth_required";
    await admin
      .from("calendars")
      .update({
        sync_state: revoked ? "revoked" : "error",
        last_error: revoked ? "Authorization expired — reconnect." : message,
      })
      .eq("id", calendarId);
    return { ok: false, error: message };
  }
}

// Sync every calendar that's due — used by the background cron. "Due" = not
// currently syncing and either never synced or last synced > `staleMinutes` ago.
export async function syncDueCalendars(staleMinutes = 30): Promise<{
  synced: number;
  results: { calendarId: string; result: SyncResult }[];
}> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();

  const { data: due } = await admin
    .from("calendars")
    .select("id, last_synced_at, sync_state")
    .neq("sync_state", "revoked")
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`);

  const results: { calendarId: string; result: SyncResult }[] = [];
  for (const cal of due ?? []) {
    results.push({ calendarId: cal.id, result: await syncCalendar(cal.id) });
  }
  return { synced: results.length, results };
}
