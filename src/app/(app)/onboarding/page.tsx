import { Avatar } from "@/components/Avatar";
import { InstallPrompt } from "@/components/InstallPrompt";
import { requireProfile } from "@/lib/auth";
import { card } from "@/lib/ui";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Welcome · Overlapp" };

export default async function OnboardingPage() {
  const profile = await requireProfile();

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar
          firstName={profile.first_name}
          lastName={profile.last_name}
          avatarUrl={profile.avatar_url}
          seed={profile.id}
          size={64}
        />
        <h1 className="text-h1 text-ink">
          Welcome to Overlapp
        </h1>
        <p className="text-sm text-ink-muted">
          A quick setup and you&apos;re in. Your initials avatar is ready — add a
          photo later if you like.
        </p>
      </div>
      <div className={card}>
        <OnboardingForm
          firstName={profile.first_name}
          lastName={profile.last_name}
          displayName={profile.display_name ?? ""}
          timeZone={profile.time_zone}
        />
      </div>
      <InstallPrompt />
    </div>
  );
}
