"use client";

import { useEffect } from "react";

// Registers the service worker (Phase 4 — PWA). Mounted once in the root layout.
// Registration is a no-op on browsers without SW support and in dev where it
// just adds noise — we only register in production builds. The SW handles
// offline caching + Web Push display; subscription is driven separately by the
// push UI (PushToggle).
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    // Avoid registering against the dev server's HMR — the SW would cache stale
    // chunks and fight Turbopack. In dev we go further: a SW left over from a
    // previous production build (or an installed PWA) keeps controlling the page
    // and serves its cache-first /_next/static chunks. Turbopack reuses stable
    // dev chunk URLs whose CONTENTS change on every edit, so that cache hands the
    // browser stale JS — old client code then hydrates against the dev server's
    // fresh HTML and throws a hydration mismatch. So in dev, unregister any SW
    // and drop its caches (self-healing; do one hard reload to shed the
    // still-controlling worker on the current page).
    if (process.env.NODE_ENV !== "production") {
      void (async () => {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((k) => k.startsWith("overlapp-"))
              .map((k) => caches.delete(k)),
          );
        }
      })();
      return;
    }

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failure is non-fatal — the app still works online.
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
