import Link from "next/link";

import { AuthCard } from "@/components/AuthCard";
import { getUser } from "@/lib/auth";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage() {
  // The recovery link (verified by /auth/confirm) mints a session before we get
  // here. No session → the link was never followed, or it expired.
  const user = await getUser();

  if (!user) {
    return (
      <AuthCard
        title="Link expired"
        subtitle="This password-reset link is no longer valid. Request a fresh one and try again."
      >
        <Link href="/forgot-password" className="text-center text-sm font-medium text-honey-700">
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" subtitle="Pick something you'll remember.">
      <ResetPasswordForm />
    </AuthCard>
  );
}
