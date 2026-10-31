"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgManager } from "@/server/actions/guards";
import { requireUser } from "@/server/auth/session";
import { changeMemberRole, inviteMember, removeMember, revokeInvitation } from "@/server/data/team";
import { env } from "@/server/env";
import { toUserMessage } from "@/server/errors";
import { fieldErrorsOf, formObject, inviteSchema, memberRoleSchema, uuid, type FormState } from "@/lib/schemas";

export type InviteState = FormState & { link?: string; email?: string };

function refresh(orgId: string) {
  revalidatePath(`/app/org/${orgId}/team`);
}

export async function inviteMemberAction(orgId: string, _: InviteState, formData: FormData): Promise<InviteState> {
  try {
    const { user, org } = await requireOrgManager(orgId);
    const parsed = inviteSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    const token = await inviteMember(user.id, org.id, parsed.data.email, parsed.data.role);
    refresh(org.id);
    return {
      ok: true,
      message: "Invitation created.",
      email: parsed.data.email,
      link: `${env().NEXT_PUBLIC_SITE_URL}/app/invite/${token}`,
    };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function revokeInvitationAction(orgId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, org } = await requireOrgManager(orgId);
    const id = uuid.safeParse(formData.get("invitationId"));
    if (!id.success) return { ok: false, message: "That invitation was not found." };
    await revokeInvitation(user.id, id.data);
    refresh(org.id);
    return { ok: true, message: "Invitation withdrawn." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function changeMemberRoleAction(orgId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, org } = await requireOrgManager(orgId);
    const parsed = memberRoleSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, message: "Choose a role." };
    await changeMemberRole(user.id, org.id, parsed.data.userId, parsed.data.role);
    refresh(org.id);
    return { ok: true, message: "Role updated." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function removeMemberAction(orgId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, org } = await requireOrgManager(orgId);
    const memberId = uuid.safeParse(formData.get("userId"));
    if (!memberId.success) return { ok: false, message: "That person was not found." };
    await removeMember(user.id, org.id, memberId.data);
    refresh(org.id);
    return { ok: true, message: "Removed from the team." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

/** Any member may leave, except the last owner (checked in the database). */
export async function leaveOrganizationAction(orgId: string): Promise<FormState> {
  const user = await requireUser();
  const id = uuid.safeParse(orgId);
  if (!id.success) return { ok: false, message: "That organization was not found." };
  try {
    await removeMember(user.id, id.data, user.id);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath("/app", "layout");
  redirect("/app");
}
