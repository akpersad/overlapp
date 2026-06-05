import Link from "next/link";

import { btnPrimary, card } from "@/lib/ui";

// Offline fallback (Phase 4). The service worker serves this when a navigation
// fails and no cached copy of the requested page exists. Kept public + dependency
// -free so it renders with zero network. The group calendar itself stays usable
// offline via the client-side heatmap cache (see heatmap.tsx); this is the
// last-resort shell for pages that were never visited online.
export const metadata = { title: "Offline — Overlapp" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
      <div className={`${card} w-full`}>
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-honey-100" />
        <h1 className="text-h2 text-ink">
          You&apos;re offline
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Overlapp can&apos;t reach the network right now. Group calendars you
          opened recently are still viewable; everything else will load again
          once you&apos;re back online.
        </p>
        <Link href="/dashboard" className={`${btnPrimary} mt-5`}>
          Try again
        </Link>
      </div>
    </main>
  );
}
