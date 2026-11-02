import { Fact } from "@/components/app/job-summary";
import { formatBudget, formatDate, formatDateRange } from "@/lib/labels";
import type { RequestSite, ServiceRequest } from "@/server/data/requests";

/** The facts of a service request, shared by the customer, contractor and staff views. */
export function RequestFacts({ request, showCustomer = false }: { request: ServiceRequest; showCustomer?: boolean }) {
  return (
    <dl className="divide-y divide-line text-sm">
      {showCustomer ? <Fact label="Customer" value={request.customer_name} /> : null}
      <Fact label="Service" value={request.category_name} />
      <Fact label="Town" value={`${request.area_name}, NY`} />
      <Fact
        label="Dates"
        value={formatDateRange(request.preferred_start, request.preferred_end)}
        detail={request.preferred_end ? "Preferred start to finish" : "Preferred start"}
      />
      <Fact label="Budget" value={formatBudget(request.budget_min_cents, request.budget_max_cents) ?? "Not given"} />
      <Fact label="Posted" value={formatDate(request.created_at)} />
    </dl>
  );
}

export function RequestSiteFacts({ site }: { site: RequestSite }) {
  return (
    <dl className="divide-y divide-line text-sm">
      <Fact label="Address" value={`${site.address_line1}, ${site.city}, NY ${site.postal_code}`} />
      <Fact label="Contact" value={site.contact_name} detail={site.contact_phone} />
      {site.access_notes ? <Fact label="Access" value={site.access_notes} /> : null}
    </dl>
  );
}
