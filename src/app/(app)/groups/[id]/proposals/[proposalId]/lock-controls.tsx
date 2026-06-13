"use client";

import { useFormStatus } from "react-dom";

import { lockProposal, unlockProposal } from "@/lib/actions/proposals";
import { btnPrimary, btnSecondary } from "@/lib/ui";

// Locking sets the group's final time for EVERYONE (and writes it to opted-in
// calendars) — it is not a personal availability vote. A member once locked by
// mistake thinking they were marking themselves, so both actions guard behind an
// explicit confirm and disable while the action runs (no accidental re-clicks,
// which is also what flooded the inbox with duplicate notifications).

function PendingButton({
  className,
  idle,
  busy,
}: {
  className: string;
  idle: string;
  busy: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}

export function LockButton({
  proposalId,
  optionId,
  groupId,
  startsAt,
}: {
  proposalId: string;
  optionId: string;
  groupId: string;
  startsAt: string;
}) {
  return (
    <form
      action={lockProposal}
      onSubmit={(e) => {
        const whenLabel = new Date(startsAt).toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        if (
          !window.confirm(
            `Lock ${whenLabel} as the FINAL time for the whole group?\n\n` +
              "This decides the event for everyone and adds it to opted-in members' calendars. " +
              "It is not your personal availability. You can unlock it later if needed.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="proposal_id" value={proposalId} />
      <input type="hidden" name="option_id" value={optionId} />
      <input type="hidden" name="group_id" value={groupId} />
      <PendingButton
        className={`${btnPrimary} !py-1 !text-xs`}
        idle="Lock for everyone"
        busy="Locking…"
      />
    </form>
  );
}

export function UnlockButton({
  proposalId,
  groupId,
}: {
  proposalId: string;
  groupId: string;
}) {
  return (
    <form
      action={unlockProposal}
      onSubmit={(e) => {
        if (
          !window.confirm(
            "Unlock this proposal?\n\n" +
              "It goes back to open so the group can keep marking availability or pick " +
              "a different time. Any event added to members' calendars will be removed.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="proposal_id" value={proposalId} />
      <input type="hidden" name="group_id" value={groupId} />
      <PendingButton
        className={btnSecondary}
        idle="Unlock proposal"
        busy="Unlocking…"
      />
    </form>
  );
}
