import { describe, expect, it } from "vitest";

import { buildAuthUrl, googleConfigured, redirectUri } from "@/lib/google/oauth";
import { mapGoogleEvent, type GoogleEvent } from "@/lib/google/calendar";

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
