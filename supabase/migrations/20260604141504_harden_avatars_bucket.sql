-- ============================================================================
-- Migration: harden_avatars_bucket
-- Address advisor 0025 (public_bucket_allows_listing). A public bucket serves
-- objects directly via the public URL WITHOUT a storage.objects SELECT policy,
-- so the broad `avatars_public_read` policy only added the ability to *list*
-- every file (enumerate user ids). The app uses getPublicUrl (public URL path)
-- + owner-scoped write policies only, so dropping the read policy keeps avatars
-- working while removing enumeration.
-- ============================================================================

drop policy if exists "avatars_public_read" on storage.objects;
