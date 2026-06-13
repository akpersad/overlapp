import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { googleAdapter } from "@/lib/google/adapter";
import { microsoftAdapter } from "@/lib/microsoft/adapter";
import type {
  CalendarAdapter,
  MappedEvent,
  OAuthTokens,
  SyncableProvider,
} from "./types";

type Admin = SupabaseClient<Database>;

// Provider-agnostic calendar-sync orchestrator. The per-provider seams (OAuth,
// event mapping, REST) live in {google,microsoft}/adapter.ts; everything
// stateful (DB, token persistence, idempotency, the rolling window) is here, so
// Google and Microsoft share one battle-tested sync path.

const ADAPTERS: Record<SyncableProvider, CalendarAdapter> = {
  google: googleAdapter,
  microsoft: microsoftAdapter,
};

// Resolve a syncable adapter, or null for a provider we don't sync yet
// (apple_caldav / ics).
function adapterFor(provider: string): CalendarAdapter | null {
  return (ADAPTERS as Record<string, CalendarAdapter | undefined>)[provider] ?? null;
}

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

// Persist a freshly-authorized connection: the calendar row (metadata) + its
// secret tokens. Returns the calendar id. Run with the service role.
export async function saveConnection(
  admin: Admin,
  userId: string,
  provider: SyncableProvider,
  tokens: OAuthTokens,
): Promise<string> {
  const adapter = ADAPTERS[provider];
  const email = await adapter.fetchAccountEmail(tokens.accessToken);
  const providerAccount = email ?? "primary";

  const { data: calendar, error: calErr } = await admin
    .from("calendars")
    .upsert(
      {
        user_id: userId,
        provider,
        provider_account: providerAccount,
        display_name: email ? `${adapter.label} (${email})` : `${adapter.label} Calendar`,
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
  adapter: CalendarAdapter,
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
  const refreshed = await adapter.refreshAccessToken(secret.refresh_token);
  await admin
    .from("calendar_secrets")
    .update({
      access_token: refreshed.accessToken,
      token_expires_at: refreshed.expiresAt,
      // Google rarely re-issues a refresh token; Microsoft rotates it. Keep the
      // existing one only if the provider didn't return a new one.
      refresh_token: refreshed.refreshToken ?? secret.refresh_token,
      scope: refreshed.scope ?? undefined,
    })
    .eq("calendar_id", calendarId);
  return refreshed.accessToken;
}

// Apply a fetched batch: delete cancelled events, upsert the rest (WITHOUT the
// override column so a user's per-event override survives), and — on a full
// sync — prune rows in the window the provider no longer returns.
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
    // Remove events in-window the provider no longer lists (deleted upstream).
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
// the UI can show progress/errors. Used by the connect callbacks, "Sync now",
// and the background cron.
export async function syncCalendar(calendarId: string): Promise<SyncResult> {
  const admin = createAdminClient();

  const { data: calendar, error: calErr } = await admin
    .from("calendars")
    .select("id, user_id, provider, sync_cursor")
    .eq("id", calendarId)
    .single();
  if (calErr || !calendar) return { ok: false, error: "calendar_not_found" };

  const adapter = adapterFor(calendar.provider);
  if (!adapter) return { ok: false, error: "unsupported_provider" };

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
    const accessToken = await ensureAccessToken(admin, adapter, calendarId, secret);
    const window = windowBounds();

    let fullSync = !calendar.sync_cursor;
    let result = await adapter.fetchCalendarEvents(accessToken, {
      timeMin: window.timeMin,
      timeMax: window.timeMax,
      syncToken: calendar.sync_cursor,
    });

    // Stale sync token → start over with a full windowed pull.
    if (result.syncTokenExpired) {
      fullSync = true;
      result = await adapter.fetchCalendarEvents(accessToken, {
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

// ----------------------------------------------------------------------------
// Write-back (Phase 3). When a proposal is locked, push the chosen slot into the
// real calendar of every active member who opted in (calendars.writeback_enabled
// + a writable, syncable connection). Idempotent via the event_writebacks
// ledger, best-effort per member (one member's failure never blocks the rest).
// Run with the service role from the lockProposal Server Action.
// ----------------------------------------------------------------------------
export type WritebackResult = {
  written: number;
  skipped: number;
  failed: number;
};

export async function writeBackProposal(
  proposalId: string,
): Promise<WritebackResult> {
  const admin = createAdminClient();
  const result: WritebackResult = { written: 0, skipped: 0, failed: 0 };

  const { data: proposal } = await admin
    .from("proposals")
    .select("id, group_id, title, description, status, final_option, pinned_tz")
    .eq("id", proposalId)
    .maybeSingle();
  if (!proposal || proposal.status !== "locked" || !proposal.final_option) {
    return result;
  }

  const { data: option } = await admin
    .from("proposal_options")
    .select("starts_at, ends_at")
    .eq("id", proposal.final_option)
    .maybeSingle();
  if (!option) return result;

  const { data: members } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", proposal.group_id)
    .eq("status", "active");

  for (const member of members ?? []) {
    // Skip if we've already pushed this proposal to this member.
    const { data: already } = await admin
      .from("event_writebacks")
      .select("proposal_id")
      .eq("proposal_id", proposalId)
      .eq("user_id", member.user_id)
      .maybeSingle();
    if (already) {
      result.skipped++;
      continue;
    }

    // A writable, non-revoked syncable calendar the member opted in for.
    const { data: calendar } = await admin
      .from("calendars")
      .select("id, provider")
      .eq("user_id", member.user_id)
      .in("provider", Object.keys(ADAPTERS) as SyncableProvider[])
      .eq("writeback_enabled", true)
      .neq("sync_state", "revoked")
      .limit(1)
      .maybeSingle();
    if (!calendar) {
      result.skipped++;
      continue;
    }

    const adapter = adapterFor(calendar.provider);
    if (!adapter) {
      result.skipped++;
      continue;
    }

    const { data: secret } = await admin
      .from("calendar_secrets")
      .select("access_token, refresh_token, token_expires_at")
      .eq("calendar_id", calendar.id)
      .maybeSingle();
    if (!secret) {
      result.skipped++;
      continue;
    }

    try {
      const accessToken = await ensureAccessToken(admin, adapter, calendar.id, secret);
      const providerEventId = await adapter.insertCalendarEvent(accessToken, {
        summary: proposal.title,
        description: proposal.description,
        startsAt: option.starts_at,
        endsAt: option.ends_at,
        timeZone: proposal.pinned_tz,
      });
      await admin.from("event_writebacks").insert({
        proposal_id: proposalId,
        user_id: member.user_id,
        calendar_id: calendar.id,
        provider_event_id: providerEventId,
      });
      result.written++;
    } catch (err) {
      result.failed++;
      const message = err instanceof Error ? err.message : String(err);
      // A reauth/scope failure means the connection is dead — flip sync_state so
      // the UI shows "Reconnect needed" + the Reconnect button right away rather
      // than waiting for the next scheduled sync to discover it.
      const needsReconnect =
        message === "reauth_required" || message === "insufficient_scope";
      const note =
        message === "insufficient_scope"
          ? "Reconnect to enable write-back (calendar write permission)."
          : message === "reauth_required"
            ? "Authorization expired — reconnect."
            : `Write-back failed: ${message}`;
      await admin
        .from("calendars")
        .update({
          last_error: note,
          ...(needsReconnect ? { sync_state: "revoked" as const } : {}),
        })
        .eq("id", calendar.id);
    }
  }

  return result;
}

// ----------------------------------------------------------------------------
// Undo write-back (proposal unlock). For every event we pushed for this
// proposal (the event_writebacks ledger), delete it from the member's real
// calendar, then clear the ledger row so a future re-lock pushes a fresh event.
// Best-effort per member: a delete failure (token expired, event manually
// removed) never blocks the unlock, but the ledger row is only cleared once the
// remote delete is confirmed (or the event is already gone) so we don't orphan
// a real calendar event. Run with the service role from the Server Action.
// ----------------------------------------------------------------------------
export async function removeProposalWriteback(
  proposalId: string,
): Promise<{ removed: number; failed: number }> {
  const admin = createAdminClient();
  const result = { removed: 0, failed: 0 };

  const { data: ledger } = await admin
    .from("event_writebacks")
    .select("user_id, calendar_id, provider_event_id")
    .eq("proposal_id", proposalId);

  for (const entry of ledger ?? []) {
    const { data: calendar } = await admin
      .from("calendars")
      .select("id, provider")
      .eq("id", entry.calendar_id)
      .maybeSingle();
    const adapter = calendar ? adapterFor(calendar.provider) : null;

    // Calendar gone (disconnected) or unsupported — the event went with it (or
    // we can't address it). Clear the ledger row and move on.
    if (!calendar || !adapter) {
      await admin
        .from("event_writebacks")
        .delete()
        .eq("proposal_id", proposalId)
        .eq("user_id", entry.user_id);
      result.removed++;
      continue;
    }

    const { data: secret } = await admin
      .from("calendar_secrets")
      .select("access_token, refresh_token, token_expires_at")
      .eq("calendar_id", calendar.id)
      .maybeSingle();
    if (!secret) {
      result.failed++;
      continue;
    }

    try {
      const accessToken = await ensureAccessToken(admin, adapter, calendar.id, secret);
      await adapter.deleteCalendarEvent(accessToken, entry.provider_event_id);
      await admin
        .from("event_writebacks")
        .delete()
        .eq("proposal_id", proposalId)
        .eq("user_id", entry.user_id);
      result.removed++;
    } catch {
      // Leave the ledger row so a later unlock/sync can retry the delete.
      result.failed++;
    }
  }

  return result;
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
