import type { Metadata } from "next";
import { FilterLinks } from "@/components/app/filter-links";
import { SupportList } from "@/components/app/support";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/server/auth/session";
import { getSupportCounts, listAdminSupportTickets, type AdminSupportFilter } from "@/server/data/support";

export const metadata: Metadata = { title: "Support" };

const FILTERS: AdminSupportFilter[] = ["needs_reply", "waiting", "mine", "resolved", "all"];

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const admin = await requireAdmin();
  const requested = (await searchParams).show;
  const show = FILTERS.find((f) => f === requested) ?? "needs_reply";
  const [tickets, counts] = await Promise.all([listAdminSupportTickets(admin.id, show), getSupportCounts(admin.id)]);

  return (
    <>
      <PageHeader
        title="Support"
        description={
          counts.urgent
            ? `${counts.urgent} urgent ${counts.urgent === 1 ? "request needs" : "requests need"} a reply. Urgent and high priority first, then longest waiting.`
            : "Requests from customers, contractors and workers. Urgent and high priority first, then longest waiting."
        }
      />
      <FilterLinks
        basePath="/app/admin/support"
        param="show"
        current={show === "needs_reply" ? undefined : show}
        options={[
          { value: undefined, label: `Needs a reply (${counts.needs_reply})` },
          { value: "waiting", label: `Waiting on requester (${counts.waiting})` },
          { value: "mine", label: `Assigned to me (${counts.mine})` },
          { value: "resolved", label: "Resolved" },
          { value: "all", label: "All" },
        ]}
      />
      <SupportList
        tickets={tickets}
        href={(t) => `/app/admin/support/${t.id}`}
        viewer="staff"
        emptyTitle={show === "needs_reply" ? "Nothing waiting on staff" : "No requests match this filter"}
        emptyText={show === "needs_reply" ? "New requests and replies show up here." : ""}
      />
    </>
  );
}
