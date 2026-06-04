import Link from "next/link";

import { AuthCard } from "@/components/AuthCard";
import { btnSecondary } from "@/lib/ui";

export default function VerifyEmailPage() {
  return (
    <AuthCard
      title="Check your email"
      subtitle="We sent you a confirmation link. Click it to finish setting up your account, then come back and sign in."
    >
      <Link href="/login" className={btnSecondary}>
        Back to sign in
      </Link>
    </AuthCard>
  );
}
