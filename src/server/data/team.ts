import "server-only";
import { withUser } from "@/server/db/client";
import type { OrgRole } from "@/lib/labels";

export type TeamMember = {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: OrgRole;
  joined_at: Date;
};

export type Invitation = {
  id: string;
  email: string;
  role: OrgRole;
  invited_by_name: string | null;
  created_at: Date;
  expires_at: Date;
};

export type InvitationPreview = {
  organization_id: string;
  organization_name: string;
  role: OrgRole;
  email: string;
  invited_by_name: string | null;
  state: "open" | "accepted" | "revoked" | "expired";
};

export function listMembers(userId: string, orgId: string) {
  return withUser(userId, (tx) => tx<TeamMember[]>`
    select m.user_id, p.full_name, p.email, p.phone, m.role, m.created_at as joined_at
    from public.organization_members m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = ${orgId}
    order by array_position(array['owner', 'admin', 'dispatcher', 'member']::public.org_member_role[], m.role), p.full_name
  `);
}

/** Open invitations. Only owners and admins can read them (RLS); others get none. */
export function listOpenInvitations(userId: string, orgId: string) {
  return withUser(userId, (tx) => tx<Invitation[]>`
    select i.id, i.email, i.role, p.full_name as invited_by_name, i.created_at, i.expires_at
    from public.organization_invitations i
    left join public.profiles p on p.id = i.invited_by
    where i.organization_id = ${orgId} and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    order by i.created_at desc
  `);
}

/** Returns the one-time token for the invitation link. */
export async function inviteMember(userId: string, orgId: string, email: string, role: OrgRole) {
  const [row] = await withUser(userId, (tx) => tx<{ token: string }[]>`
    select public.invite_member(${orgId}, ${email}, ${role}) as token
  `);
  return row.token;
}

export async function revokeInvitation(userId: string, invitationId: string) {
  await withUser(userId, (tx) => tx`select public.revoke_invitation(${invitationId})`);
}

export async function changeMemberRole(userId: string, orgId: string, memberId: string, role: OrgRole) {
  await withUser(userId, (tx) => tx`select public.change_member_role(${orgId}, ${memberId}, ${role})`);
}

export async function removeMember(userId: string, orgId: string, memberId: string) {
  await withUser(userId, (tx) => tx`select public.remove_member(${orgId}, ${memberId})`);
}

export async function getInvitationPreview(userId: string, token: string): Promise<InvitationPreview | null> {
  const rows = await withUser(userId, (tx) => tx<InvitationPreview[]>`select * from public.invitation_preview(${token})`);
  return rows[0] ?? null;
}

export async function acceptInvitation(userId: string, token: string) {
  const [row] = await withUser(userId, (tx) => tx<{ id: string }[]>`select public.accept_invitation(${token}) as id`);
  return row.id;
}
