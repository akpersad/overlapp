-- ============================================================================
-- Migration: create_avatars_bucket  (Phase 1 follow-up — avatar upload)
-- SPEC §User data (Avatar URL: null → initials). Adds optional avatar image
-- upload to back profiles.avatar_url.
--
-- A public-read bucket (avatars are low-sensitivity and the URL is only known to
-- group co-members anyway). Writes are owner-scoped: a user may only create/
-- replace/delete objects under a top-level folder named after their own uid, so
-- `${uid}/avatar.<ext>`. Public read keeps the <img> tag simple (no signed URLs).
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Anyone can read an avatar (public bucket).
create policy "avatars_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

-- Owner-scoped writes: first path segment must equal the caller's uid.
create policy "avatars_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
