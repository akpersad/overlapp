import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { requireUser } from "@/lib/auth";
import {
  approveMember,
  dissolveGroup,
  leaveGroup,
  removeMember,
  setMemberRole,
  transferOwnership,
} from "@/lib/actions/groups";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/format";
import { btnDanger, btnSecondary, card } from "@/lib/ui";
import { Heatmap } from "./heatmap";
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
