import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { btnPrimary, card } from "@/lib/ui";

export const metadata = { title: "Your groups · Overlapp" };

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from("group_members")
    .select("role, status, groups(id, name, description)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });

  // RLS-visible rows where the joined group still exists (not soft-deleted).
  const rows = (memberships ?? []).filter((m) => m.groups);
  const active = rows.filter((m) => m.status === "active");
  const pending = rows.filter((m) => m.status === "pending");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Your groups
        </h1>
        <Link href="/groups/new" className={btnPrimary}>
          + New group
        </Link>
      </div>

      {active.length === 0 && pending.length === 0 && (
        <div className={`${card} text-center`}>
          <p className="text-zinc-600 dark:text-zinc-400">
            You&apos;re not in any groups yet.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Create one and invite your crew — their availability shows up the
            moment they join.
          </p>
          <Link href="/groups/new" className={`${btnPrimary} mt-4`}>
            Create your first group
          </Link>
        </div>
      )}

      {active.length > 0 && (
        <ul className="flex flex-col gap-3">
          {active.map((m) => {
            const g = m.groups!;
            return (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.id}`}
                  className={`${card} flex items-center justify-between transition-colors hover:border-indigo-400`}
                >
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                      {g.name}
                    </p>
                    {g.description && (
                      <p className="text-sm text-zinc-500">{g.description}</p>
                    )}
                  </div>
                  {m.role !== "member" && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      {m.role}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {pending.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">
            Awaiting approval
          </h2>
          <ul className="flex flex-col gap-2">
            {pending.map((m) => (
              <li
                key={m.groups!.id}
                className={`${card} flex items-center justify-between opacity-70`}
              >
                <span className="text-zinc-700 dark:text-zinc-300">
                  {m.groups!.name}
                </span>
                <span className="text-xs text-zinc-500">Pending</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
