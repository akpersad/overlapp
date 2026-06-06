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
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">
            Share links
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
            No active links. Create one to invite people.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <ShareButton
                  token={inv.token}
                  groupName={groupName}
                  inviterName={inviterName}
                />
                <span className="text-xs text-ink-subtle tabular">
                  used {inv.use_count}×
                </span>
                <form action={revokeInvite} className="ml-auto">
                  <input type="hidden" name="group_id" value={groupId} />
                  <input type="hidden" name="invite_id" value={inv.id} />
                  <button
                    type="submit"
                    className="text-xs text-red-600 hover:underline"
                  >
                    Revoke
                  </button>
                </form>
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
    <button type="button" onClick={share} className={`${btnSecondary} !py-1 !text-xs`}>
      {copied ? "Copied!" : "Share link"}
    </button>
  );
}
