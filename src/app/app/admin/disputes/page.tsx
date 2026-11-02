import type { Metadata } from "next";
import { DisputeList } from "@/components/app/dispute-view";
import { FilterLinks } from "@/components/app/filter-links";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/server/auth/session";
import { listAdminDisputes, type DisputeStatus } from "@/server/data/disputes";

export const metadata: Metadata = { title: "Disputes" };

const STATUSES: DisputeStatus[] = ["open", "resolved", "withdrawn"];

export default async function AdminDisputesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const admin = await requireAdmin();
  const requested = (await searchParams).show;
  const show = requested === "all" ? null : (STATUSES.find((s) => s === requested) ?? "open");
  const disputes = await listAdminDisputes(admin.id, show);
  return (
    <>
      <PageHeader
        title="Disputes"
        description="Problems raised about projects, subcontracts and shifts. Read both sides, ask on the thread, then close each one with an outcome."
      />
      <FilterLinks
        basePath="/app/admin/disputes"
        param="show"
        current={show === "open" ? undefined : (show ?? "all")}
        options={[
          { value: undefined, label: "Open" },
          { value: "resolved", label: "Closed" },
          { value: "withdrawn", label: "Withdrawn" },
          { value: "all", label: "All" },
        ]}
      />
      <DisputeList
        disputes={disputes}
        href={(d) => `/app/admin/disputes/${d.id}`}
        viewer="staff"
        emptyText={show === "open" ? "Nothing waiting on staff." : "No disputes match this filter."}
      />
    </>
  );
}
