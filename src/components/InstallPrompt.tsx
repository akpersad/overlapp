"use client";

import { useEffect, useState } from "react";

import { PushToggle } from "@/components/PushToggle";
import { card } from "@/lib/ui";

// Onboarding install + push prompt (Phase 4, spec §Onboarding). Push permission
// is gated by the browser behind installation on iOS, so we only surface the
// push opt-in when the app is running as an installed PWA (display-mode:
// standalone). Otherwise we show a lightweight "install to your home screen"
// hint with the platform-appropriate gesture. Either way it's skippable —
// nothing here blocks finishing onboarding.

type Mode = "loading" | "installed" | "browser";

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
        <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Stay in the loop
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          Get notified when someone proposes a time or an event is locked.
        </p>
        <PushToggle compact />
      </div>
    );
  }

  // Not installed: a gentle nudge to add to home screen (where push is enabled).
  return (
    <div className={card}>
      <h2 className="mb-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        Add Overlapp to your home screen
      </h2>
      <p className="text-xs text-zinc-500">
        {ios
          ? "Tap the Share button, then “Add to Home Screen” to install Overlapp and turn on notifications."
          : "Use your browser’s “Install app” option to add Overlapp to your home screen and turn on notifications."}
      </p>
    </div>
  );
}
