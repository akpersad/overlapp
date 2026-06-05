import Link from "next/link";

import { getUser } from "@/lib/auth";
import { btnPrimary, btnSecondary } from "@/lib/ui";

export default async function Home() {
  const user = await getUser();

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
        <span className="font-display text-xl font-extrabold tracking-tight text-honey-700">
          Overlapp
        </span>
        {user ? (
          <Link href="/dashboard" className={btnSecondary}>
            Go to dashboard
          </Link>
        ) : (
          <Link
            href="/login"
            className="text-sm font-medium text-ink-muted transition-colors hover:text-ink"
          >
            Sign in
          </Link>
        )}
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 px-5 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
        {/* Copy */}
        <div className="flex flex-col items-start gap-6 text-left">
          <span className="rounded-full bg-honey-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-honey-900">
            A persistent shared calendar
          </span>
          <h1 className="text-balance text-display-lg text-ink sm:text-display-xl">
            Stop asking{" "}
            <span className="text-honey-700">
              &ldquo;when&apos;s everyone free?&rdquo;
            </span>
          </h1>
          <p className="max-w-md text-balance text-body text-ink-muted sm:text-lg">
            Overlapp keeps your group&apos;s availability in one living place — so
            the best time to meet is answered before anyone has to ask.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            {user ? (
              <Link href="/dashboard" className={btnPrimary}>
                Open your groups
              </Link>
            ) : (
              <>
                <Link href="/signup" className={btnPrimary}>
                  Get started — free
                </Link>
                <Link href="/login" className={btnSecondary}>
                  Sign in
                </Link>
              </>
            )}
          </div>

          <ul className="mt-2 flex flex-col gap-2.5">
            {[
              "Always up to date — a living layer, not a throwaway poll.",
              "Private by design — members see only free/busy, never your event details.",
              "Find the green slot — the heatmap shows when everyone can actually make it.",
            ].map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-body-sm text-ink-muted">
                <span
                  aria-hidden
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-honey-500"
                />
                {point}
              </li>
            ))}
          </ul>
        </div>

        {/* Product preview — the hero artifact itself */}
        <HeatmapPreview />
      </main>

      <footer className="mx-auto flex w-full max-w-5xl items-center justify-center gap-4 px-5 py-8 text-xs text-ink-subtle">
        <span>© {new Date().getFullYear()} Overlapp</span>
        <span aria-hidden>·</span>
        <Link href="/privacy" className="transition-colors hover:text-ink">
          Privacy
        </Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className="transition-colors hover:text-ink">
          Terms
        </Link>
      </footer>
    </div>
  );
}

// A small, static mock of the group heatmap — the product's hero artifact.
// Decorative (aria-hidden); the deep-pine ramp + honey "everyone free" callout
// make the value legible at a glance without copy.
function HeatmapPreview() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  // Hand-picked bucket grid (0..5) so it reads as a plausible week, with a clear
  // band of high-overlap evening slots and a single "everyone free" peak.
  const grid = [
    [0, 0, 1, 0, 1, 2, 1],
    [1, 2, 2, 1, 2, 3, 2],
    [2, 3, 3, 2, 3, 4, 3],
    [3, 4, 4, 3, 4, 5, 4],
    [2, 3, 4, 3, 4, 4, 5],
    [1, 2, 3, 2, 3, 3, 3],
  ];
  const times = ["5p", "6p", "7p", "8p", "9p", "10p"];
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-lg sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-h3 text-ink">When everyone&apos;s free</p>
        <span className="rounded-full bg-honey-50 px-2.5 py-0.5 text-xs font-semibold text-honey-900">
          this week
        </span>
      </div>
      <div className="rounded-lg bg-surface-sunken p-3" aria-hidden>
        <div className="grid grid-cols-[28px_repeat(7,1fr)] gap-[3px]">
          <div />
          {days.map((d) => (
            <div key={d} className="pb-1.5 text-center text-[10px] font-semibold text-ink">
              {d}
            </div>
          ))}
          {grid.map((row, ri) => (
            <Row key={ri} time={times[ri]} buckets={row} />
          ))}
        </div>
      </div>
      <p className="mt-3 flex items-center gap-2 text-body-sm text-ink-muted">
        <span className="h-3 w-3 rounded-[3px] ring-2 ring-inset ring-honey-500" style={{ background: "var(--av-5)" }} />
        Sat 9pm — everyone can make it.
      </p>
    </div>
  );
}

function Row({ time, buckets }: { time: string; buckets: number[] }) {
  return (
    <>
      <div className="pr-1 text-right text-[10px] font-medium tabular leading-[18px] text-ink-subtle">
        {time}
      </div>
      {buckets.map((b, ci) => {
        const everyone = b === 5;
        return (
          <div
            key={ci}
            className={`h-[18px] rounded-[5px] ${everyone ? "ring-2 ring-inset ring-honey-500" : ""}`}
            style={{ background: `var(--av-${b})` }}
          />
        );
      })}
    </>
  );
}
