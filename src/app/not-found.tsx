import Link from "next/link";

import { AuthCard } from "@/components/AuthCard";
import { btnPrimary } from "@/lib/ui";

// Root 404 — shown for unknown URLs and for `notFound()` calls (e.g. a revoked
// invite or a deleted/bookmarked group). Styled with the Phase-7 tokens so it
// never falls back to Next's unbranded default.
export default function NotFound() {
  return (
    <AuthCard
      title="Page not found"
      subtitle="That link may be broken, expired, or point to something that's no longer here."
    >
      <Link href="/dashboard" className={btnPrimary}>
        Go to your dashboard
      </Link>
    </AuthCard>
  );
}
