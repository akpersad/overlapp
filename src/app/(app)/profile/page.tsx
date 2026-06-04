import Link from "next/link";

import { signOut } from "@/lib/actions/auth";
import { requireProfile, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { btnSecondary, card } from "@/lib/ui";
import { AvatarUpload } from "./avatar-upload";
import { DeleteAccount } from "./delete-account";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Profile · Overlapp" };

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await requireProfile();
  const supabase = await createClient();

  // How many groups would be dissolved if this account were deleted.
  const { count: ownedGroups } = await supabase
    .from("groups")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Profile
      </h1>

      <div className={card}>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Photo
        </h2>
        <AvatarUpload
          firstName={profile.first_name}
          lastName={profile.last_name}
          avatarUrl={profile.avatar_url}
          seed={profile.id}
        />
        <p className="mt-3 text-sm text-zinc-500">{profile.email}</p>
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
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Calendars
        </h2>
        <p className="mb-3 text-sm text-zinc-500">
          Connect Google Calendar so your busy time fills in automatically.
        </p>
        <Link href="/calendars" className={btnSecondary}>
          Manage calendars →
        </Link>
      </div>

      <div className={card}>
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
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
        <DeleteAccount ownedGroups={ownedGroups ?? 0} />
      </div>
    </div>
  );
}
