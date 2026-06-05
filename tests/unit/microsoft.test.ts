import { describe, expect, it } from "vitest";

import {
  buildAuthUrl,
  microsoftConfigured,
  redirectUri,
} from "@/lib/microsoft/oauth";
import { mapMicrosoftEvent, type GraphEvent } from "@/lib/microsoft/calendar";

describe("microsoft oauth url", () => {
  it("reports configured when client id + secret are present", () => {
    expect(microsoftConfigured()).toBe(true);
  });

  it("derives the redirect URI from the site URL", () => {
    expect(redirectUri()).toBe(
      "https://overlapp.test/api/calendars/microsoft/callback",
    );
  });

  it("builds a consent URL with offline_access + the state nonce", () => {
    const url = new URL(buildAuthUrl("nonce-456"));
    expect(url.origin + url.pathname).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
    const p = url.searchParams;
    expect(p.get("client_id")).toBe("test-ms-client-id");
    expect(p.get("response_type")).toBe("code");
    expect(p.get("prompt")).toBe("consent");
    expect(p.get("state")).toBe("nonce-456");
    expect(p.get("redirect_uri")).toBe(redirectUri());
    // offline_access is what yields a refresh token; Calendars.ReadWrite grants
    // both read sync + write-back.
    expect(p.get("scope")).toContain("offline_access");
    expect(p.get("scope")).toContain("Calendars.ReadWrite");
  });
});

describe("mapMicrosoftEvent", () => {
  const base: GraphEvent = {
    id: "evt-1",
    subject: "Standup",
    showAs: "busy",
    start: { dateTime: "2026-07-01T10:00:00.0000000", timeZone: "UTC" },
    end: { dateTime: "2026-07-01T10:30:00.0000000", timeZone: "UTC" },
  };

  it("maps a busy event as busy by default and normalizes the UTC time", () => {
    const m = mapMicrosoftEvent(base)!;
    expect(m).toMatchObject({
      provider_event_id: "evt-1",
      title: "Standup",
      starts_at: "2026-07-01T10:00:00.000Z",
      ends_at: "2026-07-01T10:30:00.000Z",
      is_all_day: false,
      provider_busy: true,
      category: null,
      cancelled: false,
    });
  });

  it("treats showAs=free as free", () => {
    const m = mapMicrosoftEvent({ ...base, showAs: "free" })!;
    expect(m.provider_busy).toBe(false);
  });

  it("treats workingElsewhere as free", () => {
    const m = mapMicrosoftEvent({ ...base, showAs: "workingElsewhere" })!;
    expect(m.provider_busy).toBe(false);
  });

  it("treats tentative / oof as busy", () => {
    expect(mapMicrosoftEvent({ ...base, showAs: "tentative" })!.provider_busy).toBe(true);
    expect(mapMicrosoftEvent({ ...base, showAs: "oof" })!.provider_busy).toBe(true);
  });

  it("carries the first Outlook category through for overrides", () => {
    const m = mapMicrosoftEvent({ ...base, categories: ["Personal", "Red"] })!;
    expect(m.category).toBe("Personal");
  });

  it("handles all-day events", () => {
    const m = mapMicrosoftEvent({
      id: "evt-allday",
      subject: "Vacation",
      isAllDay: true,
      showAs: "oof",
      start: { dateTime: "2026-07-01T00:00:00.0000000", timeZone: "UTC" },
      end: { dateTime: "2026-07-02T00:00:00.0000000", timeZone: "UTC" },
    })!;
    expect(m.is_all_day).toBe(true);
    expect(m.starts_at).toBe("2026-07-01T00:00:00.000Z");
    expect(m.ends_at).toBe("2026-07-02T00:00:00.000Z");
  });

  it("flags @removed delta entries as deletions", () => {
    const m = mapMicrosoftEvent({ id: "gone", "@removed": { reason: "deleted" } })!;
    expect(m.cancelled).toBe(true);
    expect(m.provider_event_id).toBe("gone");
  });

  it("flags isCancelled events as deletions", () => {
    const m = mapMicrosoftEvent({ ...base, isCancelled: true })!;
    expect(m.cancelled).toBe(true);
  });

  it("drops events without a start/end", () => {
    expect(mapMicrosoftEvent({ id: "x", subject: "no times" })).toBeNull();
  });

  it("drops zero/negative-length events", () => {
    expect(
      mapMicrosoftEvent({
        id: "z",
        start: { dateTime: "2026-07-01T10:00:00.0000000" },
        end: { dateTime: "2026-07-01T10:00:00.0000000" },
      }),
    ).toBeNull();
  });
});
