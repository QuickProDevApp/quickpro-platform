import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, Select, SubmitButton } from "@/components/ui/form";
import { INVITABLE_ROLES } from "@/lib/schemas";
import { ORG_ROLE_LABEL, type OrgRole } from "@/lib/labels";
import { requireMembership } from "@/server/actions/guards";
import { canManage } from "@/server/data/organizations";
import { listMembers, listOpenInvitations } from "@/server/data/team";
import {
  changeMemberRoleAction,
  inviteMemberAction,
  leaveOrganizationAction,
  removeMemberAction,
  revokeInvitationAction,
} from "./actions";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Team" };

const ALL_ROLES: OrgRole[] = ["owner", "admin", "dispatcher", "member"];
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

export default async function TeamPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  const manager = canManage(org.my_role);
  const isOwner = org.my_role === "owner";
  const [members, invitations] = await Promise.all([
    listMembers(user.id, org.id),
    manager ? listOpenInvitations(user.id, org.id) : Promise.resolve([]),
  ]);

  // Mirrors the database rules so the page only offers changes that can work.
  const canEdit = (role: OrgRole) => manager && (isOwner || (role !== "owner" && role !== "admin"));
  const assignable = isOwner ? ALL_ROLES : ALL_ROLES.filter((r) => r === "dispatcher" || r === "member");
  const invitable = isOwner ? INVITABLE_ROLES : INVITABLE_ROLES.filter((r) => r !== "admin");

  return (
    <div className="grid gap-6">
      {manager ? (
        <Card>
          <CardHeader
            title="Invite someone"
            description="QuickPro doesn't email invitations yet. Create a link here and send it yourself by text or email."
          />
          <CardBody>
            <InviteForm action={inviteMemberAction.bind(null, org.id)} roles={invitable} />
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Members" description={`${members.length} ${members.length === 1 ? "person" : "people"}`} />
        <ul className="divide-y divide-line">
          {members.map((m) => {
            const self = m.user_id === user.id;
            return (
              <li key={m.user_id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid="member-row">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {m.full_name || m.email} {self ? <span className="text-muted">(you)</span> : null}
                  </p>
                  <p className="truncate text-sm text-muted">{m.email}</p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  {canEdit(m.role) && !self ? (
                    <>
                      <ActionForm action={changeMemberRoleAction.bind(null, org.id)} className="flex flex-wrap items-start gap-2">
                        <input type="hidden" name="userId" value={m.user_id} />
                        <label htmlFor={`role-${m.user_id}`} className="sr-only">Role for {m.full_name}</label>
                        <Select id={`role-${m.user_id}`} name="role" defaultValue={m.role} className="w-36">
                          {assignable.map((r) => (
                            <option key={r} value={r}>{ORG_ROLE_LABEL[r]}</option>
                          ))}
                        </Select>
                        <SubmitButton variant="secondary">Save role</SubmitButton>
                      </ActionForm>
                      <details className="group">
                        <summary className="flex h-10 cursor-pointer list-none items-center rounded-lg px-3 text-sm font-medium text-bad hover:bg-bad-soft">
                          Remove…
                        </summary>
                        <ActionForm action={removeMemberAction.bind(null, org.id)} className="mt-2 space-y-2" successMessage={false}>
                          <input type="hidden" name="userId" value={m.user_id} />
                          <SubmitButton variant="danger" pendingLabel="Removing…">Remove {m.full_name || m.email}</SubmitButton>
                        </ActionForm>
                      </details>
                    </>
                  ) : (
                    <Badge tone={m.role === "owner" ? "info" : "neutral"}>{ORG_ROLE_LABEL[m.role]}</Badge>
                  )}
                  {self ? (
                    <details>
                      <summary className="flex h-8 cursor-pointer list-none items-center rounded-lg px-3 text-sm font-medium text-ink-soft hover:bg-line/60">
                        Leave…
                      </summary>
                      <ActionForm action={leaveOrganizationAction.bind(null, org.id)} className="mt-2 space-y-2">
                        <p className="text-sm text-muted">You&apos;ll lose access to {org.name}.</p>
                        <SubmitButton variant="danger" pendingLabel="Leaving…">Leave {org.name}</SubmitButton>
                      </ActionForm>
                    </details>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {manager ? (
        <Card>
          <CardHeader title="Open invitations" />
          <CardBody>
            {invitations.length === 0 ? (
              <EmptyState title="No open invitations" />
            ) : (
              <ul className="divide-y divide-line">
                {invitations.map((inv) => (
                  <li key={inv.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="invitation-row">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{inv.email}</p>
                      <p className="text-sm text-muted">
                        {ORG_ROLE_LABEL[inv.role]} · invited {dateFormat.format(inv.created_at)}
                        {inv.invited_by_name ? ` by ${inv.invited_by_name}` : ""} · expires {dateFormat.format(inv.expires_at)}
                      </p>
                    </div>
                    <ActionForm action={revokeInvitationAction.bind(null, org.id)} successMessage={false}>
                      <input type="hidden" name="invitationId" value={inv.id} />
                      <SubmitButton variant="secondary" size="sm" pendingLabel="Withdrawing…">Withdraw</SubmitButton>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
