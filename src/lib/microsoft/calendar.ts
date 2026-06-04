import "server-only";

import type {
  FetchOpts,
  FetchResult,
  InsertEventInput,
  MappedEvent,
} from "@/lib/calendar/types";

// Microsoft Graph (v1.0) — read the user's calendar via the `calendarView/delta`
// query and map events into our `events` shape. calendarView pre-expands
// recurring series into concrete instances (the analog of Google's
// `singleEvents=true`); the delta query returns an `@odata.deltaLink` cursor (the
// analog of Google's syncToken) for incremental pulls. We request the `Prefer:
// outlook.timezone="UTC"` header so every dateTime comes back in UTC.

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const CALENDAR_VIEW = `${GRAPH_BASE}/me/calendarView`;
const EVENTS_ENDPOINT = `${GRAPH_BASE}/me/events`;
const UTC_PREFER = 'outlook.timezone="UTC"';

// A Graph event, narrowed to the fields we read. In a delta response a deleted
// event arrives as `{ id, "@removed": {...} }` with no other fields.
export type GraphEvent = {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  // free | tentative | busy | oof | workingElsewhere | unknown
  showAs?: string;
  type?: string; // singleInstance | occurrence | exception | seriesMaster
  categories?: string[];
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  "@removed"?: { reason?: string };
};

// showAs states we treat as free. Everything else (busy, tentative, oof,
// unknown) is busy — busy-by-default, mirroring Google's opaque-is-busy rule
// (where only working-location markers are free).
const FREE_SHOWAS = new Set(["free", "workingElsewhere"]);

// Graph returns naive dateTimes (no offset) expressed in the Prefer timezone
// (UTC), e.g. "2026-07-01T10:00:00.0000000". Append a Z so Date parses it as UTC.
function toIso(naive: string): string {
  const s = naive.endsWith("Z") ? naive : `${naive}Z`;
  return new Date(s).toISOString();
}

// Pure mapping (unit-tested). Returns null for events we can't place on a
// timeline (no start/end). Removed/cancelled events become deletions. The first
// Outlook category (if any) becomes our `category` so per-category overrides
// ("all my 'Personal' events are free") work.
export function mapMicrosoftEvent(g: GraphEvent): MappedEvent | null {
  if (g["@removed"] || g.isCancelled) {
    return {
      provider_event_id: g.id,
      title: null,
      starts_at: "",
      ends_at: "",
      is_all_day: false,
      provider_busy: false,
      category: null,
      cancelled: true,
    };
  }

  const startRaw = g.start?.dateTime;
  const endRaw = g.end?.dateTime;
  if (!startRaw || !endRaw) return null;

  const startsAt = toIso(startRaw);
  const endsAt = toIso(endRaw);
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return null;

  const showAs = g.showAs ?? "busy";
  const category = g.categories && g.categories.length > 0 ? g.categories[0] : null;

  return {
    provider_event_id: g.id,
    title: g.subject ?? null,
    starts_at: startsAt,
    ends_at: endsAt,
    is_all_day: Boolean(g.isAllDay),
    provider_busy: !FREE_SHOWAS.has(showAs),
    category,
    cancelled: false,
  };
}

// Insert an event into the user's default calendar (Phase 3 write-back). Returns
// the provider event id. Graph wants a naive wall-clock dateTime + a separate
// timeZone field, so we send the UTC instant (timeZone "UTC") — unambiguous and
// correct regardless of the proposal's pinned_tz, which only affects display.
// Throws "insufficient_scope" on 403 so the caller can prompt a reconnect.
export async function insertCalendarEvent(
  accessToken: string,
  ev: InsertEventInput,
): Promise<string> {
  // "2026-07-01T10:00:00.000Z" → "2026-07-01T10:00:00.000" (+ timeZone UTC).
  const utcWallClock = (iso: string) => new Date(iso).toISOString().slice(0, -1);

  const res = await fetch(EVENTS_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      subject: ev.summary,
      body: ev.description
        ? { contentType: "text", content: ev.description }
        : undefined,
      start: { dateTime: utcWallClock(ev.startsAt), timeZone: "UTC" },
      end: { dateTime: utcWallClock(ev.endsAt), timeZone: "UTC" },
    }),
  });

  if (res.status === 403) throw new Error("insufficient_scope");
  if (!res.ok) {
    throw new Error(`Microsoft events.create failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("Microsoft events.create returned no id");
  return json.id;
}

// Pull events via the delta query, following `@odata.nextLink` pagination to the
// end (Graph only returns the `@odata.deltaLink` cursor on the final page).
// Incremental when `syncToken` (a prior deltaLink) is set; a full windowed pull
// otherwise. A 410 GONE means the delta cursor expired → signal a full resync.
export async function fetchCalendarEvents(
  accessToken: string,
  opts: FetchOpts,
): Promise<FetchResult> {
  const events: MappedEvent[] = [];
  let nextSyncToken: string | null = null;

  let url: string;
  if (opts.syncToken) {
    // The stored deltaLink already encodes the window + cursor — fetch it as-is.
    url = opts.syncToken;
  } else {
    const params = new URLSearchParams();
    if (opts.timeMin) params.set("startDateTime", opts.timeMin);
    if (opts.timeMax) params.set("endDateTime", opts.timeMax);
    url = `${CALENDAR_VIEW}/delta?${params.toString()}`;
  }

  while (url) {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}`, Prefer: UTC_PREFER },
    });

    if (res.status === 410) {
      // Delta cursor expired — signal a full resync.
      return { events: [], nextSyncToken: null, syncTokenExpired: true };
    }
    if (!res.ok) {
      throw new Error(
        `Microsoft calendarView/delta failed (${res.status}): ${await res.text()}`,
      );
    }

    const json = (await res.json()) as {
      value?: GraphEvent[];
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    };
    for (const item of json.value ?? []) {
      const mapped = mapMicrosoftEvent(item);
      if (mapped) events.push(mapped);
    }

    const next = json["@odata.nextLink"];
    if (next) {
      url = next;
    } else {
      nextSyncToken = json["@odata.deltaLink"] ?? null;
      url = "";
    }
  }

  return { events, nextSyncToken, syncTokenExpired: false };
}
