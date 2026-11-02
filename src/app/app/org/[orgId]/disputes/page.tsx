import type { Metadata } from "next";
import { DisputeList } from "@/components/app/dispute-view";
import { requireMembership } from "@/server/actions/guards";
import { listDisputes } from "@/server/data/disputes";

export const metadata: Metadata = { title: "Disputes" };

export default async function OrganizationDisputesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  const disputes = await listDisputes(user.id, org.id);
  const open = disputes.filter((d) => d.status === "open").length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">
          Disputes{open ? <span className="ml-2 text-sm font-normal text-muted">{open} open</span> : null}
        </h2>
        <p className="text-[13px] text-muted">
          Raise one from the {org.kind === "customer" ? "project" : "project, subcontract or shift"} it&apos;s about.
        </p>
      </div>
      <DisputeList
        disputes={disputes}
        href={(d) => `/app/org/${org.id}/disputes/${d.id}`}
        viewer={{ orgId: org.id }}
        emptyText="Problems raised by your business, or about it, appear here with their discussion and outcome."
      />
    </div>
  );
}
