import Link from "next/link";

import { Avatar } from "@/components/Avatar";
import { signOut } from "@/lib/actions/auth";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

// Top navigation for authenticated pages. Server component — the sign-out
// button posts to the signOut Server Action. Also surfaces the unread
// notification count (spec §7).
export async function AppNav({ profile }: { profile: Tables<"profiles"> }) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  const unread = count ?? 0;

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/85 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-5">
          <Link
            href="/dashboard"
            className="font-display text-lg font-extrabold tracking-tight text-honey-700"
          >
            Overlapp
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Groups
          </Link>
          <Link
            href="/availability"
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Availability
          </Link>
          <Link
            href="/calendars"
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Calendars
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/notifications"
            title="Notifications"
            className="relative text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Inbox
            {unread > 0 && (
              <span className="absolute -right-3 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-honey-500 px-1 text-[10px] font-semibold text-ink">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-ink-subtle transition-colors hover:text-ink"
            >
              Sign out
            </button>
          </form>
          <Link href="/profile" title="Profile">
            <Avatar
              firstName={profile.first_name}
              lastName={profile.last_name}
              avatarUrl={profile.avatar_url}
              seed={profile.id}
              size={32}
            />
          </Link>
        </div>
      </nav>
    </header>
  );
}
