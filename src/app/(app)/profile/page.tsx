import Link from "next/link";

import { signOut } from "@/lib/actions/auth";
import { requireProfile, requireUser } from "@/lib/auth";
import { displayName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { btnSecondary, card } from "@/lib/ui";
import { PushToggle } from "@/components/PushToggle";
import { AvatarUpload } from "./avatar-upload";
import { DeleteAccount, type OwnedGroup } from "./delete-account";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Profile · Overlapp" };

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await requireProfile();
  const supabase = await createClient();

  // Groups this account owns. On deletion the user can transfer each to another
  // active member (keeping it alive) or let it dissolve, so we gather the
  // eligible new owners per group for the delete confirmation UI.
  const { data: owned } = await supabase
    .from("groups")
    .select("id, name")
    .eq("owner_id", user.id)
    .is("deleted_at", null);

  let ownedGroups: OwnedGroup[] = [];
  if (owned && owned.length > 0) {
    const { data: members } = await supabase
      .from("group_members")
      .select(
        "group_id, user_id, role, profiles(first_name, last_name, display_name)",
      )
      .in(
        "group_id",
        owned.map((g) => g.id),
      )
      .eq("status", "active")
      .neq("user_id", user.id);

    ownedGroups = owned.map((g) => ({
      id: g.id,
      name: g.name,
      candidates: (members ?? [])
        .filter((m) => m.group_id === g.id)
        // Prefer existing admins as the default transfer target.
        .sort((a, b) => (a.role === "admin" ? -1 : 1) - (b.role === "admin" ? -1 : 1))
        .map((m) => ({
          userId: m.user_id,
          name: displayName(m.profiles ?? {}),
        })),
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 text-ink">
        Profile
      </h1>

      <div className={card}>
        <h2 className="mb-3 text-h3 text-ink">
          Photo
        </h2>
        <AvatarUpload
          firstName={profile.first_name}
          lastName={profile.last_name}
          avatarUrl={profile.avatar_url}
          seed={profile.id}
        />
        <p className="mt-3 text-sm text-ink-muted">{profile.email}</p>
      </div>

      <div className={card}>
        <ProfileForm
          firstName={profile.first_name}
          lastName={profile.last_name}
          displayName={profile.display_name ?? ""}
          timeZone={profile.time_zone}
        />
      </div>

      <div className={card}>
        <h2 className="mb-1 text-h3 text-ink">
          Calendars
        </h2>
        <p className="mb-3 text-sm text-ink-muted">
          Connect Google Calendar so your busy time fills in automatically.
        </p>
        <Link href="/calendars" className={btnSecondary}>
          Manage calendars →
        </Link>
      </div>

      <div className={card}>
        <h2 className="mb-3 text-h3 text-ink">
          Notifications
        </h2>
        <PushToggle />
      </div>

      <div className={card}>
        <h2 className="mb-3 text-h3 text-ink">
          Account
        </h2>
        <form action={signOut}>
          <button type="submit" className={btnSecondary}>
            Sign out
          </button>
        </form>
      </div>

      <div className={card}>
        <h2 className="mb-3 text-sm font-semibold text-red-700 dark:text-red-400">
          Danger zone
        </h2>
        <DeleteAccount ownedGroups={ownedGroups} />
      </div>
    </div>
  );
}
