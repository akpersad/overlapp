-- ============================================================================
-- Migration: create_proposals  (Phase 3 — multi-date scheduling)
-- DATA-MODEL.md §10 (proposals / options / responses) · §11 (RLS posture) ·
-- spec §6 (multi-date proposal journey).
--
-- The scheduling action layer. A member seeds several candidate date/times; the
-- group marks availability per option (pre-filled from their general
-- availability — low effort); Overlapp computes the overlap; the proposer locks
-- the final slot. Quorum ("good enough", e.g. 4 of 5) comes from groups.quorum
-- (null = everyone).
--
-- Tables (§10):
--   • proposals          — one scheduling ask, owned by its group.
--   • proposal_options   — candidate slots seeded by the proposer.
--   • proposal_responses — each member's yes/no/maybe per option.
--
-- RLS: read = group members; proposals/options write = proposer or admins;
-- responses write = self only. Status transitions (lock/cancel) go through
-- SECURITY DEFINER RPCs so the privileged checks are centralised.
-- ============================================================================

create type public.proposal_status as enum ('draft', 'open', 'locked', 'cancelled');
create type public.rsvp            as enum ('yes', 'no', 'maybe');

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
create table public.proposals (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  created_by   uuid not null references public.profiles (id),
  title        text not null,
  description  text,
  status       public.proposal_status not null default 'open',
  pinned_tz    text,                                    -- when the event's TZ matters (e.g. a flight)
  final_option uuid,                                    -- → proposal_options.id once locked (FK below)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.proposals is
  'A multi-date scheduling ask owned by a group (DATA-MODEL §10). Read: group members. Write: proposer/admins; status transitions via RPCs.';

create index proposals_group_id_idx on public.proposals (group_id);

create trigger proposals_set_updated_at
  before update on public.proposals
  for each row execute function public.set_updated_at();

create table public.proposal_options (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  constraint proposal_options_time_order check (ends_at > starts_at)
);

comment on table public.proposal_options is
  'Candidate slots seeded by the proposer. Read: group members. Write: proposer/admins.';

create index proposal_options_proposal_id_idx on public.proposal_options (proposal_id);

-- final_option references an option of the same proposal; set on lock.
alter table public.proposals
  add constraint proposals_final_option_fk
  foreign key (final_option) references public.proposal_options (id) on delete set null;

create table public.proposal_responses (
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  option_id   uuid not null references public.proposal_options (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  response    public.rsvp not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (option_id, user_id)
);

comment on table public.proposal_responses is
  'Each member''s yes/no/maybe per option. Read: group members. Write: self only.';

create index proposal_responses_proposal_id_idx on public.proposal_responses (proposal_id);
create index proposal_responses_user_id_idx on public.proposal_responses (user_id);

create trigger proposal_responses_set_updated_at
  before update on public.proposal_responses
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER, so they can resolve a proposal's group / proposer
-- without recursing through the proposals RLS policy). Referenced inside RLS
-- policies, so authenticated retains EXECUTE; off anon/public.
-- ----------------------------------------------------------------------------
create or replace function public.proposal_group_id(p_proposal_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select group_id from public.proposals where id = p_proposal_id;
$$;

-- "May the caller manage this proposal?" = its proposer, or an admin/owner of
-- its group. Powers the option write policies and is reused by the lock/cancel
-- RPCs' equivalent inline checks.
create or replace function public.can_manage_proposal(p_proposal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.proposals p
    where p.id = p_proposal_id
      and (p.created_by = (select auth.uid()) or public.is_group_admin(p.group_id))
  );
$$;

revoke execute on function public.proposal_group_id(uuid)  from public, anon;
revoke execute on function public.can_manage_proposal(uuid) from public, anon;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.proposals enable row level security;
grant select, insert, update, delete on public.proposals to authenticated;

create policy proposals_select_member
  on public.proposals for select to authenticated
  using (public.is_group_member(group_id));

create policy proposals_insert_member
  on public.proposals for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_group_member(group_id));

create policy proposals_update_manager
  on public.proposals for update to authenticated
  using (created_by = (select auth.uid()) or public.is_group_admin(group_id))
  with check (created_by = (select auth.uid()) or public.is_group_admin(group_id));

create policy proposals_delete_manager
  on public.proposals for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_group_admin(group_id));

alter table public.proposal_options enable row level security;
grant select, insert, update, delete on public.proposal_options to authenticated;

create policy proposal_options_select_member
  on public.proposal_options for select to authenticated
  using (public.is_group_member(public.proposal_group_id(proposal_id)));

create policy proposal_options_insert_manager
  on public.proposal_options for insert to authenticated
  with check (public.can_manage_proposal(proposal_id));

create policy proposal_options_update_manager
  on public.proposal_options for update to authenticated
  using (public.can_manage_proposal(proposal_id))
  with check (public.can_manage_proposal(proposal_id));

create policy proposal_options_delete_manager
  on public.proposal_options for delete to authenticated
  using (public.can_manage_proposal(proposal_id));

alter table public.proposal_responses enable row level security;
grant select, insert, update, delete on public.proposal_responses to authenticated;

create policy proposal_responses_select_member
  on public.proposal_responses for select to authenticated
  using (public.is_group_member(public.proposal_group_id(proposal_id)));

create policy proposal_responses_insert_self
  on public.proposal_responses for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_group_member(public.proposal_group_id(proposal_id))
  );

create policy proposal_responses_update_self
  on public.proposal_responses for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy proposal_responses_delete_self
  on public.proposal_responses for delete to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================================
-- RPCs
-- ============================================================================

-- create_proposal — atomically insert a proposal + its candidate options.
-- Any active member may propose. Options arrive as a JSON array of
-- {starts_at, ends_at} ISO strings. Returns the new proposal id.
create or replace function public.create_proposal(
  p_group_id    uuid,
  p_title       text,
  p_description text,
  p_pinned_tz   text,
  p_options     jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
  v_opt jsonb;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_group_member(p_group_id) then
    raise exception 'only a group member can create a proposal' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'a title is required' using errcode = '22023';
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array'
     or jsonb_array_length(p_options) = 0 then
    raise exception 'at least one candidate option is required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_options) > 20 then
    raise exception 'too many options (max 20)' using errcode = '22023';
  end if;

  insert into public.proposals (group_id, created_by, title, description, status, pinned_tz)
  values (
    p_group_id,
    v_uid,
    btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    'open',
    nullif(btrim(coalesce(p_pinned_tz, '')), '')
  )
  returning id into v_id;

  for v_opt in select * from jsonb_array_elements(p_options) loop
    insert into public.proposal_options (proposal_id, starts_at, ends_at)
    values (
      v_id,
      (v_opt->>'starts_at')::timestamptz,
      (v_opt->>'ends_at')::timestamptz
    );
  end loop;

  return v_id;
end;
$$;

comment on function public.create_proposal(uuid, text, text, text, jsonb) is
  'Atomically create a proposal + its candidate options. Member-gated; created_by = caller. Returns the proposal id.';

-- proposal_results — per-option tally + quorum verdict. Member-gated.
-- available_count = yes responses; meets_quorum compares it to the group's
-- quorum (groups.quorum, or everyone when null). De-identification is N/A here:
-- members explicitly RSVP to THIS event, so counts are theirs to see.
create or replace function public.proposal_results(p_proposal_id uuid)
returns table (
  option_id      uuid,
  starts_at      timestamptz,
  ends_at        timestamptz,
  yes_count      int,
  maybe_count    int,
  no_count       int,
  available_count int,
  response_count int,
  total_members  int,
  quorum         int,
  meets_quorum   boolean
)
language plpgsql
stable
security definer
set search_path = ''
set timezone = 'UTC'
as $$
declare
  v_group  uuid;
  v_total  int;
  v_quorum int;
begin
  select group_id into v_group from public.proposals where id = p_proposal_id;
  if v_group is null or not public.is_group_member(v_group) then
    return;
  end if;

  select count(*)::int into v_total
  from public.group_members
  where group_id = v_group and status = 'active';

  select coalesce(g.quorum, v_total) into v_quorum
  from public.groups g where g.id = v_group;

  return query
    select
      o.id,
      o.starts_at,
      o.ends_at,
      count(*) filter (where r.response = 'yes')::int   as yes_count,
      count(*) filter (where r.response = 'maybe')::int as maybe_count,
      count(*) filter (where r.response = 'no')::int    as no_count,
      count(*) filter (where r.response = 'yes')::int   as available_count,
      count(r.user_id)::int                             as response_count,
      v_total                                           as total_members,
      v_quorum                                          as quorum,
      (count(*) filter (where r.response = 'yes') >= v_quorum) as meets_quorum
    from public.proposal_options o
    left join public.proposal_responses r on r.option_id = o.id
    where o.proposal_id = p_proposal_id
    group by o.id, o.starts_at, o.ends_at
    order by o.starts_at;
end;
$$;

comment on function public.proposal_results(uuid) is
  'Per-option yes/no/maybe tally + quorum verdict for a proposal. Member-gated. available_count = yes; meets_quorum vs groups.quorum (null = everyone).';

-- suggest_proposal_rsvps — the low-effort pre-fill: for each option, suggest
-- 'no' if it overlaps the caller's own busy time, else 'yes'. SECURITY INVOKER:
-- reads options via the caller's RLS and my_busy_intervals (self-scoped).
create or replace function public.suggest_proposal_rsvps(p_proposal_id uuid)
returns table (option_id uuid, suggested public.rsvp)
language sql
stable
security invoker
set search_path = ''
set timezone = 'UTC'
as $$
  select
    o.id,
    case when exists (
      select 1
      from public.my_busy_intervals(o.starts_at, o.ends_at) b
      where b.starts_at < o.ends_at and b.ends_at > o.starts_at
    ) then 'no'::public.rsvp else 'yes'::public.rsvp end
  from public.proposal_options o
  where o.proposal_id = p_proposal_id
  order by o.starts_at;
$$;

comment on function public.suggest_proposal_rsvps(uuid) is
  'Pre-fill suggestion: per option, ''no'' if it overlaps the caller''s busy time, else ''yes''. SECURITY INVOKER (self-scoped).';

-- lock_proposal — proposer/admin picks the final option. Sets final_option +
-- status='locked'.
create or replace function public.lock_proposal(p_proposal_id uuid, p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_group   uuid;
  v_creator uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select group_id, created_by into v_group, v_creator
  from public.proposals where id = p_proposal_id;
  if v_group is null then
    raise exception 'proposal not found' using errcode = 'P0001';
  end if;
  if not (v_creator = v_uid or public.is_group_admin(v_group)) then
    raise exception 'only the proposer or an admin can lock this proposal' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.proposal_options
    where id = p_option_id and proposal_id = p_proposal_id
  ) then
    raise exception 'that option does not belong to this proposal' using errcode = '22023';
  end if;

  update public.proposals
  set final_option = p_option_id, status = 'locked', updated_at = now()
  where id = p_proposal_id;
end;
$$;

comment on function public.lock_proposal(uuid, uuid) is
  'Proposer/admin locks a proposal to a chosen option (status → locked, final_option set).';

-- cancel_proposal — proposer/admin cancels the ask.
create or replace function public.cancel_proposal(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_group   uuid;
  v_creator uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select group_id, created_by into v_group, v_creator
  from public.proposals where id = p_proposal_id;
  if v_group is null then
    raise exception 'proposal not found' using errcode = 'P0001';
  end if;
  if not (v_creator = v_uid or public.is_group_admin(v_group)) then
    raise exception 'only the proposer or an admin can cancel this proposal' using errcode = '42501';
  end if;

  update public.proposals
  set status = 'cancelled', updated_at = now()
  where id = p_proposal_id;
end;
$$;

comment on function public.cancel_proposal(uuid) is
  'Proposer/admin cancels a proposal (status → cancelled).';

-- ----------------------------------------------------------------------------
-- Grants — all RPCs require a signed-in caller. Revoke-then-grant so each is
-- explicit. (proposal_group_id / can_manage_proposal were granted to
-- authenticated above by being created without revoke; revoke anon there.)
-- ----------------------------------------------------------------------------
revoke execute on function public.create_proposal(uuid, text, text, text, jsonb) from public, anon;
revoke execute on function public.proposal_results(uuid)                          from public, anon;
revoke execute on function public.suggest_proposal_rsvps(uuid)                    from public, anon;
revoke execute on function public.lock_proposal(uuid, uuid)                       from public, anon;
revoke execute on function public.cancel_proposal(uuid)                           from public, anon;

grant execute on function public.create_proposal(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.proposal_results(uuid)                          to authenticated;
grant execute on function public.suggest_proposal_rsvps(uuid)                    to authenticated;
grant execute on function public.lock_proposal(uuid, uuid)                       to authenticated;
grant execute on function public.cancel_proposal(uuid)                           to authenticated;
