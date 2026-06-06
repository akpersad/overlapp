import Link from "next/link";

import { AuthCard } from "@/components/AuthCard";
import { btnSecondary } from "@/lib/ui";
import { ResendForm } from "./resend-form";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <AuthCard
      title="Check your email"
      subtitle="We sent you a confirmation link. Click it to finish setting up your account, then come back and sign in."
    >
      <div className="flex flex-col gap-4">
        <Link href="/login" className={btnSecondary}>
          Back to sign in
        </Link>
        <div className="border-t border-border pt-4">
          <p className="mb-3 text-sm text-ink-muted">Didn&apos;t get it?</p>
          <ResendForm email={email} />
        </div>
      </div>
    </AuthCard>
  );
}
