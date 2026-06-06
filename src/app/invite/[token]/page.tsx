import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/AuthCard";
import { getUser } from "@/lib/auth";
import { redeemInvite } from "@/lib/actions/groups";
import { createClient } from "@/lib/supabase/server";
import { btnPrimary, btnSecondary } from "@/lib/ui";

// Link-preview card for the invite. This is what turns a bare URL pasted into
// iMessage/WhatsApp/Slack into a contextual card with the inviter + group name.
// Uses only the anon-callable preview RPC — never leaks the roster (spec §Access).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invite_preview", { p_token: token });
  const preview = Array.isArray(data) ? data[0] : data;

  if (!preview) {
    return {
      title: "Join a group on Overlapp",
      description: "This invite link is invalid, expired, or has been revoked.",
    };
  }

  const title = `${preview.inviter_name} invited you to “${preview.group_name}”`;
  const description =
    "Join on Overlapp — a shared group calendar that shows when everyone's free. " +
    "No more “let me check my calendar.”";

  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: "Overlapp",
      title,
      description,
      url: `/invite/${token}`,
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
  };
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  // get_invite_preview is anon-callable and returns ONLY name + inviter +
  // member count + policy — never the roster or any availability (spec §Access).
  const { data } = await supabase.rpc("get_invite_preview", { p_token: token });
  const preview = Array.isArray(data) ? data[0] : data;

  if (!preview) {
    return (
      <AuthCard
        title="Invite not found"
        subtitle="This invite link is invalid, expired, or has been revoked."
      >
        <Link href="/" className={btnSecondary}>
          Go home
        </Link>
      </AuthCard>
    );
  }

  const user = await getUser();
  const next = `/invite/${token}`;

  // Logged-in: redeem on click (idempotent). Bound token is safe to close over.
  async function join() {
    "use server";
    const { groupId } = await redeemInvite(token);
    redirect(`/groups/${groupId}`);
  }

  const approval = preview.join_policy === "approval";

  return (
    <AuthCard
      title={preview.group_name}
      subtitle={`${preview.inviter_name} invited you · ${preview.member_count} member${
        preview.member_count === 1 ? "" : "s"
      }`}
    >
      {user ? (
        <form action={join} className="flex flex-col gap-3">
          <button type="submit" className={btnPrimary}>
            {approval ? "Request to join" : "Join group"}
          </button>
          {approval && (
            <p className="text-center text-xs text-ink-muted">
              An admin will approve your request.
            </p>
          )}
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">
            Sign up or log in to join.
          </p>
          <Link
            href={`/signup?redirectTo=${encodeURIComponent(next)}`}
            className={btnPrimary}
          >
            Sign up to join
          </Link>
          <Link
            href={`/login?redirectTo=${encodeURIComponent(next)}`}
            className={btnSecondary}
          >
            I already have an account
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
