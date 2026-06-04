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
  invites,
  pending,
}: {
  groupId: string;
  groupName: string;
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
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
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
          <p className="text-sm text-zinc-500">
            No active links. Create one to invite people.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <ShareButton
                  token={inv.token}
                  groupName={groupName}
                />
                <span className="text-xs text-zinc-400">
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
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Invite by email
        </h3>
        <p className="text-xs text-zinc-500">
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
          <ul className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
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
}: {
  token: string;
  groupName: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/invite/${token}`;
    const shareData = {
      title: "Join my Overlapp group",
      text: `Join "${groupName}" on Overlapp`,
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
