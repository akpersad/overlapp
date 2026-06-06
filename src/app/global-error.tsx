"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

import "./globals.css";
import { btnPrimary } from "@/lib/ui";

// Last-resort boundary: catches errors thrown in the root layout itself, so it
// must render its own <html>/<body> (it replaces the root layout). Kept minimal
// and self-contained; the display fonts (injected by the root layout) won't be
// present, but the design tokens from globals.css still apply for brand colour.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-dvh flex flex-col items-center justify-center bg-bg px-4 text-ink">
        <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-5 shadow-sm text-center">
          <h1 className="text-h2 text-ink">Something went wrong</h1>
          <p className="mt-1 mb-4 text-body-sm text-ink-muted">
            The app hit an unexpected error. Reload to try again.
          </p>
          <button type="button" onClick={reset} className={`${btnPrimary} w-full`}>
            Reload
          </button>
          {error.digest && (
            <p className="mt-3 text-xs text-ink-subtle">Reference: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
