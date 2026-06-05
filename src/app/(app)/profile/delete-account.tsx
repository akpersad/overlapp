"use client";

import { useState } from "react";

import { deleteAccount } from "@/lib/actions/profile";
import { btnDanger, btnSecondary, input } from "@/lib/ui";

export type OwnedGroup = {
  id: string;
  name: string;
  candidates: { userId: string; name: string }[];
};

export function DeleteAccount({ ownedGroups }: { ownedGroups: OwnedGroup[] }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={btnDanger}
      >
        Delete account
      </button>
    );
  }

  const transferable = ownedGroups.filter((g) => g.candidates.length > 0);
  const dissolveOnly = ownedGroups.filter((g) => g.candidates.length === 0);

  return (
    <form action={deleteAccount} className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        This permanently deletes your account, your availability, and your
        memberships. This can’t be undone.
      </p>

      {transferable.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">
            You own {ownedGroups.length} group
            {ownedGroups.length === 1 ? "" : "s"}. Choose what happens to each —
            hand it to another member to keep it alive, or dissolve it.
          </p>
          {transferable.map((g) => (
            <label key={g.id} className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">
                {g.name}
              </span>
              {/* Defaults to transferring to the first eligible member (admins
                  first) so groups survive by default; "Dissolve" is explicit. */}
              <select name={`transfer:${g.id}`} className={input} defaultValue={g.candidates[0].userId}>
                {g.candidates.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    Transfer to {c.name}
                  </option>
                ))}
                <option value="">Dissolve this group</option>
              </select>
            </label>
          ))}
        </div>
      )}

      {dissolveOnly.length > 0 && (
        <p className="text-sm text-ink-muted">
          {dissolveOnly.length === 1 ? "One group" : `${dissolveOnly.length} groups`} you own (
          {dissolveOnly.map((g) => g.name).join(", ")}) {dissolveOnly.length === 1 ? "has" : "have"} no
          other members and will be <strong>dissolved</strong>.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={btnDanger}>
          Yes, delete my account
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className={btnSecondary}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
