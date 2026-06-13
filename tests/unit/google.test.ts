import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildAuthUrl,
  googleConfigured,
  redirectUri,
  refreshAccessToken,
} from "@/lib/google/oauth";
import {
  deleteCalendarEvent,
  mapGoogleEvent,
  type GoogleEvent,
} from "@/lib/google/calendar";

function mockFetch(status: number, body = "") {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(body, { status }));
}

describe("google oauth url", () => {
  it("reports configured when client id + secret are present", () => {
    expect(googleConfigured()).toBe(true);
  });

  it("derives the redirect URI from the site URL", () => {
    expect(redirectUri()).toBe("https://overlapp.test/api/calendars/google/callback");
  });

  it("builds a consent URL with offline access + the state nonce", () => {
    const url = new URL(buildAuthUrl("nonce-123"));
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    const p = url.searchParams;
    expect(p.get("client_id")).toBe("test-client-id.apps.googleusercontent.com");
    expect(p.get("response_type")).toBe("code");
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("consent");
    expect(p.get("state")).toBe("nonce-123");
    expect(p.get("redirect_uri")).toBe(redirectUri());
    expect(p.get("scope")).toContain("calendar.readonly");
  });
});

describe("mapGoogleEvent", () => {
  const base: GoogleEvent = {
    id: "evt-1",
    summary: "Standup",
    start: { dateTime: "2026-07-01T10:00:00Z" },
    end: { dateTime: "2026-07-01T10:30:00Z" },
  };

  it("maps a timed, opaque event as busy by default", () => {
    const m = mapGoogleEvent(base)!;
    expect(m).toMatchObject({
      provider_event_id: "evt-1",
      title: "Standup",
      starts_at: "2026-07-01T10:00:00.000Z",
      ends_at: "2026-07-01T10:30:00.000Z",
      is_all_day: false,
      provider_busy: true,
      category: "default",
      cancelled: false,
    });
  });

  it("treats transparent events as free", () => {
    const m = mapGoogleEvent({ ...base, transparency: "transparent" })!;
    expect(m.provider_busy).toBe(false);
  });

  it("treats working-location events as free and tags the category", () => {
    const m = mapGoogleEvent({ ...base, eventType: "workingLocation" })!;
    expect(m.provider_busy).toBe(false);
    expect(m.category).toBe("workingLocation");
  });

  it("carries the eventType through as the category for overrides", () => {
    const m = mapGoogleEvent({ ...base, eventType: "focusTime" })!;
    expect(m.category).toBe("focusTime");
    expect(m.provider_busy).toBe(true);
  });

  it("handles all-day events as UTC-midnight day spans", () => {
    const m = mapGoogleEvent({
      id: "evt-allday",
      summary: "Vacation",
      start: { date: "2026-07-01" },
      end: { date: "2026-07-02" },
    })!;
    expect(m.is_all_day).toBe(true);
    expect(m.starts_at).toBe("2026-07-01T00:00:00.000Z");
    expect(m.ends_at).toBe("2026-07-02T00:00:00.000Z");
  });

  it("flags cancelled events as deletions", () => {
    const m = mapGoogleEvent({ id: "gone", status: "cancelled" })!;
    expect(m.cancelled).toBe(true);
    expect(m.provider_event_id).toBe("gone");
  });

  it("drops events without a start/end", () => {
    expect(mapGoogleEvent({ id: "x", summary: "no times" })).toBeNull();
  });

  it("drops zero/negative-length events", () => {
    expect(
      mapGoogleEvent({
        id: "z",
        start: { dateTime: "2026-07-01T10:00:00Z" },
        end: { dateTime: "2026-07-01T10:00:00Z" },
      }),
    ).toBeNull();
  });
});

describe("refreshAccessToken — expired/revoked grant", () => {
  afterEach(() => vi.restoreAllMocks());

  it("maps invalid_grant (400) to reauth_required, not the raw JSON", async () => {
    mockFetch(
      400,
      JSON.stringify({
        error: "invalid_grant",
        error_description: "Token has been expired or revoked.",
      }),
    );
    await expect(refreshAccessToken("dead-token")).rejects.toThrow(
      "reauth_required",
    );
  });

  it("surfaces other refresh failures with their status", async () => {
    mockFetch(500, "boom");
    await expect(refreshAccessToken("tok")).rejects.toThrow(
      /Google token refresh failed \(500\)/,
    );
  });
});

describe("deleteCalendarEvent — idempotent unlock", () => {
  afterEach(() => vi.restoreAllMocks());

  it("treats an already-gone event (404) as success", async () => {
    mockFetch(404);
    await expect(deleteCalendarEvent("tok", "evt")).resolves.toBeUndefined();
  });

  it("succeeds on 200", async () => {
    mockFetch(200);
    await expect(deleteCalendarEvent("tok", "evt")).resolves.toBeUndefined();
  });

  it("maps 403 to insufficient_scope", async () => {
    mockFetch(403);
    await expect(deleteCalendarEvent("tok", "evt")).rejects.toThrow(
      "insufficient_scope",
    );
  });
});
