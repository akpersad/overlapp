import { beforeEach, describe, expect, it } from "vitest";

import {
  createGroup,
  createUser,
  newUserClient,
  resetData,
  type TestUser,
} from "./_helpers";

// Feature: the availability layer (DATA-MODEL.md §7/§8). Exercises manual_blocks
// RLS, the RRULE expander via my_busy_intervals, the de-identified
// group_busy_intervals privacy boundary, and the on-the-fly group_heatmap — all
// through the real client/RLS path.

/** Insert a manual block as `user` and return its id. */
async function addBlock(
  user: TestUser,
  block: { starts_at: string; ends_at: string; rrule?: string; label?: string },
) {
  const { data, error } = await user.client
    .from("manual_blocks")
    .insert({ user_id: user.id, ...block })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

describe("manual_blocks — owner-only RLS", () => {
  beforeEach(resetData);

  it("lets a user CRUD their own blocks", async () => {
    const user = await newUserClient();
    const id = await addBlock(user, {
      starts_at: "2026-07-01T10:00:00Z",
      ends_at: "2026-07-01T12:00:00Z",
      label: "Dentist",
    });

    const { data } = await user.client
      .from("manual_blocks")
      .select("id, label")
      .eq("id", id);
    expect(data).toHaveLength(1);
    expect(data?.[0]?.label).toBe("Dentist");
  });

  it("hides a user's blocks from everyone else (RLS)", async () => {
    const owner = await newUserClient();
    await addBlock(owner, {
      starts_at: "2026-07-01T10:00:00Z",
      ends_at: "2026-07-01T12:00:00Z",
    });
    const stranger = await newUserClient();

    const { data, error } = await stranger.client
      .from("manual_blocks")
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(0); // RLS filters, not an error
  });

  it("forbids inserting a block for another user (WITH CHECK)", async () => {
    const me = await newUserClient();
    const other = await createUser();

    const { error } = await me.client.from("manual_blocks").insert({
      user_id: other.id,
      starts_at: "2026-07-01T10:00:00Z",
      ends_at: "2026-07-01T12:00:00Z",
    });
    expect(error).not.toBeNull();
  });

  it("rejects an inverted time range (check constraint)", async () => {
    const me = await newUserClient();
    const { error } = await me.client.from("manual_blocks").insert({
      user_id: me.id,
      starts_at: "2026-07-01T12:00:00Z",
      ends_at: "2026-07-01T10:00:00Z",
    });
    expect(error).not.toBeNull();
  });
});

describe("my_busy_intervals — RRULE expansion", () => {
  beforeEach(resetData);

  it("returns a one-off block only when the window overlaps it", async () => {
    const me = await newUserClient();
    await addBlock(me, {
      starts_at: "2026-07-01T10:00:00Z",
      ends_at: "2026-07-01T12:00:00Z",
    });

    const { data: hit, error } = await me.client.rpc("my_busy_intervals", {
      p_from: "2026-07-01T00:00:00Z",
      p_to: "2026-07-02T00:00:00Z",
    });
    expect(error).toBeNull();
    expect(hit).toHaveLength(1);
    expect(hit?.[0]?.starts_at).toBe("2026-07-01T10:00:00+00:00");

    const { data: miss } = await me.client.rpc("my_busy_intervals", {
      p_from: "2026-08-01T00:00:00Z",
      p_to: "2026-08-02T00:00:00Z",
    });
    expect(miss).toHaveLength(0);
  });

  it("expands a weekly BYDAY rule across the window", async () => {
    const me = await newUserClient();
    // Mon 2026-07-06 09:00–10:00, repeating Mondays + Wednesdays.
    await addBlock(me, {
      starts_at: "2026-07-06T09:00:00Z",
      ends_at: "2026-07-06T10:00:00Z",
      rrule: "FREQ=WEEKLY;BYDAY=MO,WE",
    });

    const { data, error } = await me.client.rpc("my_busy_intervals", {
      p_from: "2026-07-06T00:00:00Z",
      p_to: "2026-07-13T00:00:00Z", // exclusive — next Monday excluded
    });
    expect(error).toBeNull();
    // Mon Jul 6 + Wed Jul 8 only.
    expect(data).toHaveLength(2);
    expect(data?.map((r) => r.starts_at)).toEqual([
      "2026-07-06T09:00:00+00:00",
      "2026-07-08T09:00:00+00:00",
    ]);
  });

  it("honours COUNT on a daily rule", async () => {
    const me = await newUserClient();
    await addBlock(me, {
      starts_at: "2026-07-01T09:00:00Z",
      ends_at: "2026-07-01T09:30:00Z",
      rrule: "FREQ=DAILY;COUNT=3",
    });

    const { data } = await me.client.rpc("my_busy_intervals", {
      p_from: "2026-07-01T00:00:00Z",
      p_to: "2026-08-01T00:00:00Z",
    });
    expect(data).toHaveLength(3); // Jul 1, 2, 3 then stops
  });
});

describe("group_busy_intervals — de-identified, member-gated", () => {
  beforeEach(resetData);

  it("returns every active member's intervals to a co-member, nothing to outsiders", async () => {
    const owner = await newUserClient();
    const member = await newUserClient();
    const group = await createGroup(owner, "Crew");
    await owner.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: member.id });

    await addBlock(owner, {
      starts_at: "2026-07-01T10:00:00Z",
      ends_at: "2026-07-01T11:00:00Z",
      label: "secret",
    });
    await addBlock(member, {
      starts_at: "2026-07-01T14:00:00Z",
      ends_at: "2026-07-01T15:00:00Z",
    });

    const { data, error } = await member.client.rpc("group_busy_intervals", {
      p_group_id: group.id,
      p_from: "2026-07-01T00:00:00Z",
      p_to: "2026-07-02T00:00:00Z",
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    // De-identified: only user_id + interval, never the label.
    const userIds = new Set(data?.map((r) => r.user_id));
    expect(userIds).toEqual(new Set([owner.id, member.id]));
    expect(Object.keys(data?.[0] ?? {})).toEqual([
      "user_id",
      "starts_at",
      "ends_at",
    ]);

    const stranger = await newUserClient();
    const { data: none } = await stranger.client.rpc("group_busy_intervals", {
      p_group_id: group.id,
      p_from: "2026-07-01T00:00:00Z",
      p_to: "2026-07-02T00:00:00Z",
    });
    expect(none).toHaveLength(0);
  });
});

describe("group_heatmap — on-the-fly aggregate", () => {
  beforeEach(resetData);

  it("flags everyone-free slots and counts busy members", async () => {
    const owner = await newUserClient();
    const member = await newUserClient();
    const group = await createGroup(owner, "Crew");
    await owner.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: member.id });

    // Only the owner is busy 10:00–11:00.
    await addBlock(owner, {
      starts_at: "2026-07-01T10:00:00Z",
      ends_at: "2026-07-01T11:00:00Z",
    });

    const { data, error } = await member.client.rpc("group_heatmap", {
      p_group_id: group.id,
      p_from: "2026-07-01T09:00:00Z",
      p_to: "2026-07-01T12:00:00Z",
      p_slot_minutes: 60,
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(3); // 9–10, 10–11, 11–12

    const [s9, s10, s11] = data!;
    expect(s9).toMatchObject({
      busy_count: 0,
      free_count: 2,
      total_members: 2,
      everyone_free: true,
    });
    expect(s10).toMatchObject({
      busy_count: 1,
      free_count: 1,
      everyone_free: false,
    });
    expect(s11.everyone_free).toBe(true);
  });

  it("returns nothing to a non-member", async () => {
    const owner = await newUserClient();
    const group = await createGroup(owner, "Crew");
    const stranger = await newUserClient();

    const { data } = await stranger.client.rpc("group_heatmap", {
      p_group_id: group.id,
      p_from: "2026-07-01T09:00:00Z",
      p_to: "2026-07-01T12:00:00Z",
    });
    expect(data).toHaveLength(0);
  });

  it("rejects an over-long window", async () => {
    const owner = await newUserClient();
    const group = await createGroup(owner, "Crew");

    const { error } = await owner.client.rpc("group_heatmap", {
      p_group_id: group.id,
      p_from: "2026-07-01T00:00:00Z",
      p_to: "2026-10-01T00:00:00Z", // ~92 days
    });
    expect(error).not.toBeNull();
  });
});
