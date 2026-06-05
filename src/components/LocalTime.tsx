"use client";

// Renders a UTC ISO timestamp in the viewer's local time. The server has no
// viewer tz, so server/client output differs — suppressHydrationWarning lets
// the client value win without console noise.
//
// `allDay` events are a special case: providers express them as floating
// calendar dates (Google `start.date`, no zone), which we store as UTC-midnight
// instants. Rendering those in local time would shift the day (e.g. "Jun 6 all
// day" → "Jun 5, 8 PM" in EDT), so we format the date in UTC and drop the time.
export function LocalTime({
  iso,
  withDate = true,
  allDay = false,
}: {
  iso: string;
  withDate?: boolean;
  allDay?: boolean;
}) {
  const d = new Date(iso);
  const text = allDay
    ? d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : withDate
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

// Renders an all-day event's span. Providers give an exclusive end date (the day
// after the last day), so a one-day event is stored as a 24h UTC-midnight
// interval. We show "Sat, Jun 6 · all day" for a single day, or
// "Sat, Jun 6 – Mon, Jun 8 · all day" across multiple, with the end pulled back
// to the last inclusive day.
const DAY_MS = 24 * 60 * 60 * 1000;

export function AllDayRange({
  startsAt,
  endsAt,
}: {
  startsAt: string;
  endsAt: string;
}) {
  const spanMs = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  const multiDay = spanMs > DAY_MS;
  const lastDay = new Date(new Date(endsAt).getTime() - DAY_MS).toISOString();
  return (
    <>
      <LocalTime iso={startsAt} allDay />
      {multiDay && (
        <>
          {" – "}
          <LocalTime iso={lastDay} allDay />
        </>
      )}
      {" · all day"}
    </>
  );
}
