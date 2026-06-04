import { beforeEach, describe, expect, it } from "vitest";

import {
  createGroup,
  newUserClient,
  resetData,
  type TestUser,
} from "./_helpers";

// Feature: multi-date proposals (DATA-MODEL.md §10, spec §6). Exercises the
// create/lock/cancel RPCs, the per-option tally + quorum verdict
// (proposal_results), the availability-based pre-fill (suggest_proposal_rsvps),
// and the response RLS — all through the real client/RLS path.

const OPT_A = { starts_at: "2026-07-01T18:00:00Z", ends_at: "2026-07-01T19:00:00Z" };
const OPT_B = { starts_at: "2026-07-02T18:00:00Z", ends_at: "2026-07-02T19:00:00Z" };

/** Owner + N extra active members in one group. */
async function groupWithMembers(memberCount: number) {
  const owner = await newUserClient();
  const group = await createGroup(owner, "Crew");
  const members: TestUser[] = [];
  for (let i = 0; i < memberCount; i++) {
    const m = await newUserClient();
    await owner.client
      .from("group_members")
      .insert({ group_id: group.id, user_id: m.id });
    members.push(m);
  }
  return { owner, group, members };
}

async function createProposal(
  user: TestUser,
  groupId: string,
  options = [OPT_A, OPT_B],
) {
  const { data, error } = await user.client.rpc("create_proposal", {
    p_group_id: groupId,
    p_title: "Dinner",
    p_description: "",
    p_pinned_tz: "",
    p_options: options,
  });
  if (error) throw error;
  return data as string;
}

describe("create_proposal — membership-gated, atomic", () => {
  beforeEach(resetData);

  it("creates a proposal with its options for a member", async () => {
    const { owner, group } = await groupWithMembers(0);
    const proposalId = await createProposal(owner, group.id);

    const { data: proposal } = await owner.client
      .from("proposals")
      .select("id, status, created_by")
      .eq("id", proposalId)
      .single();
    expect(proposal?.status).toBe("open");
    expect(proposal?.created_by).toBe(owner.id);

    const { data: options } = await owner.client
      .from("proposal_options")
      .select("starts_at")
      .eq("proposal_id", proposalId);
    expect(options).toHaveLength(2);
  });

  it("forbids a non-member from creating a proposal", async () => {
    const { group } = await groupWithMembers(0);
    const stranger = await newUserClient();
    const { error } = await stranger.client.rpc("create_proposal", {
      p_group_id: group.id,
      p_title: "Sneaky",
      p_description: "",
      p_pinned_tz: "",
      p_options: [OPT_A],
    });
    expect(error).not.toBeNull();
  });

  it("rejects an empty option set", async () => {
    const { owner, group } = await groupWithMembers(0);
    const { error } = await owner.client.rpc("create_proposal", {
      p_group_id: group.id,
      p_title: "No times",
      p_description: "",
      p_pinned_tz: "",
      p_options: [],
    });
    expect(error).not.toBeNull();
  });

  it("hides a group's proposals from a non-member (RLS)", async () => {
    const { owner, group } = await groupWithMembers(0);
    await createProposal(owner, group.id);
    const stranger = await newUserClient();
    const { data } = await stranger.client
      .from("proposals")
      .select("id")
      .eq("group_id", group.id);
    expect(data).toHaveLength(0);
  });
});

describe("proposal_responses — self-only RLS", () => {
  beforeEach(resetData);

  it("lets a member upsert their own response, blocks writing another's", async () => {
    const { owner, group, members } = await groupWithMembers(1);
    const member = members[0];
    const proposalId = await createProposal(owner, group.id);
    const { data: options } = await owner.client
      .from("proposal_options")
      .select("id")
      .eq("proposal_id", proposalId);
    const optionId = options![0].id;

    const { error: ok } = await member.client.from("proposal_responses").insert({
      proposal_id: proposalId,
      option_id: optionId,
      user_id: member.id,
      response: "yes",
    });
    expect(ok).toBeNull();

    // Writing a response on someone else's behalf is rejected (WITH CHECK).
    const { error: bad } = await member.client.from("proposal_responses").insert({
      proposal_id: proposalId,
      option_id: optionId,
      user_id: owner.id,
      response: "yes",
    });
    expect(bad).not.toBeNull();
  });
});

describe("proposal_results — tally + quorum verdict", () => {
  beforeEach(resetData);

  it("counts yes/no/maybe and flags quorum", async () => {
    // 3 members total (owner + 2). Quorum = 2.
    const { owner, group, members } = await groupWithMembers(2);
    await owner.client.from("groups").update({ quorum: 2 }).eq("id", group.id);

    const proposalId = await createProposal(owner, group.id);
    const { data: options } = await owner.client
      .from("proposal_options")
      .select("id, starts_at")
      .eq("proposal_id", proposalId)
      .order("starts_at");
    const a = options![0].id;
    const b = options![1].id;

    // Option A: owner + member0 say yes (2 yes → meets quorum 2). member1 no.
    await owner.client.from("proposal_responses").insert({ proposal_id: proposalId, option_id: a, user_id: owner.id, response: "yes" });
    await members[0].client.from("proposal_responses").insert({ proposal_id: proposalId, option_id: a, user_id: members[0].id, response: "yes" });
    await members[1].client.from("proposal_responses").insert({ proposal_id: proposalId, option_id: a, user_id: members[1].id, response: "no" });
    // Option B: only owner yes (1 yes → below quorum).
    await owner.client.from("proposal_responses").insert({ proposal_id: proposalId, option_id: b, user_id: owner.id, response: "yes" });

    const { data, error } = await owner.client.rpc("proposal_results", {
      p_proposal_id: proposalId,
    });
    expect(error).toBeNull();
    const byOption = Object.fromEntries(data!.map((r) => [r.option_id, r]));
    expect(byOption[a]).toMatchObject({
      yes_count: 2,
      no_count: 1,
      available_count: 2,
      total_members: 3,
      quorum: 2,
      meets_quorum: true,
    });
    expect(byOption[b]).toMatchObject({
      yes_count: 1,
      meets_quorum: false,
    });
  });
});

describe("suggest_proposal_rsvps — availability pre-fill", () => {
  beforeEach(resetData);

  it("suggests 'no' for options that overlap the caller's busy time", async () => {
    const { owner, group } = await groupWithMembers(0);
    const proposalId = await createProposal(owner, group.id);
    // Owner is busy during OPT_A but free during OPT_B.
    await owner.client.from("manual_blocks").insert({
      user_id: owner.id,
      starts_at: OPT_A.starts_at,
      ends_at: OPT_A.ends_at,
    });

    const { data: options } = await owner.client
      .from("proposal_options")
      .select("id, starts_at")
      .eq("proposal_id", proposalId)
      .order("starts_at");

    const { data, error } = await owner.client.rpc("suggest_proposal_rsvps", {
      p_proposal_id: proposalId,
    });
    expect(error).toBeNull();
    const byOption = Object.fromEntries(data!.map((r) => [r.option_id, r.suggested]));
    expect(byOption[options![0].id]).toBe("no"); // OPT_A — busy
    expect(byOption[options![1].id]).toBe("yes"); // OPT_B — free
  });
});

describe("lock_proposal / cancel_proposal — manager-gated", () => {
  beforeEach(resetData);

  it("lets the proposer lock the final option, others cannot", async () => {
    const { group, members } = await groupWithMembers(2);
    // The proposer is a plain member (not admin).
    const proposer = members[0];
    const other = members[1];
    const proposalId = await createProposal(proposer, group.id);
    const { data: options } = await proposer.client
      .from("proposal_options")
      .select("id")
      .eq("proposal_id", proposalId);
    const optionId = options![0].id;

    // A non-manager member cannot lock.
    const { error: denied } = await other.client.rpc("lock_proposal", {
      p_proposal_id: proposalId,
      p_option_id: optionId,
    });
    expect(denied).not.toBeNull();

    // The proposer can.
    const { error: ok } = await proposer.client.rpc("lock_proposal", {
      p_proposal_id: proposalId,
      p_option_id: optionId,
    });
    expect(ok).toBeNull();

    const { data: locked } = await proposer.client
      .from("proposals")
      .select("status, final_option")
      .eq("id", proposalId)
      .single();
    expect(locked?.status).toBe("locked");
    expect(locked?.final_option).toBe(optionId);
  });

  it("lets an admin lock someone else's proposal", async () => {
    const { owner, group, members } = await groupWithMembers(1);
    const proposalId = await createProposal(members[0], group.id);
    const { data: options } = await owner.client
      .from("proposal_options")
      .select("id")
      .eq("proposal_id", proposalId);

    const { error } = await owner.client.rpc("lock_proposal", {
      p_proposal_id: proposalId,
      p_option_id: options![0].id,
    });
    expect(error).toBeNull();
  });

  it("rejects locking an option from a different proposal", async () => {
    const { owner, group } = await groupWithMembers(0);
    const p1 = await createProposal(owner, group.id);
    const p2 = await createProposal(owner, group.id);
    const { data: p2opts } = await owner.client
      .from("proposal_options")
      .select("id")
      .eq("proposal_id", p2);

    const { error } = await owner.client.rpc("lock_proposal", {
      p_proposal_id: p1,
      p_option_id: p2opts![0].id,
    });
    expect(error).not.toBeNull();
  });

  it("lets the proposer cancel", async () => {
    const { owner, group } = await groupWithMembers(0);
    const proposalId = await createProposal(owner, group.id);
    const { error } = await owner.client.rpc("cancel_proposal", {
      p_proposal_id: proposalId,
    });
    expect(error).toBeNull();
    const { data } = await owner.client
      .from("proposals")
      .select("status")
      .eq("id", proposalId)
      .single();
    expect(data?.status).toBe("cancelled");
  });
});

describe("group_heatmap — quorum verdict (Phase 3)", () => {
  beforeEach(resetData);

  it("flags meets_quorum when free_count reaches a sub-everyone quorum", async () => {
    const { owner, group, members } = await groupWithMembers(1); // 2 members
    await owner.client.from("groups").update({ quorum: 1 }).eq("id", group.id);

    // Owner busy 10–11; member free. free_count = 1, quorum = 1.
    await owner.client.from("manual_blocks").insert({
      user_id: owner.id,
      starts_at: "2026-07-01T10:00:00Z",
      ends_at: "2026-07-01T11:00:00Z",
    });

    const { data, error } = await members[0].client.rpc("group_heatmap", {
      p_group_id: group.id,
      p_from: "2026-07-01T10:00:00Z",
      p_to: "2026-07-01T11:00:00Z",
      p_slot_minutes: 60,
    });
    expect(error).toBeNull();
    expect(data![0]).toMatchObject({
      busy_count: 1,
      free_count: 1,
      total_members: 2,
      everyone_free: false,
      quorum: 1,
      meets_quorum: true,
    });
  });
});
