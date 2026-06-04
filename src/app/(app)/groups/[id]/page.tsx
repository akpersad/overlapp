import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { LocalTime } from "@/components/LocalTime";
import { requireUser } from "@/lib/auth";
import {
  approveMember,
  dissolveGroup,
  leaveGroup,
  removeMember,
  setMemberRole,
  transferOwnership,
} from "@/lib/actions/groups";
import { deleteRecurringHangout } from "@/lib/actions/hangouts";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/format";
import { describeRrule } from "@/lib/rrule";
import { btnDanger, btnSecondary, card } from "@/lib/ui";
import { Heatmap } from "./heatmap";
import { HangoutForm } from "./hangout-form";
import { InvitePanel } from "./invite-panel";

type ProfileLite = {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  avatar_url: string | null;
};

export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, description, slot_minutes, join_policy, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!group) notFound();

  const { data: me } = await supabase
    .from("group_members")
    .select("role, status")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me) notFound();

  // Awaiting approval — show a holding screen, not the group internals.
  if (me.status === "pending") {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:underline">
          ← Back
        </Link>
        <div className={`${card} text-center`}>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
            {group.name}
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Your request to join is awaiting an admin&apos;s approval.
          </p>
          <form action={leaveGroup} className="mt-4">
            <input type="hidden" name="group_id" value={group.id} />
            <button type="submit" className={btnSecondary}>
              Cancel request
            </button>
          </form>
        </div>
      </div>
    );
  }

  const isAdmin = me.role === "owner" || me.role === "admin";
  const isOwner = me.role === "owner";

  const { data: memberRows } = await supabase
    .from("group_members")
    .select(
      "user_id, role, status, profiles(id, first_name, last_name, display_name, avatar_url)",
    )
    .eq("group_id", id);

  const members = (memberRows ?? []).filter((m) => m.profiles);
  const active = members.filter((m) => m.status === "active");
  const pendingMembers = members.filter((m) => m.status === "pending");
  // Sort: owner, admins, members.
  const rank: Record<string, number> = { owner: 0, admin: 1, member: 2 };
  active.sort((a, b) => rank[a.role] - rank[b.role]);

  // Proposals (Phase 3). Newest first; locked ones show their chosen time.
  const { data: proposalRows } = await supabase
    .from("proposals")
    .select("id, title, status, created_by, final_option, created_at")
    .eq("group_id", id)
    .order("created_at", { ascending: false });
  const proposals = proposalRows ?? [];
  const finalOptionIds = proposals
    .map((p) => p.final_option)
    .filter((x): x is string => Boolean(x));
  const finalTimes = new Map<string, { starts_at: string; ends_at: string }>();
  if (finalOptionIds.length > 0) {
    const { data: opts } = await supabase
      .from("proposal_options")
      .select("id, starts_at, ends_at")
      .in("id", finalOptionIds);
    for (const o of opts ?? [])
      finalTimes.set(o.id, { starts_at: o.starts_at, ends_at: o.ends_at });
  }

  // Recurring hangouts (Phase 4). The definitions (for management) + concrete
  // upcoming occurrences (via the expander RPC), so each hangout can show its
  // next instance and seed a proposal from it.
  const { data: hangoutRows } = await supabase
    .from("recurring_hangouts")
    .select("id, title, description, rrule")
    .eq("group_id", id)
    .eq("active", true)
    .order("created_at", { ascending: true });
  const hangouts = hangoutRows ?? [];
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 90);
  const nextOccurrence = new Map<string, { occ_start: string; occ_end: string }>();
  if (hangouts.length > 0) {
    const { data: occ } = await supabase.rpc("upcoming_hangouts", {
      p_group_id: id,
      p_to: horizon.toISOString(),
    });
    // Rows are ordered by occ_start; keep the first (soonest) per hangout.
    for (const o of occ ?? []) {
      if (!nextOccurrence.has(o.hangout_id)) {
        nextOccurrence.set(o.hangout_id, {
          occ_start: o.occ_start,
          occ_end: o.occ_end,
        });
      }
    }
  }

  let invites: { id: string; token: string; use_count: number }[] = [];
  let pendingEmails: { id: string; email: string }[] = [];
  if (isAdmin) {
    const { data: inv } = await supabase
      .from("group_invites")
      .select("id, token, use_count")
      .eq("group_id", id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    invites = inv ?? [];
    const { data: pe } = await supabase
      .from("pending_invites")
      .select("id, email")
      .eq("group_id", id);
    pendingEmails = pe ?? [];
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:underline">
          ← All groups
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {group.name}
        </h1>
        {group.description && (
          <p className="text-zinc-600 dark:text-zinc-400">{group.description}</p>
        )}
      </div>

      {/* The hero: aggregated availability */}
      <section className={card}>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          When everyone&apos;s free
        </h2>
        <Heatmap groupId={group.id} slotMinutes={group.slot_minutes} />
        <p className="mt-3 text-xs text-zinc-500">
          Shown in your local time.{" "}
          <Link href="/availability" className="text-indigo-600 hover:underline">
            Update your availability →
          </Link>
        </p>
      </section>

      {/* Proposals (Phase 3 — multi-date scheduling) */}
      <section className={card}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Proposals
          </h2>
          <Link
            href={`/groups/${group.id}/proposals/new`}
            className={`${btnSecondary} !py-1 !text-xs`}
          >
            Propose a time
          </Link>
        </div>
        {proposals.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No proposals yet. Seed a few candidate times and let the group mark
            availability.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
            {proposals.map((p) => {
              const final = p.final_option
                ? finalTimes.get(p.final_option)
                : undefined;
              return (
                <li key={p.id}>
                  <Link
                    href={`/groups/${group.id}/proposals/${p.id}`}
                    className="flex items-center gap-3 py-2 hover:opacity-80"
                  >
                    <span className="text-sm text-zinc-800 dark:text-zinc-200">
                      {p.title}
                    </span>
                    <ProposalBadge status={p.status} />
                    {final && (
                      <span className="ml-auto text-xs text-zinc-500">
                        <LocalTime iso={final.starts_at} />
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Recurring hangouts (Phase 4 — regular groups) */}
      {(hangouts.length > 0 || isAdmin) && (
        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Recurring hangouts
          </h2>
          {hangouts.length === 0 ? (
            <p className="mb-3 text-sm text-zinc-500">
              Set up a standing get-together (e.g. game night every Friday).
              You can spin up a proposal from any upcoming date.
            </p>
          ) : (
            <ul className="mb-1 flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
              {hangouts.map((h) => {
                const next = nextOccurrence.get(h.id);
                return (
                  <li
                    key={h.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                  >
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {h.title}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {describeRrule(h.rrule)}
                    </span>
                    {next ? (
                      <span className="text-xs text-zinc-400">
                        next <LocalTime iso={next.occ_start} />
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">no upcoming dates</span>
                    )}
                    <div className="ml-auto flex items-center gap-3">
                      {next && (
                        <Link
                          href={`/groups/${group.id}/proposals/new?title=${encodeURIComponent(
                            h.title,
                          )}&start=${encodeURIComponent(
                            next.occ_start,
                          )}&end=${encodeURIComponent(next.occ_end)}`}
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          Propose this
                        </Link>
                      )}
                      {isAdmin && (
                        <form action={deleteRecurringHangout}>
                          <input type="hidden" name="hangout_id" value={h.id} />
                          <input type="hidden" name="group_id" value={group.id} />
                          <button className="text-xs text-red-600 hover:underline">
                            Remove
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {isAdmin && <HangoutForm groupId={group.id} />}
        </section>
      )}

      {/* Pending approvals (admins) */}
      {isAdmin && pendingMembers.length > 0 && (
        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Requests to join
          </h2>
          <ul className="flex flex-col gap-2">
            {pendingMembers.map((m) => {
              const p = m.profiles as ProfileLite;
              return (
                <li key={m.user_id} className="flex items-center gap-3">
                  <Avatar
                    firstName={p.first_name}
                    lastName={p.last_name}
                    avatarUrl={p.avatar_url}
                    seed={p.id}
                    size={32}
                  />
                  <span className="text-sm text-zinc-800 dark:text-zinc-200">
                    {displayName(p)}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <form action={approveMember}>
                      <input type="hidden" name="group_id" value={group.id} />
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <button className={`${btnSecondary} !py-1 !text-xs`}>
                        Approve
                      </button>
                    </form>
                    <form action={removeMember}>
                      <input type="hidden" name="group_id" value={group.id} />
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <button className="text-xs text-red-600 hover:underline">
                        Reject
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Members */}
      <section className={card}>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Members ({active.length})
        </h2>
        <ul className="flex flex-col gap-3">
          {active.map((m) => {
            const p = m.profiles as ProfileLite;
            const isSelf = m.user_id === user.id;
            return (
              <li key={m.user_id} className="flex items-center gap-3">
                <Avatar
                  firstName={p.first_name}
                  lastName={p.last_name}
                  avatarUrl={p.avatar_url}
                  seed={p.id}
                  size={32}
                />
                <span className="text-sm text-zinc-800 dark:text-zinc-200">
                  {displayName(p)}
                  {isSelf && <span className="text-zinc-400"> (you)</span>}
                </span>
                <span className="text-xs text-zinc-400">{m.role}</span>

                {isAdmin && m.role !== "owner" && !isSelf && (
                  <div className="ml-auto flex items-center gap-2">
                    {m.role === "member" ? (
                      <RoleForm
                        groupId={group.id}
                        userId={m.user_id}
                        role="admin"
                        label="Make admin"
                      />
                    ) : (
                      <RoleForm
                        groupId={group.id}
                        userId={m.user_id}
                        role="member"
                        label="Remove admin"
                      />
                    )}
                    {isOwner && (
                      <form action={transferOwnership}>
                        <input type="hidden" name="group_id" value={group.id} />
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <button className="text-xs text-zinc-500 hover:underline">
                          Make owner
                        </button>
                      </form>
                    )}
                    <form action={removeMember}>
                      <input type="hidden" name="group_id" value={group.id} />
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <button className="text-xs text-red-600 hover:underline">
                        Remove
                      </button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Invites (admins) */}
      {isAdmin && (
        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Invite people
          </h2>
          <InvitePanel
            groupId={group.id}
            groupName={group.name}
            invites={invites}
            pending={pendingEmails}
          />
        </section>
      )}

      {/* Danger zone */}
      <section className={card}>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {isOwner ? "Manage group" : "Leave"}
        </h2>
        <div className="flex flex-wrap gap-3">
          {isAdmin && (
            <Link href={`/groups/${group.id}/edit`} className={btnSecondary}>
              Edit settings
            </Link>
          )}
          {isOwner ? (
            <form action={dissolveGroup}>
              <input type="hidden" name="group_id" value={group.id} />
              <button className={btnDanger}>Dissolve group</button>
            </form>
          ) : (
            <form action={leaveGroup}>
              <input type="hidden" name="group_id" value={group.id} />
              <button className={btnDanger}>Leave group</button>
            </form>
          )}
        </div>
        {isOwner && (
          <p className="mt-2 text-xs text-zinc-500">
            To leave, transfer ownership to another member first, or dissolve the
            group.
          </p>
        )}
      </section>
    </div>
  );
}

function ProposalBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
    locked: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    cancelled: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
    draft: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        styles[status] ?? styles.draft
      }`}
    >
      {status}
    </span>
  );
}

function RoleForm({
  groupId,
  userId,
  role,
  label,
}: {
  groupId: string;
  userId: string;
  role: "admin" | "member";
  label: string;
}) {
  return (
    <form action={setMemberRole}>
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="role" value={role} />
      <button className="text-xs text-indigo-600 hover:underline">{label}</button>
    </form>
  );
}
