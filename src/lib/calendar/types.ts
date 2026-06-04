import "server-only";

// Shared calendar-sync types + the provider adapter contract. Google and
// Microsoft are architectural twins: identical orchestration (token refresh,
// windowed/incremental pull, busy-by-default upsert without clobbering the
// user's override, write-back) over provider-specific OAuth + REST shapes. The
// orchestrator (calendar/sync.ts) is provider-agnostic; each provider supplies
// a CalendarAdapter (google/adapter.ts, microsoft/adapter.ts).

// Providers we can actively sync + write back to. The DB `calendar_provider`
// enum also has `apple_caldav` / `ics`, which aren't wired yet.
export type SyncableProvider = "google" | "microsoft";

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string; // ISO timestamptz
  scope: string | null;
};

// A provider event mapped into our `events` shape. `override` is deliberately
// absent so an upsert never clobbers the user's per-event override
// (DATA-MODEL §6). `cancelled` rows are deletions to apply, not upserts.
export type MappedEvent = {
  provider_event_id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  provider_busy: boolean;
  category: string | null;
  cancelled: boolean;
};

export type FetchOpts = {
  timeMin?: string;
  timeMax?: string;
  // The provider's incremental cursor (Google syncToken / Microsoft deltaLink),
  // stored in `calendars.sync_cursor`. Null/absent ⇒ a full windowed pull.
  syncToken?: string | null;
};

export type FetchResult = {
  events: MappedEvent[];
  nextSyncToken: string | null;
  // True when the provider signalled the incremental cursor expired (HTTP 410)
  // — the caller must redo a fresh full sync.
  syncTokenExpired: boolean;
};

export type InsertEventInput = {
  summary: string;
  description?: string | null;
  startsAt: string; // ISO
  endsAt: string; // ISO
  timeZone?: string | null;
};

// The per-provider seam. Everything stateful (DB, token persistence, idempotency)
// lives in the orchestrator; an adapter is pure provider I/O.
export type CalendarAdapter = {
  provider: SyncableProvider;
  // Human label for display_name ("Google", "Microsoft").
  label: string;
  // Mint a fresh access token from a stored refresh token.
  refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;
  // The connected account's email, for provider_account / display_name.
  fetchAccountEmail(accessToken: string): Promise<string | null>;
  // Pull events (incremental when opts.syncToken is set, full otherwise).
  fetchCalendarEvents(accessToken: string, opts: FetchOpts): Promise<FetchResult>;
  // Insert an event (write-back). Returns the provider event id. Throws
  // "insufficient_scope" on 403 so the caller can prompt a reconnect.
  insertCalendarEvent(accessToken: string, ev: InsertEventInput): Promise<string>;
};
