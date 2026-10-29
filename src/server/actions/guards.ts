import "server-only";
import { notFound } from "next/navigation";
import { requireUser, type CurrentUser } from "@/server/auth/session";
import { canDispatch, canManage, getMyOrganization, type OrganizationWithRole } from "@/server/data/organizations";
import { UserFacingError } from "@/server/errors";
import { uuid } from "@/lib/schemas";

/** For pages: the org if the user is a member, otherwise 404. */
export async function requireMembership(orgId: string): Promise<{ user: CurrentUser; org: OrganizationWithRole }> {
  const user = await requireUser();
  if (!uuid.safeParse(orgId).success) notFound();
  const org = await getMyOrganization(user.id, orgId);
  if (!org) notFound();
  return { user, org };
}

/** For actions: the org if the user is an owner or admin of it. */
export async function requireOrgManager(orgId: unknown): Promise<{ user: CurrentUser; org: OrganizationWithRole }> {
  const user = await requireUser();
  const parsed = uuid.safeParse(orgId);
  const org = parsed.success ? await getMyOrganization(user.id, parsed.data) : null;
  if (!org || !canManage(org.my_role)) {
    throw new UserFacingError("You don't have permission to change this organization.");
  }
  return { user, org };
}

/** For job actions: the contractor org if the user is an owner, admin or dispatcher of it. */
export async function requireDispatcher(orgId: unknown): Promise<{ user: CurrentUser; org: OrganizationWithRole }> {
  const user = await requireUser();
  const parsed = uuid.safeParse(orgId);
  const org = parsed.success ? await getMyOrganization(user.id, parsed.data) : null;
  if (!org || org.kind !== "contractor" || !canDispatch(org.my_role)) {
    throw new UserFacingError("You don't have permission to manage jobs for this business.");
  }
  return { user, org };
}
