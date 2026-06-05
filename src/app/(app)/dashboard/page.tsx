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
        <h1 className="text-h1 text-ink">Your groups</h1>
        <Link href="/groups/new" className={btnPrimary}>
          + New group
        </Link>
      </div>

      {active.length === 0 && pending.length === 0 && (
        <div className={`${card} text-center`}>
          <p className="text-h3 text-ink">You&apos;re not in any groups yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
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
                  className={`${card} flex items-center justify-between transition-all duration-150 ease-soft hover:border-honey-300 hover:shadow-md`}
                >
                  <div>
                    <p className="text-h3 text-ink">{g.name}</p>
                    {g.description && (
                      <p className="text-sm text-ink-muted">{g.description}</p>
                    )}
                  </div>
                  {m.role !== "member" && (
                    <span className="rounded-full bg-honey-50 px-2.5 py-0.5 text-xs font-semibold text-honey-900">
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
          <h2 className="mb-2 text-label">Awaiting approval</h2>
          <ul className="flex flex-col gap-2">
            {pending.map((m) => (
              <li
                key={m.groups!.id}
                className={`${card} flex items-center justify-between opacity-70`}
              >
                <span className="text-ink">{m.groups!.name}</span>
                <span className="text-xs text-ink-subtle">Pending</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
