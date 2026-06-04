import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { card } from "@/lib/ui";
import { EditGroupForm } from "./edit-group-form";

export const metadata = { title: "Group settings · Overlapp" };

export default async function EditGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, name, description, slot_minutes, join_policy")
    .eq("id", id)
    .maybeSingle();
  if (!group) notFound();

  // Only admins/owner may edit (RLS also enforces the write).
  const { data: me } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me || (me.role !== "owner" && me.role !== "admin")) {
    redirect(`/groups/${id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/groups/${id}`} className="text-sm text-zinc-500 hover:underline">
        ← Back to group
      </Link>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Group settings
      </h1>
      <div className={card}>
        <EditGroupForm group={group} />
      </div>
    </div>
  );
}
