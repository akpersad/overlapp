import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { card } from "@/lib/ui";
import { CreateGroupForm } from "./create-group-form";

export const metadata = { title: "New group · Overlapp" };

export default async function NewGroupPage() {
  await requireUser();
  return (
    <div className="flex flex-col gap-4">
      <Link href="/dashboard" className="text-sm text-ink-muted hover:underline">
        ← Back
      </Link>
      <h1 className="text-h1 text-ink">
        Create a group
      </h1>
      <div className={card}>
        <CreateGroupForm />
      </div>
    </div>
  );
}
