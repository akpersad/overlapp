import { beforeEach, describe, expect, it } from "vitest";

import { createGroup, newUserClient, resetData, type TestUser } from "./_helpers";

// Feature: recurring hangouts (Phase 4). Exercises the admin-only write RLS,
// member-gated reads, and the upcoming_hangouts expander RPC (reusing the tested
// expand_block_occurrences). A hangout is stored like a manual block (anchor +
// rrule); the RPC yields concrete upcoming occurrences from now().

// Anchor in the past + DAILY so there's always an occurrence within the horizon.
const ANCHOR = {
  starts_at: "2026-01-01T18:00:00Z",
  ends_at: "2026-01-01T20:00:00Z",
  rrule: "FREQ=DAILY",
};

async function groupWithMember() {
  const owner = await newUserClient();
  const group = await createGroup(owner, "Crew");
  const member = await newUserClient();
  await owner.client
    .from("group_members")
    .insert({ group_id: group.id, user_id: member.id });
  return { owner, group, member };
}

async function addHangout(user: TestUser, groupId: string, title = "Game night") {
  const { data, error } = await user.client
    .from("recurring_hangouts")
    .insert({ group_id: groupId, created_by: user.id, title, ...ANCHOR })
    .select()
    .single();
  return { data, error };
}

describe("recurring_hangouts — admin-only writes", () => {
  beforeEach(resetData);

  it("an admin (owner) can create a hangout", async () => {
    const { owner, group } = await groupWithMember();
    const { data, error } = await addHangout(owner, group.id);
    expect(error).toBeNull();
    expect(data?.title).toBe("Game night");
  });

  it("a non-admin member cannot create a hangout", async () => {
    const { group, member } = await groupWithMember();
    const { data, error } = await addHangout(member, group.id);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("a non-member cannot create a hangout", async () => {
    const { group } = await groupWithMember();
    const outsider = await newUserClient();
    const { error } = await addHangout(outsider, group.id);
    expect(error).not.toBeNull();
  });

  it("only an admin can delete a hangout", async () => {
    const { owner, group, member } = await groupWithMember();
    const { data: h } = await addHangout(owner, group.id);

    // Member's delete is a no-op under RLS (no matching row to delete).
    await member.client.from("recurring_hangouts").delete().eq("id", h!.id);
    const { data: stillThere } = await owner.client
      .from("recurring_hangouts")
      .select("id")
      .eq("id", h!.id)
      .maybeSingle();
    expect(stillThere).not.toBeNull();

    await owner.client.from("recurring_hangouts").delete().eq("id", h!.id);
    const { data: gone } = await owner.client
      .from("recurring_hangouts")
      .select("id")
      .eq("id", h!.id)
      .maybeSingle();
    expect(gone).toBeNull();
  });
});

describe("recurring_hangouts — member-gated reads + upcoming_hangouts", () => {
  beforeEach(resetData);

  it("members see the group's hangouts; outsiders don't", async () => {
    const { owner, group, member } = await groupWithMember();
    await addHangout(owner, group.id);

    const { data: asMember } = await member.client
      .from("recurring_hangouts")
      .select("id")
      .eq("group_id", group.id);
    expect(asMember).toHaveLength(1);

    const outsider = await newUserClient();
    const { data: asOutsider } = await outsider.client
      .from("recurring_hangouts")
      .select("id")
      .eq("group_id", group.id);
    expect(asOutsider ?? []).toHaveLength(0);
  });

  it("upcoming_hangouts expands occurrences for a member, ordered + bounded", async () => {
    const { owner, group } = await groupWithMember();
    await addHangout(owner, group.id);

    const to = new Date();
    to.setDate(to.getDate() + 3);
    const { data, error } = await owner.client.rpc("upcoming_hangouts", {
      p_group_id: group.id,
      p_to: to.toISOString(),
    });
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);

    // Occurrences are well-formed and chronological.
    let prev = 0;
    for (const occ of data ?? []) {
      expect(new Date(occ.occ_end).getTime()).toBeGreaterThan(
        new Date(occ.occ_start).getTime(),
      );
      const t = new Date(occ.occ_start).getTime();
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it("upcoming_hangouts returns nothing for a non-member", async () => {
    const { owner, group } = await groupWithMember();
    await addHangout(owner, group.id);
    const outsider = await newUserClient();

    const to = new Date();
    to.setDate(to.getDate() + 3);
    const { data } = await outsider.client.rpc("upcoming_hangouts", {
      p_group_id: group.id,
      p_to: to.toISOString(),
    });
    expect(data ?? []).toHaveLength(0);
  });

  it("inactive hangouts are excluded from upcoming_hangouts", async () => {
    const { owner, group } = await groupWithMember();
    const { data: h } = await addHangout(owner, group.id);
    await owner.client
      .from("recurring_hangouts")
      .update({ active: false })
      .eq("id", h!.id);

    const to = new Date();
    to.setDate(to.getDate() + 3);
    const { data } = await owner.client.rpc("upcoming_hangouts", {
      p_group_id: group.id,
      p_to: to.toISOString(),
    });
    expect(data ?? []).toHaveLength(0);
  });
});
