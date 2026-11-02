import type { Metadata } from "next";
import { FilterLinks } from "@/components/app/filter-links";
import { InvoiceList } from "@/components/app/invoices";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/server/auth/session";
import { listAdminInvoices, type InvoiceStatus } from "@/server/data/invoices";

export const metadata: Metadata = { title: "Invoices" };

const STATUSES: InvoiceStatus[] = ["issued", "paid", "void"];

export default async function AdminInvoicesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const admin = await requireAdmin();
  const requested = (await searchParams).show;
  const show = requested === "all" ? null : (STATUSES.find((s) => s === requested) ?? "issued");
  // Drafts are private to the business writing them until issued.
  const invoices = (await listAdminInvoices(admin.id, show)).filter((i) => i.status !== "draft");
  const overdue = invoices.filter((i) => i.overdue).length;
  return (
    <>
      <PageHeader
        title="Invoices"
        description={`Invoices between businesses. Payments happen outside QuickPro; the business that issued an invoice marks it paid.${
          show === "issued" && overdue ? ` ${overdue} overdue.` : ""
        }`}
      />
      <FilterLinks
        basePath="/app/admin/invoices"
        param="show"
        current={show === "issued" ? undefined : (show ?? "all")}
        options={[
          { value: undefined, label: "Awaiting payment" },
          { value: "paid", label: "Paid" },
          { value: "void", label: "Void" },
          { value: "all", label: "All" },
        ]}
      />
      <InvoiceList invoices={invoices} href={(i) => `/app/admin/invoices/${i.id}`} emptyText="No invoices match this filter." />
    </>
  );
}
