import { AppNav } from "@/components/AppNav";
import { AnalyticsIdentify } from "@/components/AnalyticsIdentify";
import { requireProfile } from "@/lib/auth";

// Shared shell for all authenticated app pages. requireProfile() redirects to
// /login when there's no session (defense in depth alongside the proxy + RLS).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="min-h-dvh bg-bg">
      <AnalyticsIdentify userId={profile.id} />
      <AppNav profile={profile} />
      {/* pb clears the fixed mobile bottom-nav (+ iOS safe area); normal on sm+. */}
      <main className="mx-auto max-w-3xl px-4 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-6">
        {children}
      </main>
    </div>
  );
}
