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
    // chunks and fight Turbopack. Register only in production.
    if (process.env.NODE_ENV !== "production") return;

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
