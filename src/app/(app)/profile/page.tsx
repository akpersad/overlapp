import { Avatar } from "@/components/Avatar";
import { signOut } from "@/lib/actions/auth";
import { requireProfile } from "@/lib/auth";
import { displayName } from "@/lib/format";
import { btnSecondary, card } from "@/lib/ui";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Profile · Overlapp" };

export default async function ProfilePage() {
  const profile = await requireProfile();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Profile
      </h1>

      <div className={`${card} flex items-center gap-4`}>
        <Avatar
          firstName={profile.first_name}
          lastName={profile.last_name}
          avatarUrl={profile.avatar_url}
          seed={profile.id}
          size={56}
        />
        <div>
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">
            {displayName(profile)}
          </p>
          <p className="text-sm text-zinc-500">{profile.email}</p>
        </div>
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
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Account
        </h2>
        <form action={signOut}>
          <button type="submit" className={btnSecondary}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
