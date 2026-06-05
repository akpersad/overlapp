import { beforeEach, describe, expect, it } from "vitest";

import {
  createGroup,
  newUserClient,
  resetData,
  serviceClient,
  type TestUser,
} from "./_helpers";

// The sync worker runs as the service role, so test setup mirrors that: insert
// calendars / secrets / events via the service client, then assert what each
// signed-in user can (and cannot) see through RLS + the availability RPCs.

let pidCounter = 0;

async function addCalendar(
  userId: string,
  account = "primary",
  provider: "google" | "microsoft" = "google",
): Promise<string> {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("calendars")
    .insert({
      user_id: userId,
      provider,
      provider_account: account,
      display_name: provider === "microsoft" ? "Microsoft" : "Google",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function addSecret(calendarId: string) {
  const svc = serviceClient();
  const { error } = await svc.from("calendar_secrets").insert({
    calendar_id: calendarId,
    access_token: "access-token",
    refresh_token: "refresh-token",
    token_expires_at: "2999-01-01T00:00:00Z",
  });
  if (error) throw error;
}

async function addEvent(
  userId: string,
  calendarId: string,
  e: {
    starts_at: string;
    ends_at: string;
    provider_busy?: boolean;
    category?: string | null;
    override?: "free" | "blocked" | null;
    title?: string;
  },
): Promise<string> {
  const svc = serviceClient();
  const { data, error } = await svc
    .from("events")
    .insert({
      user_id: userId,
      calendar_id: calendarId,
      provider_event_id: `pid-${Date.now()}-${pidCounter++}`,
      title: e.title ?? "Secret meeting",
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      provider_busy: e.provider_busy ?? true,
      category: e.category ?? null,
      override: e.override ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const FROM = "2026-09-01T00:00:00Z";
const TO = "2026-09-02T00:00:00Z";

describe("calendars — owner-only RLS", () => {
  beforeEach(resetData);

  it("shows a user their own calendars, hides others'", async () => {
    const owner = await newUserClient();
    await addCalendar(owner.id);
    const stranger = await newUserClient();

    const mine = await owner.client.from("calendars").select("id, provider");
    expect(mine.data).toHaveLength(1);
    expect(mine.data?.[0]?.provider).toBe("google");

    const theirs = await stranger.client.from("calendars").select("id");
    expect(theirs.data).toHaveLength(0);
  });
});

describe("microsoft provider — shares the provider-agnostic DB path (Phase 6)", () => {
  beforeEach(resetData);

  it("stores a microsoft calendar, owner-scoped, and folds its events into busy time", async () => {
    const me = await newUserClient();
    const calId = await addCalendar(me.id, "me@outlook.com", "microsoft");
    await addEvent(me.id, calId, {
      starts_at: "2026-09-01T10:00:00Z",
      ends_at: "2026-09-01T11:00:00Z",
    });

    const mine = await me.client.from("calendars").select("id, provider");
    expect(mine.data).toHaveLength(1);
    expect(mine.data?.[0]?.provider).toBe("microsoft");

    // Other users still can't see it (same RLS as Google).
    const stranger = await newUserClient();
    expect((await stranger.client.from("calendars").select("id")).data).toHaveLength(0);

    // Its events feed the availability RPC exactly like Google's do.
    const { data } = await me.client.rpc("my_busy_intervals", { p_from: FROM, p_to: TO });
    expect(data).toHaveLength(1);
  });
});

describe("calendar_secrets — never client-readable (DATA-MODEL §9-C)", () => {
  beforeEach(resetData);

  it("denies the owner's own client but allows the service role", async () => {
    const owner = await newUserClient();
    const calId = await addCalendar(owner.id);
    await addSecret(calId);

    // Even the owner cannot read tokens through the Data API.
    const viaClient = await owner.client
      .from("calendar_secrets")
      .select("access_token");
    expect(viaClient.data ?? []).toHaveLength(0);

    // The worker (service role) can.
    const viaService = await serviceClient()
      .from("calendar_secrets")
      .select("access_token")
      .eq("calendar_id", calId);
    expect(viaService.data).toHaveLength(1);
    expect(viaService.data?.[0]?.access_token).toBe("access-token");
  });
});

describe("events — owner-only RLS + override write", () => {
  beforeEach(resetData);

  it("hides event titles from everyone else", async () => {
    const owner = await newUserClient();
    const calId = await addCalendar(owner.id);
    await addEvent(owner.id, calId, { starts_at: FROM, ends_at: TO });
    const stranger = await newUserClient();

    const mine = await owner.client.from("events").select("id, title");
    expect(mine.data).toHaveLength(1);

    const theirs = await stranger.client.from("events").select("id");
    expect(theirs.data).toHaveLength(0);
  });

  it("lets the owner flip an event's override", async () => {
    const owner = await newUserClient();
    const calId = await addCalendar(owner.id);
    const eventId = await addEvent(owner.id, calId, { starts_at: FROM, ends_at: TO });

    const { error } = await owner.client
      .from("events")
      .update({ override: "free" })
      .eq("id", eventId);
    expect(error).toBeNull();

    const { data } = await owner.client
      .from("events")
      .select("override")
      .eq("id", eventId)
      .single();
    expect(data?.override).toBe("free");
  });
});

describe("category_overrides — owner-only", () => {
  beforeEach(resetData);

  it("is private to its owner", async () => {
    const owner = await newUserClient();
    await owner.client
      .from("category_overrides")
      .insert({ user_id: owner.id, category: "focusTime", state: "free" });
    const stranger = await newUserClient();

    expect((await owner.client.from("category_overrides").select("category")).data).toHaveLength(1);
    expect((await stranger.client.from("category_overrides").select("category")).data).toHaveLength(0);
  });
});

describe("my_busy_intervals — folds in synced events with overrides", () => {
  beforeEach(resetData);

  it("counts a busy synced event", async () => {
    const me = await newUserClient();
    const calId = await addCalendar(me.id);
    await addEvent(me.id, calId, {
      starts_at: "2026-09-01T10:00:00Z",
      ends_at: "2026-09-01T11:00:00Z",
    });

    const { data, error } = await me.client.rpc("my_busy_intervals", {
      p_from: FROM,
      p_to: TO,
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.starts_at).toBe("2026-09-01T10:00:00+00:00");
  });

  it("excludes an event the user marked free", async () => {
    const me = await newUserClient();
    const calId = await addCalendar(me.id);
    await addEvent(me.id, calId, {
      starts_at: "2026-09-01T10:00:00Z",
      ends_at: "2026-09-01T11:00:00Z",
      override: "free",
    });

    const { data } = await me.client.rpc("my_busy_intervals", { p_from: FROM, p_to: TO });
    expect(data).toHaveLength(0);
  });

  it("excludes an event whose category is overridden to free", async () => {
    const me = await newUserClient();
    const calId = await addCalendar(me.id);
    await addEvent(me.id, calId, {
      starts_at: "2026-09-01T10:00:00Z",
      ends_at: "2026-09-01T11:00:00Z",
      category: "focusTime",
    });
    await me.client
      .from("category_overrides")
      .insert({ user_id: me.id, category: "focusTime", state: "free" });

    const { data } = await me.client.rpc("my_busy_intervals", { p_from: FROM, p_to: TO });
    expect(data).toHaveLength(0);
  });

  it("lets a per-event override win over the category rule", async () => {
    const me = await newUserClient();
    const calId = await addCalendar(me.id);
    await addEvent(me.id, calId, {
      starts_at: "2026-09-01T10:00:00Z",
      ends_at: "2026-09-01T11:00:00Z",
      category: "focusTime",
      override: "blocked",
    });
    await me.client
      .from("category_overrides")
      .insert({ user_id: me.id, category: "focusTime", state: "free" });

    const { data } = await me.client.rpc("my_busy_intervals", { p_from: FROM, p_to: TO });
    expect(data).toHaveLength(1); // override 'blocked' beats category 'free'
  });

  it("treats a provider-free event as free", async () => {
    const me = await newUserClient();
    const calId = await addCalendar(me.id);
    await addEvent(me.id, calId, {
      starts_at: "2026-09-01T10:00:00Z",
      ends_at: "2026-09-01T11:00:00Z",
      provider_busy: false,
    });

    const { data } = await me.client.rpc("my_busy_intervals", { p_from: FROM, p_to: TO });
    expect(data).toHaveLength(0);
  });
});

describe("group RPCs — synced events flow into the aggregate", () => {
  beforeEach(resetData);

  async function groupWithMember(): Promise<{ owner: TestUser; member: TestUser; groupId: string }> {
    const owner = await newUserClient();
    const member = await newUserClient();
    const group = await createGroup(owner, "Crew");
    await owner.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: member.id });
    return { owner, member, groupId: group.id };
  }

  it("exposes a member's event as a de-identified interval (no title)", async () => {
    const { owner, member, groupId } = await groupWithMember();
    const calId = await addCalendar(member.id);
    await addEvent(member.id, calId, {
      starts_at: "2026-09-01T10:00:00Z",
      ends_at: "2026-09-01T11:00:00Z",
      title: "Therapy",
    });

    const { data, error } = await owner.client.rpc("group_busy_intervals", {
      p_group_id: groupId,
      p_from: FROM,
      p_to: TO,
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.user_id).toBe(member.id);
    // Only the de-identified columns — never the title.
    expect(Object.keys(data?.[0] ?? {})).toEqual(["user_id", "starts_at", "ends_at"]);
  });

  it("counts a busy event in the heatmap and lets an override clear it", async () => {
    const { owner, member, groupId } = await groupWithMember();
    const calId = await addCalendar(member.id);
    const eventId = await addEvent(member.id, calId, {
      starts_at: "2026-09-01T10:00:00Z",
      ends_at: "2026-09-01T11:00:00Z",
    });

    const slot = { p_group_id: groupId, p_from: "2026-09-01T10:00:00Z", p_to: "2026-09-01T11:00:00Z", p_slot_minutes: 60 };

    const busy = await owner.client.rpc("group_heatmap", slot);
    expect(busy.data?.[0]).toMatchObject({ busy_count: 1, free_count: 1, everyone_free: false });

    // Member frees the event → the slot is now everyone-free.
    await member.client.from("events").update({ override: "free" }).eq("id", eventId);

    const free = await owner.client.rpc("group_heatmap", slot);
    expect(free.data?.[0]).toMatchObject({ busy_count: 0, free_count: 2, everyone_free: true });
  });
});
