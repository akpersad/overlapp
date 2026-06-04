-- ============================================================================
-- Migration: create_invites
-- DATA-MODEL.md §4 (invite links) · §5 (email-keyed pending invites) · §11 (RLS)
--
-- Two invite mechanisms for the same goal — getting people into a group:
--
--   1. group_invites   — shareable token links (Web Share API). Anyone with the
--      link can PREVIEW the group (name + inviter) via a SECURITY DEFINER RPC
--      without being a member, then REDEEM it to join (another definer RPC that
--      respects the group's join_policy: open -> active, approval -> pending).
--   2. pending_invites — email-keyed invites for people with no account yet.
--      handle_new_user() (extended here) matches a new signup's email against
--      these and auto-joins the corresponding groups, then deletes the consumed
--      rows. This is the "invited -> signup -> auto-join" path from the spec.
--
-- RLS: both tables are admin-managed (is_group_admin, the SECURITY DEFINER
-- helper from create_groups_and_members, which also breaks policy recursion).
-- The two read-without-membership paths (preview, auto-join) are explicit
-- SECURITY DEFINER functions, never broad table grants.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
create table public.group_invites (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  token       text not null unique,                       -- opaque, in the share URL (app-generated)
  join_code   text unique,                                -- optional short human code
  created_by  uuid not null references public.profiles (id),
  expires_at  timestamptz,                                -- null = no expiry
  revoked_at  timestamptz,                                -- non-null = dead
  max_uses    int check (max_uses is null or max_uses > 0),  -- null = unlimited
  use_count   int not null default 0 check (use_count >= 0),
  created_at  timestamptz not null default now()
);

comment on table public.group_invites is
  'Shareable token-link invites. RLS: admins manage; non-members read name+inviter via get_invite_preview() and join via redeem_group_invite().';

create index group_invites_group_id_idx on public.group_invites (group_id);

create table public.pending_invites (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  email       text not null,                              -- normalised to lower(trim()) by trigger
  role        public.member_role not null default 'member',
  invited_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  unique (group_id, email)
);

comment on table public.pending_invites is
  'Email-keyed invites for accountless users. RLS: admins manage; consumed (auto-join) by the handle_new_user signup trigger.';

create index pending_invites_email_idx on public.pending_invites (email);

-- ----------------------------------------------------------------------------
-- Normalise pending-invite emails so (group_id, email) uniqueness and the
-- signup-trigger match are case/whitespace-insensitive. Plain (invoker-rights)
-- trigger: it only rewrites NEW and uses pg_catalog built-ins, so it needs no
-- search_path-qualified objects. Runs only from its trigger, never as an RPC.
-- ----------------------------------------------------------------------------
create or replace function public.normalize_pending_invite_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.email := lower(trim(new.email));
  return new;
end;
$$;

create trigger pending_invites_normalize_email
  before insert or update on public.pending_invites
  for each row execute function public.normalize_pending_invite_email();

revoke execute on function public.normalize_pending_invite_email() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Extend handle_new_user(): after mirroring the profile, consume any
-- pending_invites addressed to this email and auto-join those groups. Honours
-- each group's join_policy (open -> active, approval -> pending). The per-group
-- attempt is wrapped so a full group (the 15-member cap raises check_violation)
-- is skipped — a full group must never block account creation. Consumed invites
-- are deleted on success; a skipped (full) group's invite is left for later.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv      record;
  v_status public.member_status;
begin
  insert into public.profiles (id, email, first_name, last_name, time_zone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.raw_user_meta_data ->> 'time_zone', 'UTC')
  );

  -- Auto-join via email-keyed pending invites (§5).
  for inv in
    select pi.id, pi.group_id, pi.role, g.join_policy
    from public.pending_invites pi
    join public.groups g on g.id = pi.group_id
    where lower(pi.email) = lower(new.email)
      and (pi.expires_at is null or pi.expires_at > now())
      and g.deleted_at is null
  loop
    v_status := case when inv.join_policy = 'open'
                     then 'active'::public.member_status
                     else 'pending'::public.member_status end;
    begin
      insert into public.group_members (group_id, user_id, role, status)
      values (inv.group_id, new.id, inv.role, v_status)
      on conflict (group_id, user_id) do nothing;
      delete from public.pending_invites where id = inv.id;
    exception
      when check_violation then
        -- Group at its 15-member cap: skip the join, leave the invite to retry.
        null;
    end;
  end loop;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_invite_preview(token): name + inviter for a token, to ANYONE (anon or
-- signed-in non-member), so an invitee can see what they're joining before
-- signing up. SECURITY DEFINER so it bypasses the members-only group RLS, but
-- it returns only non-sensitive group facts — never the roster or any
-- availability. Returns no rows for a revoked/expired/used-up/dissolved invite,
-- which the caller treats as "invalid invite".
-- ----------------------------------------------------------------------------
create or replace function public.get_invite_preview(p_token text)
returns table (
  group_id          uuid,
  group_name        text,
  group_avatar_url  text,
  inviter_name      text,
  member_count      int,
  join_policy       public.join_control
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv   public.group_invites;
  v_group public.groups;
begin
  select * into v_inv from public.group_invites gi where gi.token = p_token;

  if not found
     or v_inv.revoked_at is not null
     or (v_inv.expires_at is not null and v_inv.expires_at <= now())
     or (v_inv.max_uses is not null and v_inv.use_count >= v_inv.max_uses) then
    return;
  end if;

  select * into v_group from public.groups g
  where g.id = v_inv.group_id and g.deleted_at is null;
  if not found then
    return;
  end if;

  group_id         := v_group.id;
  group_name       := v_group.name;
  group_avatar_url := v_group.avatar_url;
  join_policy      := v_group.join_policy;

  select coalesce(p.display_name, p.first_name || ' ' || left(p.last_name, 1) || '.')
    into inviter_name
  from public.profiles p where p.id = v_inv.created_by;

  select count(*)::int into member_count
  from public.group_members gm
  where gm.group_id = v_group.id and gm.status = 'active';

  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- redeem_group_invite(token): the signed-in user joins the group behind a token
-- link. SECURITY DEFINER so it can write the membership row + bump use_count
-- (the caller is by definition not yet a member, so plain RLS would block both).
-- Honours join_policy (open -> active, approval -> pending). Idempotent: an
-- existing member just gets their current status back and consumes no use. The
-- row is locked FOR UPDATE so concurrent redeems can't exceed max_uses. The
-- 15-member cap trigger still applies to active joins (a full open group raises).
-- ----------------------------------------------------------------------------
create or replace function public.redeem_group_invite(p_token text)
returns table (group_id uuid, status public.member_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_inv      public.group_invites;
  v_group    public.groups;
  v_existing public.group_members;
  v_status   public.member_status;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_inv from public.group_invites gi
  where gi.token = p_token
  for update;

  if not found
     or v_inv.revoked_at is not null
     or (v_inv.expires_at is not null and v_inv.expires_at <= now())
     or (v_inv.max_uses is not null and v_inv.use_count >= v_inv.max_uses) then
    raise exception 'invite is invalid or expired' using errcode = 'P0001';
  end if;

  select * into v_group from public.groups g
  where g.id = v_inv.group_id and g.deleted_at is null;
  if not found then
    raise exception 'invite is invalid or expired' using errcode = 'P0001';
  end if;

  -- Idempotent: already a member -> report current status, consume no use.
  select * into v_existing from public.group_members gm
  where gm.group_id = v_inv.group_id and gm.user_id = v_uid;
  if found then
    group_id := v_existing.group_id;
    status   := v_existing.status;
    return next;
    return;
  end if;

  v_status := case when v_group.join_policy = 'open'
                   then 'active'::public.member_status
                   else 'pending'::public.member_status end;

  insert into public.group_members (group_id, user_id, role, status)
  values (v_inv.group_id, v_uid, 'member', v_status);

  update public.group_invites
  set use_count = use_count + 1
  where id = v_inv.id;

  group_id := v_inv.group_id;
  status   := v_status;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- Function grants. Preview is open to anon + authenticated (pre-signup view);
-- redeem requires a signed-in caller. Revoke from public/anon first so the
-- grant is explicit (not inherited via the default PUBLIC execute).
-- ----------------------------------------------------------------------------
revoke execute on function public.get_invite_preview(text)   from public, anon, authenticated;
revoke execute on function public.redeem_group_invite(text)  from public, anon, authenticated;
grant  execute on function public.get_invite_preview(text)   to anon, authenticated;
grant  execute on function public.redeem_group_invite(text)  to authenticated;

-- ============================================================================
-- RLS — deny-by-default; both tables admin-managed. auth.uid() wrapped in a
-- subselect so the planner caches it per-statement.
-- ============================================================================

-- ---- group_invites ---------------------------------------------------------
alter table public.group_invites enable row level security;

grant select, insert, update, delete on public.group_invites to authenticated;

-- Read: admins see the group's invites (token lookup by non-members goes
-- through get_invite_preview, not this policy).
create policy group_invites_select_admins
  on public.group_invites
  for select
  to authenticated
  using (public.is_group_admin(group_id));

-- Create: admins, as themselves.
create policy group_invites_insert_admins
  on public.group_invites
  for insert
  to authenticated
  with check (public.is_group_admin(group_id) and created_by = (select auth.uid()));

-- Update (revoke, adjust expiry/limits): admins. use_count bumps happen in the
-- SECURITY DEFINER redeem RPC, which bypasses this.
create policy group_invites_update_admins
  on public.group_invites
  for update
  to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

-- Delete: admins.
create policy group_invites_delete_admins
  on public.group_invites
  for delete
  to authenticated
  using (public.is_group_admin(group_id));

-- ---- pending_invites -------------------------------------------------------
alter table public.pending_invites enable row level security;

grant select, insert, update, delete on public.pending_invites to authenticated;

-- Read: admins. (The invitee has no account yet; once they sign up the row is
-- consumed by the trigger, so there is no "see my own pending invites" path.)
create policy pending_invites_select_admins
  on public.pending_invites
  for select
  to authenticated
  using (public.is_group_admin(group_id));

-- Create: admins, as themselves.
create policy pending_invites_insert_admins
  on public.pending_invites
  for insert
  to authenticated
  with check (public.is_group_admin(group_id) and invited_by = (select auth.uid()));

-- Update: admins (e.g. change role/expiry before consumption).
create policy pending_invites_update_admins
  on public.pending_invites
  for update
  to authenticated
  using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

-- Delete: admins (rescind). Consumption on signup is done by the trigger.
create policy pending_invites_delete_admins
  on public.pending_invites
  for delete
  to authenticated
  using (public.is_group_admin(group_id));
