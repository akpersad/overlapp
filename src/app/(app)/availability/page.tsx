import Link from "next/link";

import { LocalTime } from "@/components/LocalTime";
import { deleteBlock } from "@/lib/actions/blocks";
import { requireUser } from "@/lib/auth";
import { describeRrule } from "@/lib/rrule";
import { createClient } from "@/lib/supabase/server";
import { card } from "@/lib/ui";
import { BlockForm } from "./block-form";

export const metadata = { title: "Availability · Overlapp" };

export default async function AvailabilityPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: blocks } = await supabase
    .from("manual_blocks")
    .select("id, label, starts_at, ends_at, rrule")
    .eq("user_id", user.id)
    .order("starts_at", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 text-ink">
          Your availability
        </h1>
        <p className="text-sm text-ink-muted">
          Block out time you&apos;re not free. This feeds every group&apos;s
          heatmap — others only see{" "}
          <em>when</em> you&apos;re busy, never the label. Want it filled in
          automatically?{" "}
          <Link href="/calendars" className="text-honey-700 hover:underline">
            Connect a calendar →
          </Link>
        </p>
      </div>

      <section className={card}>
        <h2 className="mb-3 text-h3 text-ink">
          Add a block
        </h2>
        <BlockForm />
      </section>

      <section className={card}>
        <h2 className="mb-3 text-h3 text-ink">
          Blocked time ({blocks?.length ?? 0})
        </h2>
        {!blocks || blocks.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nothing blocked yet — you&apos;re wide open.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">
                    {b.label || "Busy"}
                  </p>
                  <p className="text-xs text-ink-muted tabular">
                    <LocalTime iso={b.starts_at} />
                    {" – "}
                    <LocalTime iso={b.ends_at} withDate={false} />
                    {" · "}
                    {describeRrule(b.rrule)}
                  </p>
                </div>
                <form action={deleteBlock} className="ml-auto">
                  <input type="hidden" name="block_id" value={b.id} />
                  <button className="text-xs text-red-600 hover:underline">
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
