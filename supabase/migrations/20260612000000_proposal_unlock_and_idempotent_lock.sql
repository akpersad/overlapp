-- Proposal unlock + idempotent lock.
--
-- 1. lock_proposal becomes transition-aware. It used to UPDATE unconditionally
--    and return void, so every repeated "Lock this" click (the action re-runs
--    on each submit) re-fired the locked notification + write-back — the root
--    cause of a member receiving ~9 identical "Event locked" notifications +
--    pushes. It now only transitions status='open' → 'locked' and RETURNS
--    whether it actually transitioned, so the Server Action notifies + writes
--    back exactly once.
--
-- 2. unlock_proposal (new) lets the proposer/admin reverse a lock: status
--    'locked' → 'open', final_option cleared. Returns whether it transitioned so
--    the Server Action only fans out / removes write-back events once.
--
-- Both mirror the existing proposer-or-admin gate (is_group_admin).

-- lock_proposal: void → boolean requires a drop (Postgres can't change the
-- return type of an existing function in place).
drop function if exists public.lock_proposal(uuid, uuid);

create function public.lock_proposal(p_proposal_id uuid, p_option_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_group   uuid;
  v_creator uuid;
  v_rows    integer;
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

  -- Only an open → locked transition counts. A repeat call on an already-locked
  -- proposal is a no-op and returns false (so the caller doesn't re-notify).
  update public.proposals
  set final_option = p_option_id, status = 'locked', updated_at = now()
  where id = p_proposal_id and status = 'open';
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.lock_proposal(uuid, uuid) is
  'Proposer/admin locks an OPEN proposal to a chosen option. Returns true only on the open→locked transition (idempotent on repeat calls).';

-- unlock_proposal: reverse a lock back to open so the group can keep marking
-- availability or pick a different slot. final_option cleared.
create or replace function public.unlock_proposal(p_proposal_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_group   uuid;
  v_creator uuid;
  v_rows    integer;
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
    raise exception 'only the proposer or an admin can unlock this proposal' using errcode = '42501';
  end if;

  update public.proposals
  set status = 'open', final_option = null, updated_at = now()
  where id = p_proposal_id and status = 'locked';
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.unlock_proposal(uuid) is
  'Proposer/admin reverses a lock (status locked→open, final_option cleared). Returns true only on the locked→open transition.';

-- Grants — both require a signed-in caller (anon revoked, authenticated granted).
revoke execute on function public.lock_proposal(uuid, uuid) from public, anon;
revoke execute on function public.unlock_proposal(uuid)     from public, anon;
grant  execute on function public.lock_proposal(uuid, uuid) to authenticated;
grant  execute on function public.unlock_proposal(uuid)     to authenticated;
