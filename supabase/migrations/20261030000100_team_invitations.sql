-- Team management: invitations and member roles.
--
-- Owners and admins invite people by email. The invitation carries a random
-- token that is shown once (as a link) and stored only as a SHA-256 hash, so
-- a leaked database row cannot be used to join. The invitee accepts while
-- signed in with the invited address. Role changes and removals go through
-- functions that keep at least one owner and stop admins from changing
-- owners or other admins.

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  role public.org_member_role not null check (role <> 'owner'),
  token_hash text not null unique check (length(token_hash) = 64),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  check (accepted_at is null or revoked_at is null)
);

-- One open invitation per address per organization.
create unique index organization_invitations_open_idx
  on public.organization_invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

alter table public.organization_invitations enable row level security;

-- Managers see their organization's invitations (never the token, which is
-- not stored). Invitees look theirs up through invitation_preview().
create policy "org managers and staff read invitations"
  on public.organization_invitations for select to authenticated
  using (app.can_manage_org(organization_id) or app.is_admin());

grant select (id, organization_id, email, role, invited_by, created_at, expires_at, accepted_at, accepted_by, revoked_at)
  on public.organization_invitations to authenticated;

create trigger audit_organization_invitations after insert or update or delete on public.organization_invitations
  for each row execute function app.audit_row_change('organization_invitation', 'id', 'organization_id');

create or replace function app.invitation_token_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex'); $$;

-- Returns the raw token once. The caller builds the link from it.
create or replace function public.invite_member(p_org_id uuid, p_email text, p_role public.org_member_role)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if not app.can_manage_org(p_org_id) then
    raise exception 'Only an owner or admin can invite people to this organization.' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'Invite people as admin, dispatcher or member. An owner can make them an owner after they join.' using errcode = 'P0001';
  end if;
  if p_role = 'admin' and not app.has_org_role(p_org_id, array['owner']::public.org_member_role[]) then
    raise exception 'Only an owner can invite an admin.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.organization_members m join public.profiles p on p.id = m.user_id
    where m.organization_id = p_org_id and lower(p.email) = v_email
  ) then
    raise exception 'That person is already a member of this organization.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.organization_invitations
      where organization_id = p_org_id and accepted_at is null and revoked_at is null and expires_at > now()) >= 50 then
    raise exception 'This organization has 50 open invitations. Revoke some before inviting more.' using errcode = 'P0001';
  end if;

  -- A new invitation to the same address replaces the open one.
  update public.organization_invitations
     set revoked_at = now()
   where organization_id = p_org_id and email = v_email and accepted_at is null and revoked_at is null;

  insert into public.organization_invitations (organization_id, email, role, token_hash, invited_by)
  values (p_org_id, v_email, p_role, app.invitation_token_hash(v_token), auth.uid());

  return v_token;
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.organization_invitations;
begin
  select * into v_inv from public.organization_invitations where id = p_invitation_id for update;
  if not found or not app.can_manage_org(v_inv.organization_id) then
    raise exception 'Invitation not found.' using errcode = 'P0002';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'This invitation was already accepted. Remove the member instead.' using errcode = 'P0001';
  end if;
  update public.organization_invitations set revoked_at = coalesce(revoked_at, now()) where id = p_invitation_id;
end;
$$;

-- What a signed-in person sees on the invitation page.
create or replace function public.invitation_preview(p_token text)
returns table (
  organization_id uuid,
  organization_name text,
  role public.org_member_role,
  email text,
  invited_by_name text,
  state text
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.organization_id, o.name, i.role, i.email, p.full_name,
         case
           when i.accepted_at is not null then 'accepted'
           when i.revoked_at is not null then 'revoked'
           when i.expires_at <= now() then 'expired'
           else 'open'
         end
  from public.organization_invitations i
  join public.organizations o on o.id = i.organization_id
  left join public.profiles p on p.id = i.invited_by
  where i.token_hash = app.invitation_token_hash(p_token)
    and auth.uid() is not null;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_inv public.organization_invitations;
  v_email text;
begin
  if v_user is null then
    raise exception 'Sign in to accept the invitation.' using errcode = '42501';
  end if;
  select * into v_inv from public.organization_invitations
   where token_hash = app.invitation_token_hash(p_token) for update;
  if not found then
    raise exception 'This invitation link is not valid.' using errcode = 'P0002';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'This invitation has already been used.' using errcode = 'P0001';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'This invitation was withdrawn. Ask for a new one.' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'This invitation has expired. Ask for a new one.' using errcode = 'P0001';
  end if;
  select lower(email) into v_email from public.profiles where id = v_user;
  if v_email is distinct from v_inv.email then
    raise exception 'This invitation is for %. Sign in with that email address to accept it.', v_inv.email using errcode = 'P0001';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, v_user, v_inv.role)
  on conflict do nothing;

  update public.organization_invitations set accepted_at = now(), accepted_by = v_user where id = v_inv.id;
  return v_inv.organization_id;
end;
$$;

create or replace function public.change_member_role(p_org_id uuid, p_user_id uuid, p_role public.org_member_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.org_member_role;
  v_is_owner boolean := app.has_org_role(p_org_id, array['owner']::public.org_member_role[]);
begin
  if not app.can_manage_org(p_org_id) then
    raise exception 'Only an owner or admin can change roles.' using errcode = '42501';
  end if;
  select role into v_current from public.organization_members
   where organization_id = p_org_id and user_id = p_user_id for update;
  if not found then
    raise exception 'That person is not a member of this organization.' using errcode = 'P0002';
  end if;
  if not v_is_owner and (v_current in ('owner', 'admin') or p_role in ('owner', 'admin')) then
    raise exception 'Only an owner can change owners and admins.' using errcode = 'P0001';
  end if;
  if v_current = 'owner' and p_role <> 'owner' and (
    select count(*) from public.organization_members where organization_id = p_org_id and role = 'owner'
  ) = 1 then
    raise exception 'Every organization needs an owner. Make someone else an owner first.' using errcode = 'P0001';
  end if;
  update public.organization_members set role = p_role where organization_id = p_org_id and user_id = p_user_id;
end;
$$;

-- Managers remove others; anyone may leave, except the last owner.
create or replace function public.remove_member(p_org_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.org_member_role;
  v_self boolean := p_user_id = auth.uid();
begin
  select role into v_role from public.organization_members
   where organization_id = p_org_id and user_id = p_user_id for update;
  if not found or not (v_self or app.can_manage_org(p_org_id)) then
    raise exception 'That person is not a member of this organization.' using errcode = 'P0002';
  end if;
  if not v_self and v_role in ('owner', 'admin')
     and not app.has_org_role(p_org_id, array['owner']::public.org_member_role[]) then
    raise exception 'Only an owner can remove owners and admins.' using errcode = 'P0001';
  end if;
  if v_role = 'owner' and (
    select count(*) from public.organization_members where organization_id = p_org_id and role = 'owner'
  ) = 1 then
    raise exception 'Every organization needs an owner. Make someone else an owner first.' using errcode = 'P0001';
  end if;
  delete from public.organization_members where organization_id = p_org_id and user_id = p_user_id;
end;
$$;

revoke all on function app.invitation_token_hash(text) from public;
revoke all on function public.invite_member(uuid, text, public.org_member_role) from public;
revoke all on function public.revoke_invitation(uuid) from public;
revoke all on function public.invitation_preview(text) from public;
revoke all on function public.accept_invitation(text) from public;
revoke all on function public.change_member_role(uuid, uuid, public.org_member_role) from public;
revoke all on function public.remove_member(uuid, uuid) from public;
grant execute on function public.invite_member(uuid, text, public.org_member_role) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.invitation_preview(text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.change_member_role(uuid, uuid, public.org_member_role) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
