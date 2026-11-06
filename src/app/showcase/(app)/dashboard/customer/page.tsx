import type { Metadata } from "next";
import { CustomerRequestsPanel, InvoicesToPay } from "@/components/app/org-overview";
import { StatTiles } from "@/components/app/stat-tiles";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatCents } from "@/lib/labels";
import { sampleCustomerRequests, sampleInvoicesToPay } from "@/showcase/data";

export const metadata: Metadata = { title: "Customer dashboard" };
export const dynamic = "force-dynamic";

/** Harbor Point Properties' overview, from sample records (D-047). */
export default function ShowcaseCustomerDashboard() {
  const requests = sampleCustomerRequests();
  const invoices = sampleInvoicesToPay();
  const quotes = requests.reduce((n, r) => n + (r.status === "open" ? r.quote_count : 0), 0);
  const due = invoices.reduce((n, i) => n + Number(i.total_cents), 0);
  return (
    <>
      <PageHeader
        title="Harbor Point Properties"
        meta={<Badge dot tone="ok">Sample customer</Badge>}
        description="Customer · Suffolk County, NY · Viewing as Dana, the owner"
      />
      <div className="space-y-6">
        <StatTiles
          tiles={[
            { label: "Active requests", value: requests.length, href: "/showcase/dashboard/customer", icon: "inbox" },
            { label: "Quotes to compare", value: quotes, href: "/showcase/dashboard/customer", icon: "quote", highlight: true, hint: "Waiting for your decision" },
            { label: "Invoices to pay", value: formatCents(due), href: "/showcase/dashboard/customer", icon: "invoice", highlight: true, hint: "1 invoice due" },
          ]}
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-6">
            <InvoicesToPay orgId="sample" invoices={invoices} />
            <CustomerRequestsPanel orgId="sample" requests={requests} canPost={false} />
          </div>
          <Card className="self-start">
            <CardHeader title="How hiring works" />
            <CardBody className="space-y-2 text-sm text-ink-soft">
              <p>Post the work once. Approved contractors who serve the town quote, and you compare price, timing and reviews side by side.</p>
              <p>Accept one quote and only that contractor sees the site address. Invoices and card payments run through QuickPro.</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
