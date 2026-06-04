"use client";

import { useEffect, useState } from "react";

import { savePushSubscription, removePushSubscription } from "@/lib/actions/push";
import { btnPrimary, btnSecondary, errorText } from "@/lib/ui";

// Web Push opt-in (Phase 4). Drives the browser PushManager: registers the
// service worker, requests Notification permission, subscribes with the VAPID
// public key, and persists the subscription via a Server Action. Re-render-safe
// and entirely client-side — it reflects the *device's* current subscription
// state (push is per-device, not per-account).
//
// `compact` renders the inline onboarding/prompt variant (single button, no
// chrome); the default is the fuller profile-settings card row.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  // Back it with a concrete ArrayBuffer so the type satisfies BufferSource
  // (applicationServerKey rejects the SharedArrayBuffer-capable default).
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Support = "unknown" | "unsupported" | "unconfigured" | "ready";

export function PushToggle({ compact = false }: { compact?: boolean }) {
  const [support, setSupport] = useState<Support>("unknown");
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // One-shot capability detection from browser-only APIs (no SSR equivalent).
    const supported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    const next: Support = !supported
      ? "unsupported"
      : !VAPID_PUBLIC_KEY
        ? "unconfigured"
        : "ready";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport(next);
    if (next !== "ready") return;
    setPermission(Notification.permission);
    // Reflect any existing subscription for this device (async → allowed).
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => {});
  }, []);

  async function getRegistration(): Promise<ServiceWorkerRegistration> {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    await navigator.serviceWorker.register("/sw.js");
    return navigator.serviceWorker.ready;
  }

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError(
          perm === "denied"
            ? "Notifications are blocked. Enable them in your browser settings."
            : "Permission was not granted.",
        );
        return;
      }
      const reg = await getRegistration();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
      });
      const fd = new FormData();
      fd.set("subscription", JSON.stringify(sub.toJSON()));
      const res = await savePushSubscription(undefined, fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setSubscribed(true);
    } catch {
      setError("Could not enable notifications on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const fd = new FormData();
        fd.set("endpoint", sub.endpoint);
        await removePushSubscription(undefined, fd);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setError("Could not turn off notifications.");
    } finally {
      setBusy(false);
    }
  }

  if (support === "unknown") return null;
  if (support === "unsupported") {
    return compact ? null : (
      <p className="text-sm text-zinc-500">
        This browser doesn&apos;t support push notifications. Install Overlapp to
        your home screen on mobile to enable them.
      </p>
    );
  }
  if (support === "unconfigured") {
    return compact ? null : (
      <p className="text-sm text-zinc-500">
        Push notifications aren&apos;t configured on this server.
      </p>
    );
  }

  // Compact onboarding variant: just the enable button (hidden once subscribed).
  if (compact) {
    if (subscribed) return null;
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={enable}
          disabled={busy || permission === "denied"}
          className={btnPrimary}
        >
          {busy ? "Enabling…" : "Enable push notifications"}
        </button>
        {error && <p className={errorText}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Push notifications on this device
          </p>
          <p className="text-xs text-zinc-500">
            {subscribed
              ? "On — you'll get proposals and reminders here."
              : "Off — get notified about proposals and reminders even when Overlapp is closed."}
          </p>
        </div>
        {subscribed ? (
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className={btnSecondary}
          >
            {busy ? "…" : "Turn off"}
          </button>
        ) : (
          <button
            type="button"
            onClick={enable}
            disabled={busy || permission === "denied"}
            className={btnPrimary}
          >
            {busy ? "Enabling…" : "Turn on"}
          </button>
        )}
      </div>
      {permission === "denied" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Notifications are blocked for this site. Re-enable them in your browser
          settings to turn this on.
        </p>
      )}
      {error && <p className={errorText}>{error}</p>}
    </div>
  );
}
