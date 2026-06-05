import type { Metadata } from "next";

import {
  btnPrimary,
  btnSecondary,
  btnDanger,
  card,
  errorText,
  input,
  label,
} from "@/lib/ui";

// Living style-guide for the Phase 7 visual system (docs/DESIGN-BRIEF.md).
// Screenshot-reviewed as the design pass progresses; not for end users.
export const metadata: Metadata = {
  title: "Design system · Overlapp",
  robots: { index: false, follow: false },
};

/* ---------------------------------------------------------------- helpers -- */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-h2 text-ink">{title}</h2>
        {subtitle ? (
          <p className="text-body-sm text-ink-muted">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Swatch({
  name,
  varName,
  hint,
  dark,
}: {
  name: string;
  varName: string;
  hint?: string;
  dark?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div
        className="h-16 w-full rounded-md border border-border"
        style={{ background: `var(${varName})` }}
      />
      <div className="space-y-0.5">
        <p className={`text-body-sm font-medium ${dark ? "text-ink" : "text-ink"}`}>
          {name}
        </p>
        <p className="text-time">{varName}</p>
        {hint ? <p className="text-time text-ink-subtle">{hint}</p> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- page -- */

export default function DesignSystemPage() {
  return (
    <main className="min-h-full bg-bg px-6 py-12 sm:px-10">
      <div className="mx-auto max-w-5xl space-y-16">
        {/* Header */}
        <header className="space-y-3">
          <p className="text-label">Phase 7 · Bright &amp; Friendly</p>
          <h1 className="text-display-lg text-ink">Overlapp design system</h1>
          <p className="max-w-2xl text-body text-ink-muted">
            The living reference for the warm-social visual pass. Every colour
            flows through semantic tokens — honey brand, deep-pine availability
            ramp, sunny cream base. Components reference tokens, never raw
            zinc/indigo.
          </p>
        </header>

        {/* Typography */}
        <Section
          title="Typography"
          subtitle="Bricolage Grotesque (display) + Inter (body/UI). High type-scale contrast."
        >
          <div className={`${card} space-y-6`}>
            <div className="space-y-1">
              <p className="text-time">display-xl · Bricolage 700</p>
              <p className="text-display-xl text-ink">When can we meet?</p>
            </div>
            <div className="space-y-1">
              <p className="text-time">display-lg · Bricolage 700</p>
              <p className="text-display-lg text-ink">When can we meet?</p>
            </div>
            <div className="space-y-1">
              <p className="text-time">h1 · Bricolage 700</p>
              <p className="text-h1 text-ink">When can we meet?</p>
            </div>
            <div className="space-y-1">
              <p className="text-time">h2 · Bricolage 700</p>
              <p className="text-h2 text-ink">When can we meet?</p>
            </div>
            <div className="space-y-1">
              <p className="text-time">h3 · Inter 600</p>
              <p className="text-h3 text-ink">When can we meet?</p>
            </div>
            <div className="space-y-1">
              <p className="text-time">body · Inter 400</p>
              <p className="text-body text-ink">
                Availability lives continuously, so the answer is ready before
                anyone asks. No more &ldquo;I&rsquo;ll check my calendar.&rdquo;
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-time">body-sm · Inter 400</p>
              <p className="text-body-sm text-ink-muted">
                Members see only free/busy — never event details.
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-time">label · Inter 600 uppercase</p>
              <p className="text-label">Your week</p>
            </div>
            <div className="space-y-1">
              <p className="text-time">time · Inter 500 tabular-nums</p>
              <p className="text-time tabular">9:00 · 10:30 · 12:00 · 13:30</p>
            </div>
          </div>
        </Section>

        {/* Neutrals */}
        <Section
          title="Neutrals — warm cream"
          subtitle="Backgrounds always tint to cream; never pure #FFFFFF page fills."
        >
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Swatch name="Background" varName="--bg" hint="page (sunny cream)" />
            <Swatch name="Surface" varName="--surface" hint="cards / panels" />
            <Swatch
              name="Surface sunken"
              varName="--surface-sunken"
              hint="wells, heatmap, inputs"
            />
            <Swatch name="Border" varName="--border" hint="hairlines, grid" />
            <Swatch name="Ink" varName="--ink" hint="primary text" dark />
            <Swatch name="Ink muted" varName="--ink-muted" hint="secondary" />
            <Swatch name="Ink subtle" varName="--ink-subtle" hint="tertiary" />
            <Swatch
              name="Border strong"
              varName="--border-strong"
              hint="inputs, dividers"
            />
          </div>
        </Section>

        {/* Honey brand */}
        <Section
          title="Brand — honey"
          subtitle="The single confident accent. honey-700 is the only value AA-safe for small text on cream."
        >
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Swatch name="honey-50" varName="--honey-50" hint="pill / tag bg" />
            <Swatch name="honey-100" varName="--honey-100" hint="hover wash" />
            <Swatch name="honey-300" varName="--honey-300" hint="focus ring" />
            <Swatch name="honey-500" varName="--honey-500" hint="DEFAULT fill" />
            <Swatch name="honey-600" varName="--honey-600" hint="hover/pressed" />
            <Swatch
              name="honey-700"
              varName="--honey-700"
              hint="links / accent text (AA)"
            />
            <Swatch name="honey-900" varName="--honey-900" hint="deep accent" />
          </div>
          <div className={`${card} flex flex-wrap items-center gap-6`}>
            <span className="rounded-full bg-honey-50 px-3 py-1 text-body-sm font-medium text-honey-900">
              Tag pill
            </span>
            <a href="#" className="text-body font-medium text-honey-700 underline">
              An accent link
            </a>
            <span className="text-body text-ink">
              Body text with an{" "}
              <span className="font-semibold text-honey-700">accent</span> word.
            </span>
          </div>
        </Section>

        {/* Availability ramp */}
        <Section
          title="Availability ramp — deep pine"
          subtitle="6 buckets, monochrome lightness scale → CVD-safe. Quorum = honey outline (shape cue), never a hue swap."
        >
          <div className={`${card} space-y-6`}>
            <div className="flex flex-wrap gap-3">
              {[
                { v: "--av-0", n: "0", light: true, lbl: "none" },
                { v: "--av-1", n: "1", light: true, lbl: "a few" },
                { v: "--av-2", n: "2", light: true, lbl: "some" },
                { v: "--av-3", n: "3", light: false, lbl: "most" },
                { v: "--av-4", n: "4", light: false, lbl: "nearly all" },
                { v: "--av-5", n: "5", light: false, lbl: "everyone" },
              ].map((c) => (
                <div key={c.v} className="space-y-1.5 text-center">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-[5px] text-sm font-semibold tabular"
                    style={{
                      background: `var(${c.v})`,
                      color: c.light ? "var(--ink)" : "#ffffff",
                    }}
                  >
                    {c.n}
                  </div>
                  <p className="text-time">{c.lbl}</p>
                </div>
              ))}
            </div>
            {/* A mini heatmap-style well to show cells in context */}
            <div className="rounded-lg bg-surface-sunken p-3">
              <p className="mb-2 text-time">in a sunken well (the heatmap container)</p>
              <div className="flex gap-1">
                {["--av-0", "--av-1", "--av-3", "--av-5", "--av-2", "--av-4"].map(
                  (v, i) => {
                    const light = i === 0 || i === 1 || i === 4;
                    const quorum = i === 3; // demo the honey outline on one cell
                    return (
                      <div
                        key={i}
                        className="flex h-9 flex-1 items-center justify-center rounded-[5px] text-xs font-semibold tabular"
                        style={{
                          background: `var(${v})`,
                          color: light ? "var(--ink)" : "#ffffff",
                          outline: quorum
                            ? "2px solid var(--av-quorum-ring)"
                            : undefined,
                          outlineOffset: quorum ? "-2px" : undefined,
                        }}
                      >
                        {i}
                      </div>
                    );
                  },
                )}
              </div>
              <p className="mt-2 text-time text-ink-subtle">
                4th cell shows the quorum ring (2px honey inset outline).
              </p>
            </div>
          </div>
        </Section>

        {/* Buttons */}
        <Section title="Buttons" subtitle="Primary = honey fill + ink text. Tab to see the honey focus ring.">
          <div className={`${card} flex flex-wrap items-center gap-4`}>
            <button className={btnPrimary}>Create proposal</button>
            <button className={btnSecondary}>Cancel</button>
            <button className={btnDanger}>Delete group</button>
            <button className={btnPrimary} disabled>
              Disabled
            </button>
          </div>
        </Section>

        {/* Forms */}
        <Section title="Forms" subtitle="Inputs sit on surface; honey focus ring on tab/focus.">
          <div className={`${card} max-w-md space-y-4`}>
            <div className="space-y-1.5">
              <label className={label} htmlFor="demo-name">
                Group name
              </label>
              <input id="demo-name" className={input} placeholder="Sunday hikers" />
            </div>
            <div className="space-y-1.5">
              <label className={label} htmlFor="demo-err">
                Email
              </label>
              <input
                id="demo-err"
                className={input}
                placeholder="you@example.com"
                defaultValue="not-an-email"
              />
              <p className={errorText}>Enter a valid email address.</p>
            </div>
          </div>
        </Section>

        {/* Radius & elevation */}
        <Section title="Radius &amp; elevation" subtitle="Soft, sparing shadows — flat by default; elevate only floating surfaces.">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className={`${card} space-y-4`}>
              <p className="text-label">Radius</p>
              <div className="flex flex-wrap items-end gap-4">
                {[
                  { v: "--r-sm", n: "sm" },
                  { v: "--r-md", n: "md" },
                  { v: "--r-lg", n: "lg" },
                  { v: "--r-xl", n: "xl" },
                ].map((r) => (
                  <div key={r.v} className="space-y-1 text-center">
                    <div
                      className="h-16 w-16 border border-border-strong bg-surface-sunken"
                      style={{ borderRadius: `var(${r.v})` }}
                    />
                    <p className="text-time">{r.n}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${card} space-y-4`}>
              <p className="text-label">Elevation</p>
              <div className="flex flex-wrap items-end gap-5 py-2">
                {[
                  { v: "--sh-xs", n: "xs" },
                  { v: "--sh-sm", n: "sm" },
                  { v: "--sh-md", n: "md" },
                  { v: "--sh-lg", n: "lg" },
                ].map((s) => (
                  <div key={s.v} className="space-y-2 text-center">
                    <div
                      className="h-16 w-16 rounded-lg bg-surface"
                      style={{ boxShadow: `var(${s.v})` }}
                    />
                    <p className="text-time">{s.n}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Cards */}
        <Section title="Cards" subtitle="Surface lifts off cream with a hairline border + resting shadow.">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className={card}>
              <h3 className="text-h3 text-ink">Sunday hikers</h3>
              <p className="mt-1 text-body-sm text-ink-muted">
                6 members · next overlap Saturday 9–11am
              </p>
            </div>
            <div className={card}>
              <h3 className="text-h3 text-ink">Book club</h3>
              <p className="mt-1 text-body-sm text-ink-muted">
                4 members · 2 proposals open
              </p>
            </div>
          </div>
        </Section>

        <footer className="border-t border-border pt-6">
          <p className="text-body-sm text-ink-subtle">
            Source of truth:{" "}
            <code className="text-ink-muted">docs/DESIGN-BRIEF.md</code>. Tokens
            in <code className="text-ink-muted">globals.css</code>, component
            classes in <code className="text-ink-muted">src/lib/ui.ts</code>.
          </p>
        </footer>
      </div>
    </main>
  );
}
