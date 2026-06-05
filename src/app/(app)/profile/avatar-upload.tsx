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
          className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-sunken file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink-muted hover:file:bg-border"
        />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className={`${btnPrimary} !py-1.5 !text-xs`}>
            {pending ? "Uploading…" : "Upload"}
          </button>
          {avatarUrl && (
            <button
              type="submit"
              formAction={removeAvatar}
              className="text-xs text-ink-muted hover:underline"
            >
              Remove
            </button>
          )}
          {saved && (
            <span className="text-xs text-av-5">Saved ✓</span>
          )}
        </div>
        <p className="text-xs text-ink-subtle">PNG/JPG, up to 2 MB. Defaults to your initials.</p>
        {state && "error" in state && <p className={errorText}>{state.error}</p>}
      </div>
    </form>
  );
}
