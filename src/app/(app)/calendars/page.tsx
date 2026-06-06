import Link from "next/link";

import { AllDayRange, LocalTime } from "@/components/LocalTime";
import {
  connectGoogle,
  connectMicrosoft,
  disconnectCalendar,
  setCalendarWriteback,
  syncNow,
} from "@/lib/actions/calendars";
import { requireUser } from "@/lib/auth";
import { googleConfigured } from "@/lib/google/oauth";
import { microsoftConfigured } from "@/lib/microsoft/oauth";
import { createClient } from "@/lib/supabase/server";
import { btnPrimary, btnSecondary, card } from "@/lib/ui";
import type { Enums } from "@/lib/supabase/database.types";
import {
  CategoryOverrideForm,
  EventOverrideForm,
} from "./override-controls";

export const metadata = { title: "Calendars · Overlapp" };

type OverrideState = Enums<"override_state">;

// Mirror of the SQL effective-busy resolution (DATA-MODEL §6) for display.
function effectiveBusy(
  ev: { override: OverrideState | null; category: string | null; provider_busy: boolean },
  categoryRules: Map<string, OverrideState>,
): boolean {
  if (ev.override === "blocked") return true;
  if (ev.override === "free") return false;
  const rule = ev.category ? categoryRules.get(ev.category) : undefined;
  if (rule === "blocked") return true;
  if (rule === "free") return false;
  return ev.provider_busy;
}

const CATEGORY_LABELS: Record<string, string> = {
  default: "Events",
  outOfOffice: "Out of office",
  focusTime: "Focus time",
  workingLocation: "Working location",
  fromGmail: "From Gmail",
};
const humanizeCategory = (c: string) => CATEGORY_LABELS[c] ?? c;

const PROVIDER_LABELS: Record<Enums<"calendar_provider">, string> = {
  google: "Google",
  microsoft: "Microsoft",
  apple_caldav: "Apple",
  ics: "Calendar",
};

const SYNC_LABELS: Record<Enums<"sync_status">, string> = {
  ok: "Synced",
  syncing: "Syncing…",
  error: "Sync error",
  revoked: "Reconnect needed",
};

export default async function CalendarsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { connected, error } = await searchParams;
  const supabase = await createClient();

  const [{ data: calendars }, { data: events }, { data: catOverrides }] =
    await Promise.all([
      supabase
        .from("calendars")
        .select(
          "id, provider, provider_account, display_name, sync_state, last_synced_at, last_error, writeback_enabled",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("events")
        .select("id, title, starts_at, ends_at, is_all_day, provider_busy, category, override")
        .eq("user_id", user.id)
        .gte("ends_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(100),
      supabase
        .from("category_overrides")
        .select("category, state")
        .eq("user_id", user.id),
    ]);

  const categoryRules = new Map<string, OverrideState>(
    (catOverrides ?? []).map((c) => [c.category, c.state]),
  );

  // Distinct categories present across synced events (for the rules section).
  const categories = Array.from(
    new Set((events ?? []).map((e) => e.category).filter((c): c is string => !!c)),
  ).sort();

  const hasCalendars = (calendars ?? []).length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 text-ink">
          Calendars
        </h1>
        <p className="text-sm text-ink-muted">
          Connect a calendar and your events fill in your busy time
          automatically — <em>busy by default</em>. Co-members still only see{" "}
          <em>when</em> you&apos;re free, never your event titles.
        </p>
      </div>

      {connected && (
        <p className="rounded-lg bg-av-5/10 px-3 py-2 text-sm text-av-5">
          Calendar connected and synced ✓
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error === "not_configured"
            ? "That calendar provider isn’t configured on this server yet."
            : `Couldn’t connect (${error}). Please try again.`}
        </p>
      )}

      {/* Connect */}
      <section className={card}>
        <h2 className="mb-3 text-h3 text-ink">
          Connected calendars
        </h2>

        {!hasCalendars && (
          <p className="mb-4 text-sm text-ink-muted">
            No calendars connected yet.
          </p>
        )}

        {hasCalendars && (
          <ul className="mb-4 flex flex-col divide-y divide-border">
            {calendars!.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2.5 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
              >
                <div className="min-w-0 sm:flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {c.display_name ??
                      c.provider_account ??
                      `${PROVIDER_LABELS[c.provider]} Calendar`}
                  </p>
                  <p className="text-xs text-ink-muted tabular">
                    {SYNC_LABELS[c.sync_state]}
                    {c.last_synced_at && c.sync_state === "ok" && (
                      <>
                        {" · "}
                        <LocalTime iso={c.last_synced_at} />
                      </>
                    )}
                    {c.last_error && c.sync_state !== "ok" && (
                      <span className="text-red-600 dark:text-red-400">
                        {" · "}
                        {c.last_error}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={setCalendarWriteback}>
                    <input type="hidden" name="calendar_id" value={c.id} />
                    <input
                      type="hidden"
                      name="enabled"
                      value={c.writeback_enabled ? "false" : "true"}
                    />
                    <button
                      className={`!py-1 !text-xs ${
                        c.writeback_enabled ? btnPrimary : btnSecondary
                      }`}
                      title="Push locked proposal events to this calendar"
                    >
                      {c.writeback_enabled ? "Write-back on" : "Write-back off"}
                    </button>
                  </form>
                  <form action={syncNow}>
                    <input type="hidden" name="calendar_id" value={c.id} />
                    <button className={`${btnSecondary} !py-1 !text-xs`}>
                      Sync now
                    </button>
                  </form>
                  <form action={disconnectCalendar}>
                    <input type="hidden" name="calendar_id" value={c.id} />
                    <button className="px-1 text-xs text-red-600 hover:underline">
                      Disconnect
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        {googleConfigured() || microsoftConfigured() ? (
          <div className="flex flex-wrap gap-2">
            {googleConfigured() && (
              <form action={connectGoogle}>
                <button className={btnPrimary}>
                  {hasCalendars
                    ? "Connect another Google account"
                    : "Connect Google Calendar"}
                </button>
              </form>
            )}
            {microsoftConfigured() && (
              <form action={connectMicrosoft}>
                <button className={btnPrimary}>
                  {hasCalendars
                    ? "Connect another Microsoft account"
                    : "Connect Microsoft Calendar"}
                </button>
              </form>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            Calendar sync isn’t configured on this server. See{" "}
            <code className="text-xs">docs/GOOGLE-SETUP.md</code> /{" "}
            <code className="text-xs">docs/MICROSOFT-SETUP.md</code>.
          </p>
        )}
      </section>

      {/* Per-category rules */}
      {categories.length > 0 && (
        <section className={card}>
          <h2 className="mb-1 text-h3 text-ink">
            Category rules
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            Apply a default to a whole category of synced events. Per-event
            choices below still win.
          </p>
          <ul className="flex flex-col gap-2">
            {categories.map((cat) => (
              <li key={cat} className="flex items-center gap-3">
                <span className="text-sm text-ink">
                  {humanizeCategory(cat)}
                </span>
                <div className="ml-auto">
                  <CategoryOverrideForm
                    category={cat}
                    current={categoryRules.get(cat) ?? null}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Synced events */}
      <section className={card}>
        <h2 className="mb-3 text-h3 text-ink">
          Upcoming synced events ({events?.length ?? 0})
        </h2>
        {!events || events.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {hasCalendars
              ? "No upcoming events in the sync window."
              : "Connect a calendar to see events here."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {events.map((ev) => {
              const busy = effectiveBusy(ev, categoryRules);
              return (
                <li key={ev.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">
                      {ev.title || "(busy)"}
                    </p>
                    <p className="text-xs text-ink-muted tabular">
                      {ev.is_all_day ? (
                        <AllDayRange
                          startsAt={ev.starts_at}
                          endsAt={ev.ends_at}
                        />
                      ) : (
                        <>
                          <LocalTime iso={ev.starts_at} />
                          {" – "}
                          <LocalTime iso={ev.ends_at} withDate={false} />
                        </>
                      )}
                      {ev.category && ev.category !== "default" && (
                        <> · {humanizeCategory(ev.category)}</>
                      )}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      busy
                        ? "bg-honey-50 text-honey-900"
                        : "bg-av-5 text-white"
                    }`}
                  >
                    {busy ? "Busy" : "Free"}
                  </span>
                  <EventOverrideForm eventId={ev.id} current={ev.override} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-xs text-ink-muted">
        <Link href="/availability" className="text-honey-700 hover:underline">
          ← Manual availability blocks
        </Link>
      </p>
    </div>
  );
}
