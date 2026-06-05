import { AppNav } from "@/components/AppNav";
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
      <AppNav profile={profile} />
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
