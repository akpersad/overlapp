import "server-only";

// Google Calendar API v3 — read the primary calendar's events and map them into
// our `events` shape. We request `singleEvents=true` so recurring events arrive
// pre-expanded as concrete instances (our `events` rows are concrete; RRULE
// handling is only for manual blocks). Incremental sync uses `syncToken`.

const EVENTS_ENDPOINT =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

// A Google event, narrowed to the fields we read.
export type GoogleEvent = {
  id: string;
  status?: string; // 'confirmed' | 'tentative' | 'cancelled'
  summary?: string;
  transparency?: string; // 'opaque' (busy, default) | 'transparent' (free)
  eventType?: string; // 'default' | 'outOfOffice' | 'focusTime' | 'workingLocation' | 'fromGmail'
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

// What sync.ts upserts. `override` is deliberately absent so an upsert never
// clobbers the user's per-event override (DATA-MODEL §6). `cancelled` rows are
// deletions to apply, not upserts.
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

// Pure mapping (unit-tested). Returns null for events we can't place on a
// timeline (no start/end). Busy-by-default: opaque transparency ⇒ busy, except
// working-location markers which are free. The Google eventType becomes our
// `category` so per-category overrides ("all my focusTime is free") work.
export function mapGoogleEvent(g: GoogleEvent): MappedEvent | null {
  if (g.status === "cancelled") {
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

  const isAllDay = Boolean(g.start?.date);
  const startRaw = g.start?.dateTime ?? g.start?.date;
  const endRaw = g.end?.dateTime ?? g.end?.date;
  if (!startRaw || !endRaw) return null;

  // All-day date strings ('YYYY-MM-DD') → UTC midnight bounds. Google's end.date
  // is exclusive (day after), which is the interval end we want.
  const startsAt = isAllDay ? `${startRaw}T00:00:00Z` : startRaw;
  const endsAt = isAllDay ? `${endRaw}T00:00:00Z` : endRaw;
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return null;

  const eventType = g.eventType ?? "default";
  let providerBusy = g.transparency !== "transparent";
  if (eventType === "workingLocation") providerBusy = false;

  return {
    provider_event_id: g.id,
    title: g.summary ?? null,
    starts_at: new Date(startsAt).toISOString(),
    ends_at: new Date(endsAt).toISOString(),
    is_all_day: isAllDay,
    provider_busy: providerBusy,
    category: eventType,
    cancelled: false,
  };
}

export type FetchResult = {
  events: MappedEvent[];
  nextSyncToken: string | null;
  // True when Google returned 410 GONE — the sync token expired and the caller
  // must do a fresh full sync.
  syncTokenExpired: boolean;
};

// Pull events, following pagination to the end (Google only returns
// nextSyncToken on the final page). Incremental when `syncToken` is set; a full
// windowed pull otherwise.
export async function fetchCalendarEvents(
  accessToken: string,
  opts: { timeMin?: string; timeMax?: string; syncToken?: string | null },
): Promise<FetchResult> {
  const events: MappedEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const params = new URLSearchParams({ singleEvents: "true", maxResults: "250" });
    if (opts.syncToken) {
      params.set("syncToken", opts.syncToken);
    } else {
      if (opts.timeMin) params.set("timeMin", opts.timeMin);
      if (opts.timeMax) params.set("timeMax", opts.timeMax);
      params.set("orderBy", "startTime");
    }
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${EVENTS_ENDPOINT}?${params.toString()}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 410) {
      // Sync token expired — signal a full resync.
      return { events: [], nextSyncToken: null, syncTokenExpired: true };
    }
    if (!res.ok) {
      throw new Error(`Google events.list failed (${res.status}): ${await res.text()}`);
    }

    const json = (await res.json()) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
    };
    for (const item of json.items ?? []) {
      const mapped = mapGoogleEvent(item);
      if (mapped) events.push(mapped);
    }
    pageToken = json.nextPageToken;
    nextSyncToken = json.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken, syncTokenExpired: false };
}
