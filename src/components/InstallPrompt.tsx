"use client";

import { useEffect, useState } from "react";

import { PushToggle } from "@/components/PushToggle";
import { card } from "@/lib/ui";

// Onboarding install + push prompt (Phase 4, spec §Onboarding). Push permission
// is gated by the browser behind installation on iOS, so we only surface the
// push opt-in when the app is running as an installed PWA (display-mode:
// standalone). Otherwise we show step-by-step "add to home screen" guidance with
// the platform-appropriate gestures (the iOS Share / Add-to-Home glyphs are the
// bit people get stuck on). Either way it's skippable — nothing here blocks
// finishing onboarding.

type Mode = "loading" | "installed" | "browser";

// The iOS toolbar "Share" glyph — square with an up-arrow. Inline so a step can
// point at the exact icon the user is hunting for.
function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="inline-block size-4 -translate-y-px align-middle text-honey-700"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </svg>
  );
}

// The "Add to Home Screen" glyph — square with a plus.
function AddGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="inline-block size-4 -translate-y-px align-middle text-honey-700"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-honey-100 text-[11px] font-semibold text-honey-900 tabular">
        {n}
      </span>
      <span className="text-xs leading-relaxed text-ink-muted">{children}</span>
    </li>
  );
}

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>("loading");
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari exposes navigator.standalone instead of display-mode.
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    // One-shot read of browser-only APIs (no SSR equivalent) into state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(standalone ? "installed" : "browser");
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
  }, []);

  if (mode === "loading") return null;

  if (mode === "installed") {
    return (
      <div className={card}>
        <h2 className="mb-1 text-sm font-semibold text-ink">Stay in the loop</h2>
        <p className="mb-3 text-xs text-ink-muted">
          Get notified when someone proposes a time or an event is locked.
        </p>
        <PushToggle compact />
      </div>
    );
  }

  // Not installed: walk through adding to the home screen (where push is
  // enabled). Numbered steps, in-card — guided but skippable.
  return (
    <div className={card}>
      <h2 className="mb-1 text-sm font-semibold text-ink">
        Add Overlapp to your home screen
      </h2>
      <p className="mb-3 text-xs text-ink-muted">
        It opens full-screen like a real app and unlocks notifications. Takes a few
        seconds:
      </p>

      {ios ? (
        <ol className="flex flex-col gap-2">
          <Step n={1}>
            Tap the <ShareGlyph /> <span className="font-medium text-ink">Share</span>{" "}
            button in the toolbar.
          </Step>
          <Step n={2}>
            Scroll down and tap <AddGlyph />{" "}
            <span className="font-medium text-ink">Add to Home Screen</span>.
          </Step>
          <Step n={3}>
            Tap <span className="font-medium text-ink">Add</span>, then open Overlapp
            from your home screen.
          </Step>
        </ol>
      ) : (
        <ol className="flex flex-col gap-2">
          <Step n={1}>
            Open your browser menu (<span className="font-medium text-ink">⋮</span> or{" "}
            <span className="font-medium text-ink">⋯</span>).
          </Step>
          <Step n={2}>
            Tap <span className="font-medium text-ink">Install app</span> (or{" "}
            <span className="font-medium text-ink">Add to Home screen</span>).
          </Step>
          <Step n={3}>Launch Overlapp from your home screen.</Step>
        </ol>
      )}

      {ios && (
        <p className="mt-3 text-[11px] leading-relaxed text-ink-subtle">
          No “Add to Home Screen” in the menu? Open this page in{" "}
          <span className="font-medium">Safari</span> — only Safari can install on
          iPhone.
        </p>
      )}
    </div>
  );
}
