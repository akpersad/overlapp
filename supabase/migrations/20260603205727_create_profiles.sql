-- ============================================================================
-- Migration: create_profiles
-- DATA-MODEL.md §2 (Identity & profiles) · §9-D (email mirroring) · §11 (RLS)
--
-- public.profiles is a 1:1 extension of auth.users, keyed by auth.users.id.
-- Supabase Auth owns identity (email, password, verification); we mirror only
-- what we need for app logic + invite matching. Soft-delete via deleted_at;
-- every RLS policy filters it.
--
-- NOTE: this project runs with "automatic RLS" on, so RLS is auto-enabled for
-- new tables. We still enable it + author policies + grants explicitly so this
-- file is self-contained and correct if replayed on a fresh database.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Shared helper: keep updated_at current on UPDATE.
-- (Defined here, the first migration; reused by later tables.)
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Table: public.profiles
-- ----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null,                       -- mirrored from auth for invite matching (§9-D)
  first_name    text not null,
  last_name     text not null,
  display_name  text,                                -- null -> render "First L."
  time_zone     text not null default 'UTC',         -- IANA, auto-detected & editable
  avatar_url    text,                                -- null -> initials avatar
  notif_prefs   jsonb not null default '{}'::jsonb,  -- sensible defaults, editable
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz                          -- soft-delete; every RLS policy filters it
);

comment on table public.profiles is
  '1:1 extension of auth.users. RLS: self read/write; co-members read basics (added with group_members).';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Signup trigger: mirror the new auth user into public.profiles.
--
-- Runs as SECURITY DEFINER (bypasses RLS) with an empty search_path, so every
-- object reference is schema-qualified. first_name/last_name come from the
-- signUp() metadata (raw_user_meta_data); coalesced to '' so a metadata-less
-- signup still satisfies NOT NULL.
--
-- pending_invites auto-join (§5) is intentionally NOT here yet — that table
-- doesn't exist until the invites migration, which will extend this function.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, time_zone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.raw_user_meta_data ->> 'time_zone', 'UTC')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- RLS — deny-by-default; self read/write only.
--
-- Co-member read access ("see profile basics of people in my groups") is
-- deferred to the groups/group_members migration, which has the membership
-- table needed to express it. Writes are always self-only. INSERT is handled
-- by the SECURITY DEFINER trigger above, so users get no INSERT policy.
-- auth.uid() is wrapped in a subselect so the planner caches it per-statement.
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;

grant select, update on public.profiles to authenticated;

create policy profiles_select_self
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()) and deleted_at is null);

create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()));
