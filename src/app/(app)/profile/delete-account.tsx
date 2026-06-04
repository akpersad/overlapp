"use client";

import { useState } from "react";

import { deleteAccount } from "@/lib/actions/profile";
import { btnDanger, btnSecondary } from "@/lib/ui";

export function DeleteAccount({ ownedGroups }: { ownedGroups: number }) {
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

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        This permanently deletes your account, your availability, and your
        memberships.
        {ownedGroups > 0 && (
          <>
            {" "}
            It will also <strong>dissolve {ownedGroups} group
            {ownedGroups === 1 ? "" : "s"} you own</strong> — other members will
            lose access. Transfer ownership first if you want a group to survive.
          </>
        )}{" "}
        This can’t be undone.
      </p>
      <div className="flex flex-wrap gap-3">
        <form action={deleteAccount}>
          <button type="submit" className={btnDanger}>
            Yes, delete everything
          </button>
        </form>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className={btnSecondary}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
