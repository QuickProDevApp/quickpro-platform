import "server-only";
import { withUser } from "@/server/db/client";
import type { ReviewStatus } from "@/lib/labels";
import { listMyOrganizations, type OrganizationSummary } from "./organizations";

export type Roles = {
  organizations: OrganizationSummary[];
  worker: { status: ReviewStatus } | null;
};

/** What the signed-in user can do in QuickPro, used for navigation and routing. */
export async function getMyRoles(userId: string): Promise<Roles> {
  const [organizations, worker] = await Promise.all([
    listMyOrganizations(userId),
    withUser(userId, (tx) => tx<{ status: ReviewStatus }[]>`
      select status from public.worker_profiles where user_id = ${userId}
    `),
  ]);
  return { organizations, worker: worker[0] ?? null };
}
