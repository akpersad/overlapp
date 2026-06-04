import { beforeEach, describe, expect, it } from "vitest";

import {
  createGroup,
  newUserClient,
  resetData,
  serviceClient,
} from "./_helpers";

// Feature: group management RPCs (DATA-MODEL.md §9-E, spec §9). dissolve_group
// (the soft-delete write path the direct UPDATE can't do), ownership transfer,
// and the role-integrity guard.
describe("group management — dissolve / transfer / role guard", () => {
  beforeEach(resetData);

  it("lets the owner dissolve the group (soft-delete RPC); it then disappears", async () => {
    const owner = await newUserClient();
    const group = await createGroup(owner, "Doomed");

    const { error } = await owner.client.rpc("dissolve_group", {
      p_group_id: group.id,
    });
    expect(error).toBeNull();

    // RLS hides the soft-deleted group from its own owner.
    const { data } = await owner.client
      .from("groups")
      .select("id")
      .eq("id", group.id);
    expect(data).toHaveLength(0);

    // deleted_at is actually set (verified via the service role).
    const { data: raw } = await serviceClient()
      .from("groups")
      .select("deleted_at")
      .eq("id", group.id)
      .single();
    expect(raw?.deleted_at).not.toBeNull();
  });

  it("forbids a non-owner from dissolving the group", async () => {
    const owner = await newUserClient();
    const member = await newUserClient();
    const group = await createGroup(owner, "Crew");
    await owner.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: member.id });

    const { error } = await member.client.rpc("dissolve_group", {
      p_group_id: group.id,
    });
    expect(error).not.toBeNull();
  });

  it("transfers ownership: roles swap and groups.owner_id updates", async () => {
    const owner = await newUserClient();
    const member = await newUserClient();
    const group = await createGroup(owner, "Crew");
    await owner.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: member.id });

    const { error } = await owner.client.rpc("transfer_group_ownership", {
      p_group_id: group.id,
      p_new_owner: member.id,
    });
    expect(error).toBeNull();

    const svc = serviceClient();
    const { data: grp } = await svc
      .from("groups")
      .select("owner_id")
      .eq("id", group.id)
      .single();
    expect(grp?.owner_id).toBe(member.id);

    const { data: roles } = await svc
      .from("group_members")
      .select("user_id, role")
      .eq("group_id", group.id);
    const byUser = Object.fromEntries(roles!.map((r) => [r.user_id, r.role]));
    expect(byUser[member.id]).toBe("owner");
    expect(byUser[owner.id]).toBe("admin");
  });

  it("rejects transferring ownership to a non-member", async () => {
    const owner = await newUserClient();
    const outsider = await newUserClient();
    const group = await createGroup(owner, "Crew");

    const { error } = await owner.client.rpc("transfer_group_ownership", {
      p_group_id: group.id,
      p_new_owner: outsider.id,
    });
    expect(error).not.toBeNull();
  });

  it("guard: an admin cannot mint a second owner or edit the owner row directly", async () => {
    const owner = await newUserClient();
    const member = await newUserClient();
    const group = await createGroup(owner, "Crew");
    await owner.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: member.id });

    // Promote member to admin (allowed).
    const { error: promoteErr } = await owner.client
      .from("group_members")
      .update({ role: "admin" })
      .eq("group_id", group.id)
      .eq("user_id", member.id);
    expect(promoteErr).toBeNull();

    // Direct promotion to OWNER is blocked by the guard.
    const { error: ownerErr } = await owner.client
      .from("group_members")
      .update({ role: "owner" })
      .eq("group_id", group.id)
      .eq("user_id", member.id);
    expect(ownerErr?.code).toBe("42501");

    // The existing owner's own row cannot be modified on the direct path.
    const { error: demoteErr } = await owner.client
      .from("group_members")
      .update({ role: "admin" })
      .eq("group_id", group.id)
      .eq("user_id", owner.id);
    expect(demoteErr?.code).toBe("42501");
  });
});
