"use client";

import { useActionState, useState } from "react";

import {
  createInvite,
  invitePendingEmail,
  revokeInvite,
} from "@/lib/actions/groups";
import { btnPrimary, btnSecondary, errorText, input } from "@/lib/ui";

type Invite = { id: string; token: string; use_count: number };
type Pending = { id: string; email: string };

export function InvitePanel({
  groupId,
  groupName,
  inviterName,
  invites,
  pending,
}: {
  groupId: string;
  groupName: string;
  inviterName: string;
  invites: Invite[];
  pending: Pending[];
}) {
  const [emailState, emailAction, emailPending] = useActionState(
    invitePendingEmail,
    undefined,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <LinkIcon />
            Shareable links
          </h3>
          <form action={createInvite}>
            <input type="hidden" name="group_id" value={groupId} />
            <button type="submit" className={`${btnSecondary} !py-1 !text-xs`}>
              + New link
            </button>
          </form>
        </div>

        {invites.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No active links yet. Create one, then share it anywhere — anyone with
            the link can join.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-sunken/40 p-2.5"
              >
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-honey-50 text-honey-700"
                >
                  <LinkIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">Invite link</p>
                  <div className="text-xs text-ink-subtle tabular">
                    Used {inv.use_count}× ·{" "}
                    <form action={revokeInvite} className="inline">
                      <input type="hidden" name="group_id" value={groupId} />
                      <input type="hidden" name="invite_id" value={inv.id} />
                      <button
                        type="submit"
                        className="text-red-600 hover:underline"
                      >
                        Revoke
                      </button>
                    </form>
                  </div>
                </div>
                <ShareButton
                  token={inv.token}
                  groupName={groupName}
                  inviterName={inviterName}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-ink">
          Invite by email
        </h3>
        <p className="text-xs text-ink-muted">
          They&apos;ll auto-join this group when they sign up with that address.
        </p>
        <form action={emailAction} className="flex gap-2">
          <input type="hidden" name="group_id" value={groupId} />
          <input
            name="email"
            type="email"
            placeholder="friend@example.com"
            required
            className={input}
          />
          <button type="submit" disabled={emailPending} className={btnPrimary}>
            Invite
          </button>
        </form>
        {emailState?.error && <p className={errorText}>{emailState.error}</p>}
        {pending.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm text-ink-muted">
            {pending.map((p) => (
              <li key={p.id}>⏳ {p.email} — invited</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ShareButton({
  token,
  groupName,
  inviterName,
}: {
  token: string;
  groupName: string;
  inviterName: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/invite/${token}`;
    const shareData = {
      // `title` is what surfaces as the subject when shared to Mail; `text`
      // rides above the link-preview card in chat apps (iMessage/WhatsApp).
      title: `${inviterName} invited you to ${groupName} on Overlapp`,
      text:
        `${inviterName} invited you to “${groupName}” on Overlapp — a shared ` +
        `group calendar that shows when everyone's free, so you can skip the ` +
        `back-and-forth. Tap to join:`,
      url,
    };
    // Prefer the native share sheet (spec: invites via Web Share API).
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // user cancelled or unsupported — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this invite link:", url);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className={`${btnPrimary} shrink-0 !px-3 !py-1.5 !text-xs`}
    >
      {copied ? (
        <CheckIcon />
      ) : (
        <ShareIcon />
      )}
      {copied ? "Copied!" : "Share"}
    </button>
  );
}

function LinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9.5 13.5a4 4 0 0 0 5.66 0l2.84-2.84a4 4 0 0 0-5.66-5.66l-1.3 1.3" />
      <path d="M14.5 10.5a4 4 0 0 0-5.66 0L6 13.34a4 4 0 0 0 5.66 5.66l1.3-1.3" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15V3" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}
