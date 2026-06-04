"use client";

// Renders a UTC ISO timestamp in the viewer's local time. The server has no
// viewer tz, so server/client output differs — suppressHydrationWarning lets
// the client value win without console noise.
export function LocalTime({
  iso,
  withDate = true,
}: {
  iso: string;
  withDate?: boolean;
}) {
  const d = new Date(iso);
  const text = withDate
    ? d.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return <span suppressHydrationWarning>{text}</span>;
}
