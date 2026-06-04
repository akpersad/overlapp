import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { card } from "@/lib/ui";
import { ProposeForm } from "./propose-form";

export const metadata = { title: "Propose a time · Overlapp" };

export default async function NewProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name")
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
        className="text-sm text-zinc-500 hover:underline"
      >
        ← {group.name}
      </Link>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Propose a time
      </h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Seed a few candidate slots. Everyone marks which work for them, then you
        lock the winner.
      </p>
      <div className={card}>
        <ProposeForm groupId={group.id} />
      </div>
    </div>
  );
}
