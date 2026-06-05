import Link from "next/link";

import { LocalTime } from "@/components/LocalTime";
import { requireUser } from "@/lib/auth";
import {
  deleteNotification,
  markAllNotificationsRead,
} from "@/lib/actions/notifications";
import { createClient } from "@/lib/supabase/server";
import { btnSecondary, card } from "@/lib/ui";

export const metadata = { title: "Inbox · Overlapp" };

export default async function NotificationsPage() {
  await requireUser();
  const supabase = await createClient();

  const { data: notifications } = await supabase
    .from("notifications")
    .select("id, kind, title, body, group_id, proposal_id, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const items = notifications ?? [];
  const hasUnread = items.some((n) => !n.read_at);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 text-ink">
          Inbox
        </h1>
        {hasUnread && (
          <form action={markAllNotificationsRead}>
            <button className={`${btnSecondary} !py-1 !text-xs`}>
              Mark all read
            </button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <div className={`${card} text-center text-sm text-ink-muted`}>
          Nothing here yet. Proposals and reminders show up in your inbox.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => {
            const href =
              n.group_id && n.proposal_id
                ? `/groups/${n.group_id}/proposals/${n.proposal_id}`
                : n.group_id
                  ? `/groups/${n.group_id}`
                  : null;
            const inner = (
              <div className="flex items-start gap-3">
                {!n.read_at && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-honey-500" />
                )}
                <div className={n.read_at ? "ml-5" : ""}>
                  <p className="text-sm font-medium text-ink">
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="text-xs text-ink-muted">{n.body}</p>
                  )}
                  <p className="text-[10px] text-ink-subtle tabular">
                    <LocalTime iso={n.created_at} />
                  </p>
                </div>
              </div>
            );
            return (
              <li
                key={n.id}
                className={`${card} flex items-center justify-between gap-3 !p-3 ${
                  n.read_at ? "opacity-70" : ""
                }`}
              >
                {href ? (
                  <Link href={href} className="flex-1 hover:opacity-80">
                    {inner}
                  </Link>
                ) : (
                  <div className="flex-1">{inner}</div>
                )}
                <form action={deleteNotification}>
                  <input type="hidden" name="notification_id" value={n.id} />
                  <button
                    className="text-xs text-ink-subtle hover:text-red-600"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
