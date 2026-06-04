import { beforeEach, describe, expect, it } from "vitest";

import {
  anonClient,
  createGroup,
  newUserClient,
  resetData,
  serviceClient,
  TEST_EMAIL_DOMAIN,
  type TestUser,
} from "./_helpers";

// A unique-ish token per test; tokens are app-generated opaque strings.
let tokenCounter = 0;
function freshToken() {
  return `tok-${Date.now()}-${tokenCounter++}`;
}

/** Admin creates a token-link invite and returns the row. */
async function createInvite(
  admin: TestUser,
  groupId: string,
  overrides: Record<string, unknown> = {},
) {
  const { data, error } = await admin.client
    .from("group_invites")
    .insert({
      group_id: groupId,
      token: freshToken(),
      created_by: admin.id,
      ...overrides,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Feature: invites (DATA-MODEL.md §4/§5/§11). Exercises both mechanisms —
// token links (group_invites + get_invite_preview/redeem_group_invite RPCs) and
// email-keyed pending invites (auto-join via the handle_new_user trigger) —
// through the same client path the app uses.
describe("invites — token links + pending invites", () => {
  beforeEach(resetData);

  // ---- group_invites RLS ---------------------------------------------------

  it("lets an admin create a token invite but forbids a plain member", async () => {
    const owner = await newUserClient();
    const member = await newUserClient();
    const group = await createGroup(owner, "Crew");
    await owner.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: member.id });

    const invite = await createInvite(owner, group.id);
    expect(invite.token).toBeTruthy();
    expect(invite.use_count).toBe(0);

    const { error } = await member.client
      .from("group_invites")
      .insert({ group_id: group.id, token: freshToken(), created_by: member.id })
      .select()
      .single();
    expect(error).not.toBeNull(); // RLS WITH CHECK denies non-admins
  });

  it("hides invites from non-admins and non-members", async () => {
    const owner = await newUserClient();
    const member = await newUserClient();
    const stranger = await newUserClient();
    const group = await createGroup(owner, "Crew");
    await owner.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: member.id });
    await createInvite(owner, group.id);

    // Plain member: admins-only read -> empty (RLS filters rows, no error).
    const asMember = await member.client
      .from("group_invites")
      .select("id")
      .eq("group_id", group.id);
    expect(asMember.error).toBeNull();
    expect(asMember.data).toHaveLength(0);

    // Stranger: same.
    const asStranger = await stranger.client
      .from("group_invites")
      .select("id")
      .eq("group_id", group.id);
    expect(asStranger.data).toHaveLength(0);
  });

  // ---- get_invite_preview --------------------------------------------------

  it("previews a valid invite to an anonymous (no-account) caller", async () => {
    const owner = await newUserClient({ firstName: "Pam", lastName: "Proposer" });
    const group = await createGroup(owner, "Hiking Buddies");
    const invite = await createInvite(owner, group.id);

    const { data, error } = await anonClient().rpc("get_invite_preview", {
      p_token: invite.token,
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      group_id: group.id,
      group_name: "Hiking Buddies",
      inviter_name: "Pam P.",
      member_count: 1,
      join_policy: "open",
    });
  });

  it("returns no preview for revoked / expired / used-up / unknown tokens", async () => {
    const owner = await newUserClient();
    const group = await createGroup(owner, "Crew");
    const anon = anonClient();

    const revoked = await createInvite(owner, group.id, {
      revoked_at: new Date().toISOString(),
    });
    const expired = await createInvite(owner, group.id, {
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    const usedUp = await createInvite(owner, group.id, {
      max_uses: 1,
      use_count: 1,
    });

    for (const token of [revoked.token, expired.token, usedUp.token, "nope"]) {
      const { data, error } = await anon.rpc("get_invite_preview", {
        p_token: token,
      });
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    }
  });

  // ---- redeem_group_invite -------------------------------------------------

  it("lets a signed-in non-member redeem an open-policy invite -> active", async () => {
    const owner = await newUserClient();
    const group = await createGroup(owner, "Open Crew");
    const invite = await createInvite(owner, group.id);

    const joiner = await newUserClient({ firstName: "Joe", lastName: "Joiner" });
    const { data, error } = await joiner.client.rpc("redeem_group_invite", {
      p_token: invite.token,
    });
    expect(error).toBeNull();
    expect(data?.[0]).toMatchObject({ group_id: group.id, status: "active" });

    // Joiner is now an active member and can see the group + roster.
    const { data: g } = await joiner.client
      .from("groups")
      .select("id")
      .eq("id", group.id);
    expect(g).toHaveLength(1);

    // use_count incremented (observed via service client).
    const { data: after } = await serviceClient()
      .from("group_invites")
      .select("use_count")
      .eq("id", invite.id)
      .single();
    expect(after?.use_count).toBe(1);
  });

  it("redeems an approval-policy invite as pending (not yet active)", async () => {
    const owner = await newUserClient();
    const group = await createGroup(owner, "Gated Crew");
    await owner.client
      .from("groups")
      .update({ join_policy: "approval" })
      .eq("id", group.id);
    const invite = await createInvite(owner, group.id);

    const joiner = await newUserClient();
    const { data, error } = await joiner.client.rpc("redeem_group_invite", {
      p_token: invite.token,
    });
    expect(error).toBeNull();
    expect(data?.[0]).toMatchObject({ group_id: group.id, status: "pending" });

    // A pending member CAN see the group's basic row (so they see "awaiting
    // approval" and the post-redeem redirect resolves) — see migration
    // pending_member_visibility — but gets NO member availability: the heatmap
    // RPC still gates on active membership.
    const { data: g } = await joiner.client
      .from("groups")
      .select("id")
      .eq("id", group.id);
    expect(g).toHaveLength(1);

    const { data: heat } = await joiner.client.rpc("group_heatmap", {
      p_group_id: group.id,
      p_from: "2026-07-01T00:00:00Z",
      p_to: "2026-07-02T00:00:00Z",
    });
    expect(heat).toHaveLength(0);

    // They can read their OWN pending membership row (self-select policy).
    const { data: ownRow } = await joiner.client
      .from("group_members")
      .select("status")
      .eq("group_id", group.id)
      .eq("user_id", joiner.id);
    expect(ownRow?.[0]?.status).toBe("pending");
  });

  it("is idempotent: re-redeeming returns current status, no extra use", async () => {
    const owner = await newUserClient();
    const group = await createGroup(owner, "Crew");
    const invite = await createInvite(owner, group.id);
    const joiner = await newUserClient();

    await joiner.client.rpc("redeem_group_invite", { p_token: invite.token });
    const second = await joiner.client.rpc("redeem_group_invite", {
      p_token: invite.token,
    });
    expect(second.error).toBeNull();
    expect(second.data?.[0]).toMatchObject({ status: "active" });

    const { data: after } = await serviceClient()
      .from("group_invites")
      .select("use_count")
      .eq("id", invite.id)
      .single();
    expect(after?.use_count).toBe(1); // not 2 — re-redeem consumed nothing
  });

  it("rejects redeeming a revoked invite and an anonymous caller", async () => {
    const owner = await newUserClient();
    const group = await createGroup(owner, "Crew");
    const revoked = await createInvite(owner, group.id, {
      revoked_at: new Date().toISOString(),
    });

    const joiner = await newUserClient();
    const bad = await joiner.client.rpc("redeem_group_invite", {
      p_token: revoked.token,
    });
    expect(bad.error).not.toBeNull();

    // anon (not signed in) cannot redeem even a valid invite.
    const ok = await createInvite(owner, group.id);
    const asAnon = await anonClient().rpc("redeem_group_invite", {
      p_token: ok.token,
    });
    expect(asAnon.error).not.toBeNull();
  });

  // ---- pending_invites + auto-join on signup -------------------------------

  it("auto-joins a new signup whose email matches a pending invite (open)", async () => {
    const owner = await newUserClient();
    const group = await createGroup(owner, "Welcome Crew");

    const email = `pending-${Date.now()}@${TEST_EMAIL_DOMAIN}`;
    const { error: invErr } = await owner.client
      .from("pending_invites")
      .insert({ group_id: group.id, email, invited_by: owner.id });
    expect(invErr).toBeNull();

    // Sign up with that exact email -> handle_new_user consumes the invite.
    const svc = serviceClient();
    const { data: created, error: signupErr } = await svc.auth.admin.createUser({
      email,
      password: "test-password-123!",
      email_confirm: true,
      user_metadata: { first_name: "New", last_name: "Comer", time_zone: "UTC" },
    });
    expect(signupErr).toBeNull();
    const newUserId = created.user!.id;

    // They are now an active member.
    const { data: membership } = await svc
      .from("group_members")
      .select("role, status")
      .eq("group_id", group.id)
      .eq("user_id", newUserId)
      .single();
    expect(membership).toMatchObject({ role: "member", status: "active" });

    // The pending invite was consumed (deleted).
    const { data: leftover } = await svc
      .from("pending_invites")
      .select("id")
      .eq("group_id", group.id)
      .eq("email", email);
    expect(leftover).toHaveLength(0);
  });

  it("matches pending invites case-insensitively (normalised on insert)", async () => {
    const owner = await newUserClient();
    const group = await createGroup(owner, "Crew");

    const mixed = `Mixed-${Date.now()}@${TEST_EMAIL_DOMAIN}`;
    await owner.client
      .from("pending_invites")
      .insert({ group_id: group.id, email: mixed.toUpperCase(), invited_by: owner.id });

    // Stored value is lower(trim()).
    const { data: stored } = await serviceClient()
      .from("pending_invites")
      .select("email")
      .eq("group_id", group.id)
      .single();
    expect(stored?.email).toBe(mixed.toLowerCase());

    const svc = serviceClient();
    const { data: created } = await svc.auth.admin.createUser({
      email: mixed.toLowerCase(),
      password: "test-password-123!",
      email_confirm: true,
      user_metadata: { first_name: "Case", last_name: "Insensitive" },
    });

    const { data: membership } = await svc
      .from("group_members")
      .select("status")
      .eq("group_id", group.id)
      .eq("user_id", created.user!.id);
    expect(membership).toHaveLength(1);
  });

  it("enforces (group_id, email) uniqueness on pending invites", async () => {
    const owner = await newUserClient();
    const group = await createGroup(owner, "Crew");
    const email = `dup-${Date.now()}@${TEST_EMAIL_DOMAIN}`;

    const first = await owner.client
      .from("pending_invites")
      .insert({ group_id: group.id, email, invited_by: owner.id });
    expect(first.error).toBeNull();

    const second = await owner.client
      .from("pending_invites")
      .insert({ group_id: group.id, email, invited_by: owner.id });
    expect(second.error).not.toBeNull(); // unique violation
  });

  it("forbids a non-admin from creating a pending invite", async () => {
    const owner = await newUserClient();
    const member = await newUserClient();
    const group = await createGroup(owner, "Crew");
    await owner.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: member.id });

    const { error } = await member.client.from("pending_invites").insert({
      group_id: group.id,
      email: `x-${Date.now()}@${TEST_EMAIL_DOMAIN}`,
      invited_by: member.id,
    });
    expect(error).not.toBeNull();
  });
});
