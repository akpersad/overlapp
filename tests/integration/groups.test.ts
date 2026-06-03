import { beforeEach, describe, expect, it } from "vitest";

import {
  createGroup,
  createUser,
  newUserClient,
  resetData,
  serviceClient,
} from "./_helpers";

// Feature: groups & membership. Exercises the triggers (owner auto-membership,
// 15-member cap) and the RLS posture from DATA-MODEL.md §3/§11 through the same
// client path the app will use.
describe("groups & membership — triggers + RLS", () => {
  beforeEach(resetData);

  it("auto-adds the creator as an active owner member on group creation", async () => {
    const owner = await newUserClient({ firstName: "Olive", lastName: "Owner" });
    const group = await createGroup(owner, "Test Crew");

    const { data: members, error } = await owner.client
      .from("group_members")
      .select("user_id, role, status")
      .eq("group_id", group.id);

    expect(error).toBeNull();
    expect(members).toHaveLength(1);
    expect(members?.[0]).toMatchObject({
      user_id: owner.id,
      role: "owner",
      status: "active",
    });
  });

  it("rejects creating a group owned by someone else (insert WITH CHECK)", async () => {
    const me = await newUserClient();
    const other = await createUser();

    const { error } = await me.client
      .from("groups")
      .insert({ name: "Spoof", owner_id: other.id })
      .select()
      .single();

    expect(error).not.toBeNull();
  });

  it("hides a group from non-members (RLS)", async () => {
    const owner = await newUserClient();
    const group = await createGroup(owner, "Private");
    const stranger = await newUserClient();

    const { data, error } = await stranger.client
      .from("groups")
      .select("id")
      .eq("id", group.id);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("lets an admin add a member; co-members then see each other's profiles", async () => {
    const owner = await newUserClient();
    const member = await createUser({ firstName: "Mara", lastName: "Member" });
    const group = await createGroup(owner, "Crew");

    const { error: addError } = await owner.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: member.id });
    expect(addError).toBeNull();

    const { data: roster } = await owner.client
      .from("group_members")
      .select("user_id")
      .eq("group_id", group.id);
    expect(roster).toHaveLength(2);

    // Co-member profile-read policy (unblocked by group_members).
    const { data: profile } = await owner.client
      .from("profiles")
      .select("first_name")
      .eq("id", member.id);
    expect(profile).toHaveLength(1);
    expect(profile?.[0]?.first_name).toBe("Mara");
  });

  it("forbids a plain member from adding others (admins/owner only)", async () => {
    const owner = await newUserClient();
    const member = await newUserClient();
    const outsider = await createUser();
    const group = await createGroup(owner, "Crew");

    await owner.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: member.id });

    const { error } = await member.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: outsider.id });

    expect(error).not.toBeNull(); // RLS WITH CHECK denies the insert
  });

  it("enforces the 15-member cap", async () => {
    const owner = await newUserClient();
    const group = await createGroup(owner, "Big Crew");

    // Owner is member #1; add 14 more to reach exactly 15.
    const fillers = await Promise.all(
      Array.from({ length: 14 }, () => createUser()),
    );
    const { error: fillError } = await owner.client
      .from("group_members")
      .insert(fillers.map((u) => ({ group_id: group.id, user_id: u.id })));
    expect(fillError).toBeNull();

    const { count } = await owner.client
      .from("group_members")
      .select("*", { count: "exact", head: true })
      .eq("group_id", group.id);
    expect(count).toBe(15);

    // The 16th must be rejected by the cap trigger.
    const extra = await createUser();
    const { error } = await owner.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: extra.id });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/15-member cap/);
  });

  it("protects the owner's membership from removal but lets a member leave", async () => {
    const owner = await newUserClient();
    const member = await newUserClient();
    const group = await createGroup(owner, "Crew");
    await owner.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: member.id });

    // Owner cannot delete their own membership (policy excludes role='owner').
    await owner.client
      .from("group_members")
      .delete()
      .eq("group_id", group.id)
      .eq("user_id", owner.id);
    const { data: stillOwner } = await owner.client
      .from("group_members")
      .select("user_id")
      .eq("group_id", group.id)
      .eq("user_id", owner.id);
    expect(stillOwner).toHaveLength(1);

    // A plain member can remove themselves (leave).
    await member.client
      .from("group_members")
      .delete()
      .eq("group_id", group.id)
      .eq("user_id", member.id);
    const { data: gone } = await owner.client
      .from("group_members")
      .select("user_id")
      .eq("group_id", group.id)
      .eq("user_id", member.id);
    expect(gone).toHaveLength(0);
  });

  // Soft-delete READ behaviour. Note the write path: an admin CANNOT soft-delete
  // via a direct `update({ deleted_at })` — PostgreSQL requires an UPDATE's
  // resulting row to still satisfy the SELECT policy, and our policy filters
  // `deleted_at is null`, so the row would update itself out of visibility and
  // Postgres rejects it (42501). Group dissolution will therefore go through a
  // SECURITY DEFINER RPC (spec §8) — TODO when group management lands. Here we
  // set deleted_at the way that RPC will (privileged) and assert the read filter.
  it("hides a soft-deleted group from its members (read-side filter)", async () => {
    const owner = await newUserClient();
    const group = await createGroup(owner, "Doomed");

    await serviceClient()
      .from("groups")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", group.id);

    const { data, error } = await owner.client
      .from("groups")
      .select("id")
      .eq("id", group.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(0); // every read policy filters deleted_at
  });

  it("rejects an admin's direct update that would soft-delete the group", async () => {
    const owner = await newUserClient();
    const group = await createGroup(owner, "Doomed2");

    // Direct deleted_at write is blocked by RLS (see note above) — dissolution
    // must use a privileged RPC. This test pins that current behaviour.
    const { error } = await owner.client
      .from("groups")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", group.id);
    expect(error?.code).toBe("42501");
  });
});
