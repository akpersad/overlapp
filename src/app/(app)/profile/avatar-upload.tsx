"use client";

import { useActionState, useRef, useState } from "react";

import { Avatar } from "@/components/Avatar";
import { removeAvatar, uploadAvatar } from "@/lib/actions/profile";
import { btnPrimary, errorText } from "@/lib/ui";

export function AvatarUpload({
  firstName,
  lastName,
  avatarUrl,
  seed,
}: {
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  seed: string;
}) {
  const [state, action, pending] = useActionState(uploadAvatar, undefined);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const saved = state && "ok" in state && state.ok;

  return (
    <form action={action} className="flex items-center gap-4">
      <Avatar
        firstName={firstName}
        lastName={lastName}
        avatarUrl={preview ?? avatarUrl}
        seed={seed}
        size={56}
      />
      <div className="flex flex-col gap-2">
        <input
          ref={fileRef}
          type="file"
          name="avatar"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-200"
        />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className={`${btnPrimary} !py-1.5 !text-xs`}>
            {pending ? "Uploading…" : "Upload"}
          </button>
          {avatarUrl && (
            <button
              type="submit"
              formAction={removeAvatar}
              className="text-xs text-zinc-500 hover:underline"
            >
              Remove
            </button>
          )}
          {saved && (
            <span className="text-xs text-green-600 dark:text-green-400">Saved ✓</span>
          )}
        </div>
        <p className="text-xs text-zinc-400">PNG/JPG, up to 2 MB. Defaults to your initials.</p>
        {state && "error" in state && <p className={errorText}>{state.error}</p>}
      </div>
    </form>
  );
}
