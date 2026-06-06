import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProposeWorkspace } from "./propose-workspace";

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
        Open a day on the group&apos;s availability, then drag across the times
        you want — each drag seeds a candidate. Everyone marks which they can do,
        then you lock the winner.
      </p>
      {/* Form left, interactive heatmap right (sticky). Drag a range on the
          calendar to seed a candidate; the form fields stay editable. They
          share one drafts state via ProposeWorkspace. */}
      <ProposeWorkspace
        groupId={group.id}
        slotMinutes={group.slot_minutes}
        initialTitle={title ?? ""}
        initialStart={start}
        initialEnd={end}
      />
    </div>
  );
}
