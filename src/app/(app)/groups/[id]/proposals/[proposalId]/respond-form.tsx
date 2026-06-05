"use client";

import { useEffect, useMemo, useState } from "react";

import { LocalTime } from "@/components/LocalTime";
import { respondProposal } from "@/lib/actions/proposals";
import { createClient } from "@/lib/supabase/client";
import { btnPrimary, btnSecondary } from "@/lib/ui";

type Rsvp = "yes" | "no" | "maybe";
type Option = { id: string; starts_at: string; ends_at: string };

const CHOICES: { value: Rsvp; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
];

export function RespondForm({
  groupId,
  proposalId,
  options,
  initialResponses,
}: {
  groupId: string;
  proposalId: string;
  options: Option[];
  initialResponses: Record<string, string>;
}) {
  const [responses, setResponses] = useState<Record<string, Rsvp>>(
    () =>
      Object.fromEntries(
        Object.entries(initialResponses).filter(
          ([, v]) => v === "yes" || v === "no" || v === "maybe",
        ),
      ) as Record<string, Rsvp>,
  );
  const hasInitial = Object.keys(initialResponses).length > 0;

  // Pre-fill from the member's general availability the first time (low-effort
  // marking, spec §6) — only when they haven't responded yet. setState happens
  // only in the async resolution, and `cancelled` drops a stale response.
  useEffect(() => {
    if (hasInitial) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .rpc("suggest_proposal_rsvps", { p_proposal_id: proposalId })
      .then(({ data }) => {
        if (cancelled || !data) return;
        const suggested = Object.fromEntries(
          (data as { option_id: string; suggested: Rsvp }[]).map((s) => [
            s.option_id,
            s.suggested,
          ]),
        ) as Record<string, Rsvp>;
        setResponses((cur) => ({ ...suggested, ...cur }));
      });
    return () => {
      cancelled = true;
    };
  }, [proposalId, hasInitial]);

  function set(optionId: string, value: Rsvp) {
    setResponses((cur) => ({ ...cur, [optionId]: value }));
  }

  const payload = useMemo(
    () =>
      JSON.stringify(
        options
          .filter((o) => responses[o.id])
          .map((o) => ({ option_id: o.id, response: responses[o.id] })),
      ),
    [options, responses],
  );

  return (
    <form action={respondProposal} className="flex flex-col gap-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <input type="hidden" name="group_id" value={groupId} />
      <input type="hidden" name="responses" value={payload} />

      {!hasInitial && (
        <p className="text-xs text-ink-muted">
          Pre-filled from your availability — adjust anything, then save.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {options.map((o) => (
          <li
            key={o.id}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-sm text-ink tabular">
              <LocalTime iso={o.starts_at} /> –{" "}
              <LocalTime iso={o.ends_at} withDate={false} />
            </span>
            <div className="flex gap-1">
              {CHOICES.map((c) => {
                const active = responses[o.id] === c.value;
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => set(o.id, c.value)}
                    className={`rounded-md border px-3 py-1 text-xs ${
                      active
                        ? "border-honey-500 bg-honey-500 text-on-accent"
                        : "border-border-strong bg-surface-sunken text-ink-muted"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      <SaveButton hasInitial={hasInitial} />
    </form>
  );
}

function SaveButton({ hasInitial }: { hasInitial: boolean }) {
  return (
    <button type="submit" className={`${hasInitial ? btnSecondary : btnPrimary} self-start`}>
      {hasInitial ? "Update my response" : "Save my response"}
    </button>
  );
}
