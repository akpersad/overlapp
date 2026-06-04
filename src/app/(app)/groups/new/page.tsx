import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { card } from "@/lib/ui";
import { CreateGroupForm } from "./create-group-form";

export const metadata = { title: "New group · Overlapp" };

export default async function NewGroupPage() {
  await requireUser();
  return (
    <div className="flex flex-col gap-4">
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:underline">
        ← Back
      </Link>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Create a group
      </h1>
      <div className={card}>
        <CreateGroupForm />
      </div>
    </div>
  );
}
