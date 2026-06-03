-- ============================================================================
-- Migration: create_groups_and_members
-- DATA-MODEL.md §1 (enums) · §3 (groups & membership) · §11 (RLS posture)
--
-- Adds the two core P1 tables and the enums they need, the 15-member-cap
-- trigger, an owner-auto-membership trigger, and the full RLS posture.
-- Also unlocks the co-member profile-read policy that create_profiles
-- intentionally deferred until group_members existed.
--
-- RLS RECURSION NOTE: group_members policies must ask "is the current user a
-- member/admin of this group?", which itself reads group_members. To avoid the
-- policy recursing into itself, that lookup goes through SECURITY DEFINER
-- helper functions (they run as the table owner and bypass RLS). This is the
-- standard Supabase pattern. The helpers take the current user implicitly via
-- auth.uid() so they cannot be used to probe other users' memberships.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums (only those needed for P1 groups/membership; calendar/proposal enums
-- land with their P2/P3 migrations).
-- ----------------------------------------------------------------------------
create type public.member_role   as enum ('owner', 'admin', 'member');
create type public.member_status as enum ('active', 'pending');  -- pending = awaiting approval
create type public.join_control  as enum ('open', 'approval');   -- per-group invite policy

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
create table public.groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(trim(name)) > 0),
  description   text,
  avatar_url    text,
  owner_id      uuid not null references public.profiles (id),
  slot_minutes  int not null default 30 check (slot_minutes in (15, 30, 60)),
  join_policy   public.join_control not null default 'open',
  quorum        int check (quorum is null or quorum > 0),  -- null = "everyone" (P3)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz                                -- soft-delete; every RLS policy filters it
);

comment on table public.groups is
  'A scheduling group (size cap 15). RLS: active members read; admins/owner write; owner deletes.';

create table public.group_members (
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role   not null default 'member',
  status     public.member_status not null default 'active',
  joined_at  timestamptz          not null default now(),
  primary key (group_id, user_id)
);

comment on table public.group_members is
  'Membership join table. RLS: co-members read; admins manage; self leaves (owner cannot be removed).';

create index group_members_user_id_idx on public.group_members (user_id);

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- SECURITY DEFINER membership helpers (break RLS recursion; see header note).
-- search_path = '' so every reference is schema-qualified. STABLE: no writes.
-- ----------------------------------------------------------------------------
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id  = (select auth.uid())
      and gm.status   = 'active'
  );
$$;

create or replace function public.is_group_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id  = (select auth.uid())
      and gm.status   = 'active'
      and gm.role     in ('owner', 'admin')
  );
$$;

-- "Does the current user share at least one active group with p_user_id?"
-- Powers the co-member profile-read policy.
create or replace function public.shares_group_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members them on them.group_id = me.group_id
    where me.user_id   = (select auth.uid())
      and me.status    = 'active'
      and them.user_id = p_user_id
      and them.status  = 'active'
  );
$$;

-- These helpers are referenced inside RLS policies, so the calling role
-- (authenticated) must retain EXECUTE. They are also reachable as PostgREST
-- RPCs; that is harmless — each only reveals a boolean about the *caller's*
-- own relationships. Revoke from anon/public to limit the exposure.
revoke execute on function public.is_group_member(uuid)  from public, anon;
revoke execute on function public.is_group_admin(uuid)   from public, anon;
revoke execute on function public.shares_group_with(uuid) from public, anon;

-- ----------------------------------------------------------------------------
-- 15-member size cap (spec §Group size). Counts active members only; fires on
-- INSERT of an active row and on a pending->active transition. SECURITY DEFINER
-- so the count is not narrowed by RLS.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_group_size()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_count int;
begin
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    select count(*) into active_count
    from public.group_members
    where group_id = new.group_id and status = 'active';

    if active_count >= 15 then
      raise exception 'group % is at the 15-member cap', new.group_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger group_members_enforce_size
  before insert or update on public.group_members
  for each row execute function public.enforce_group_size();

-- ----------------------------------------------------------------------------
-- Owner auto-membership: when a group is created, add its owner as an active
-- 'owner' member so RLS read policies immediately resolve. SECURITY DEFINER so
-- it bypasses the (admins-only) group_members INSERT policy.
-- ----------------------------------------------------------------------------
create or replace function public.add_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id, role, status)
  values (new.id, new.owner_id, 'owner', 'active');
  return new;
end;
$$;

create trigger groups_add_owner_membership
  after insert on public.groups
  for each row execute function public.add_owner_membership();

-- These two run only from their triggers (table-owner context), never as RPCs.
revoke execute on function public.enforce_group_size()  from public, anon, authenticated;
revoke execute on function public.add_owner_membership() from public, anon, authenticated;

-- ============================================================================
-- RLS — deny-by-default. auth.uid() wrapped in a subselect so the planner
-- caches it per-statement.
-- ============================================================================

-- ---- groups ----------------------------------------------------------------
alter table public.groups enable row level security;

grant select, insert, update, delete on public.groups to authenticated;

-- Read: active members of the group.
create policy groups_select_members
  on public.groups
  for select
  to authenticated
  using (deleted_at is null and public.is_group_member(id));

-- Create: any authenticated user, only as themselves (owner_id = self). The
-- after-insert trigger makes them the first member.
create policy groups_insert_self_owner
  on public.groups
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and deleted_at is null);

-- Update (incl. soft-delete by setting deleted_at): admins/owner.
create policy groups_update_admins
  on public.groups
  for update
  to authenticated
  using (deleted_at is null and public.is_group_admin(id))
  with check (public.is_group_admin(id));

-- Hard delete: owner only.
create policy groups_delete_owner
  on public.groups
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ---- group_members ---------------------------------------------------------
alter table public.group_members enable row level security;

grant select, insert, update, delete on public.group_members to authenticated;

-- Read: co-members see the roster.
create policy group_members_select_comembers
  on public.group_members
  for select
  to authenticated
  using (public.is_group_member(group_id));

-- Insert: admins add members (the owner's own row is added by the group trigger).
create policy group_members_insert_admins
  on public.group_members
  for insert
  to authenticated
  with check (public.is_group_admin(group_id));

-- Update: admins manage roles/approval.
create policy group_members_update_admins
  on public.group_members
  for update
  to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

-- Delete: admins remove members, or a member removes themselves (leave). The
-- owner's membership can never be removed here — dissolving the group (deleting
-- the groups row) is the path for an owner exit.
create policy group_members_delete_admin_or_self
  on public.group_members
  for delete
  to authenticated
  using (
    role <> 'owner'
    and (public.is_group_admin(group_id) or user_id = (select auth.uid()))
  );

-- ---- profiles: deferred co-member read policy (from create_profiles) --------
-- Now that group_members exists, members can read each other's profile basics.
-- The self policy already covers a user's own row; this adds co-members.
create policy profiles_select_comembers
  on public.profiles
  for select
  to authenticated
  using (deleted_at is null and public.shares_group_with(id));
