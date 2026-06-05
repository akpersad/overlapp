import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { card } from "@/lib/ui";
import { Heatmap } from "../../heatmap";
import { ProposeForm } from "./propose-form";

export const metadata = { title: "Propose a time · Overlapp" };

export default async function NewProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ title?: string; start?: string; end?: string }>;
}) {
  const { id } = await params;
  const { title, start, end } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, slot_minutes")
    .eq("id", id)
    .maybeSingle();
  if (!group) notFound();

  // Active members only may propose (RLS also enforces it).
  const { data: me } = await supabase
    .from("group_members")
    .select("status")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me || me.status !== "active") notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/groups/${id}`}
        className="text-sm text-ink-muted hover:underline"
      >
        ← {group.name}
      </Link>
      <h1 className="text-h1 text-ink">
        Propose a time
      </h1>
      <p className="text-body-sm text-ink-muted">
        Seed a few candidate slots. Use the group&apos;s availability on the
        right to pick times that already work — everyone marks which they can
        do, then you lock the winner.
      </p>
      {/* Form + a live reference heatmap so you can read the group's
          availability without leaving the page. Mobile: form first, heatmap
          reference below. Desktop: form left, heatmap right (sticky). */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className={card}>
          <ProposeForm
            groupId={group.id}
            initialTitle={title ?? ""}
            initialStart={start}
            initialEnd={end}
          />
        </div>
        <div className="flex flex-col gap-2 lg:sticky lg:top-4">
          <h2 className="text-sm font-semibold text-ink">
            Group availability
          </h2>
          <p className="text-xs text-ink-muted">
            When the group is free. Deeper = more people available. Read a slot
            here, then enter it on the left.
          </p>
          <div className={card}>
            <Heatmap
              groupId={group.id}
              slotMinutes={group.slot_minutes}
              initialView="week"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
