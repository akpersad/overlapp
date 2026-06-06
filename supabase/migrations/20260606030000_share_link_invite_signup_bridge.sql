-- ----------------------------------------------------------------------------
-- Bridge share-link invites into the email-keyed pending_invites path.
--
-- DATA-MODEL.md §4 (invite links) · §5 (email-keyed pending invites).
--
-- Problem: an email-keyed pending_invite is consumed by handle_new_user() at
-- signup, so an email-invited person is auto-joined the moment they create an
-- account. A SHARE-LINK invitee, however, only redeems their token AFTER signup
-- by returning to /invite/<token> — and in production (email confirmation on)
-- the post-confirm redirect drops that token, so they land on the dashboard
-- never joined. register_invite_signup() closes that gap: the signUp server
-- action calls it (anon client) with the token + the email being registered
-- BEFORE auth.signUp, recording a pending_invite that handle_new_user() then
-- consumes — identical to the email-invite path, no template/redirect changes.
--
-- SECURITY DEFINER (anon-executable): the caller already holds a valid share
-- token, so they could join the group directly; recording a pending invite for
-- the email being signed up grants no access beyond what the token allows.
-- Token validation mirrors get_invite_preview() / redeem_group_invite().
-- ----------------------------------------------------------------------------
create or replace function public.register_invite_signup(p_token text, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv   public.group_invites;
  v_group public.groups;
begin
  if p_token is null or btrim(p_token) = '' or p_email is null or btrim(p_email) = '' then
    return;
  end if;

  select * into v_inv from public.group_invites gi where gi.token = p_token;

  -- Same validity gate as get_invite_preview(): invalid/expired/revoked/used-up
  -- tokens silently no-op (never block the signup).
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

  -- Email is normalised (lower/trim) by the pending_invites BEFORE-INSERT
  -- trigger, matching how handle_new_user() looks it up. ON CONFLICT leaves an
  -- existing row (e.g. a prior email invite) untouched.
  insert into public.pending_invites (group_id, email, role, invited_by)
  values (v_group.id, p_email, 'member', v_inv.created_by)
  on conflict (group_id, email) do nothing;
end;
$$;

comment on function public.register_invite_signup(text, text) is
  'Records a pending_invite from a valid share-link token at signup so handle_new_user() auto-joins the new account. SECURITY DEFINER; grants no access beyond the token the caller already holds.';

-- Anon-callable: invoked pre-signup, before any session exists.
revoke execute on function public.register_invite_signup(text, text) from public, anon, authenticated;
grant  execute on function public.register_invite_signup(text, text) to anon, authenticated;
