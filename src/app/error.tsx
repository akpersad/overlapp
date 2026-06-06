"use client";

import Link from "next/link";
import { useEffect } from "react";

import { AuthCard } from "@/components/AuthCard";
import { btnPrimary, btnSecondary } from "@/lib/ui";

// Root error boundary — catches thrown errors in Server Components / Server
// Actions below the root layout, so the user sees a branded card with a retry
// instead of Next's unstyled default. The root layout (nav, fonts) stays
// mounted; `global-error.tsx` is the deeper fallback if the layout itself fails.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for server logs / future error reporting; details are never shown
    // to the user (only the opaque digest, if any).
    console.error(error);
  }, [error]);

  return (
    <AuthCard
      title="Something went wrong"
      subtitle="An unexpected error occurred on our end. Try again — if it keeps happening, head back to your dashboard."
    >
      <div className="flex flex-col gap-3">
        <button type="button" onClick={reset} className={btnPrimary}>
          Try again
        </button>
        <Link href="/dashboard" className={btnSecondary}>
          Go to your dashboard
        </Link>
        {error.digest && (
          <p className="text-center text-xs text-ink-subtle">Reference: {error.digest}</p>
        )}
      </div>
    </AuthCard>
  );
}
