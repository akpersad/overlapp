import { beforeEach, describe, expect, it } from "vitest";

import {
  anonClient,
  createGroup,
  newUserClient,
  resetData,
} from "./_helpers";

// Feature: Phase 5 realtime heatmap (broadcast doorbell + authorization).
//
// The live-delivery path (websocket subscribe → receive a broadcast) is hard to
// exercise deterministically here — like Web Push, it's a manual check. What we
// CAN (and must) test deterministically is the privacy boundary: who is allowed
// to receive a group's "group-availability:<id>" broadcasts. That's enforced by
// can_read_group_broadcast (used in the realtime.messages SELECT policy). We
// also guard that the AFTER triggers don't break ordinary availability writes.

const topic = (groupId: string) => `group-availability:${groupId}`;

describe("realtime broadcast authorization (can_read_group_broadcast)", () => {
  beforeEach(resetData);

  it("lets an active member read their group's broadcast topic", async () => {
    const owner = await newUserClient();
    const group = await createGroup(owner, "Crew");

    const { data, error } = await owner.client.rpc("can_read_group_broadcast", {
      p_topic: topic(group.id),
    });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it("denies a non-member (the privacy boundary)", async () => {
    const owner = await newUserClient();
    const stranger = await newUserClient();
    const group = await createGroup(owner, "Crew");

    const { data, error } = await stranger.client.rpc(
      "can_read_group_broadcast",
      { p_topic: topic(group.id) },
    );
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it("denies a pending (not-yet-active) member", async () => {
    const owner = await newUserClient();
    const pending = await newUserClient();
    const group = await createGroup(owner, "Crew");
    await owner.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: pending.id, status: "pending" });

    const { data } = await pending.client.rpc("can_read_group_broadcast", {
      p_topic: topic(group.id),
    });
    expect(data).toBe(false);
  });

  it("returns false for malformed / foreign topics", async () => {
    const owner = await newUserClient();
    await createGroup(owner, "Crew");

    for (const t of [
      "group-availability:not-a-uuid",
      "some-other-topic",
      "group-availability:",
    ]) {
      const { data } = await owner.client.rpc("can_read_group_broadcast", {
        p_topic: t,
      });
      expect(data).toBe(false);
    }
  });

  it("is not callable by the anon role", async () => {
    const { error } = await anonClient().rpc("can_read_group_broadcast", {
      p_topic: topic("00000000-0000-0000-0000-000000000000"),
    });
    expect(error).not.toBeNull();
  });
});

describe("availability writes still succeed with broadcast triggers", () => {
  beforeEach(resetData);

  it("inserting a manual block (which fires the broadcast trigger) succeeds", async () => {
    const owner = await newUserClient();
    await createGroup(owner, "Crew");

    const { error } = await owner.client.from("manual_blocks").insert({
      user_id: owner.id,
      starts_at: "2026-07-01T10:00:00Z",
      ends_at: "2026-07-01T12:00:00Z",
    });
    expect(error).toBeNull();
  });

  it("adding a member (which fires the group broadcast trigger) succeeds", async () => {
    const owner = await newUserClient();
    const member = await newUserClient();
    const group = await createGroup(owner, "Crew");

    const { error } = await owner.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: member.id });
    expect(error).toBeNull();
  });
});
