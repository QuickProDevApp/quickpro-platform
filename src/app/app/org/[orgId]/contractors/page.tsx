import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonClass, LinkButton } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { FormMessage, Select } from "@/components/ui/form";
import { uuid } from "@/lib/schemas";
import { requireMembership } from "@/server/actions/guards";
import { canDispatch } from "@/server/data/organizations";
import { listCategories, listServiceAreas } from "@/server/data/reference";
import { contractorDirectory } from "@/server/data/requests";

export const metadata: Metadata = { title: "Contractors" };

export default async function ContractorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ service?: string; town?: string }>;
}) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (org.kind !== "customer") notFound();
  if (org.status !== "approved") {
    return <FormMessage tone="info">You can browse contractors once QuickPro staff approve your organization.</FormMessage>;
  }
  const query = await searchParams;
  const service = uuid.safeParse(query.service).success ? query.service! : null;
  const town = uuid.safeParse(query.town).success ? query.town! : null;
  const [categories, areas, contractors] = await Promise.all([
    listCategories(user.id),
    listServiceAreas(user.id, org.market_id),
    contractorDirectory(user.id, org.id, service, town),
  ]);
  const base = `/app/org/${org.id}/contractors`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* A plain GET form: filters live in the URL and work without JavaScript. */}
        <form method="get" action={base} className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
          <label className="min-w-0 flex-1 sm:w-56 sm:flex-none">
            <span className="mb-1 block text-xs font-medium text-muted">Service</span>
            <Select name="service" defaultValue={service ?? ""}>
              <option value="">All services</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="min-w-0 flex-1 sm:w-48 sm:flex-none">
            <span className="mb-1 block text-xs font-medium text-muted">Town</span>
            <Select name="town" defaultValue={town ?? ""}>
              <option value="">All towns</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>
          <button type="submit" className={buttonClass("secondary")}>
            Filter
          </button>
        </form>
        {canDispatch(org.my_role) ? (
          <LinkButton href={`/app/org/${org.id}/requests/new`}>Request service</LinkButton>
        ) : null}
      </div>
      <p className="text-[13px] text-muted">
        {contractors.length} approved {contractors.length === 1 ? "contractor" : "contractors"} in {org.market_name}. QuickPro
        staff review each business and its general liability certificate before it can quote. To ask one for a price, post a
        request and invite them from it.
      </p>
      <Card>
        {contractors.length === 0 ? (
          <div className="p-4 sm:p-5">
            <EmptyState title="No approved contractors match these filters" />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {contractors.map((c) => (
              <li key={c.id} className="px-4 py-4 sm:px-5" data-testid="contractor-row">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{c.name}</p>
                    <p className="text-[13px] text-muted">
                      {[
                        c.years_in_business != null ? `${c.years_in_business} years in business` : null,
                        c.crew_size != null ? `Crew of ${c.crew_size}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Approved on QuickPro"}
                    </p>
                  </div>
                  {c.insurance_reviewed ? <Badge tone="neutral">Liability certificate reviewed</Badge> : null}
                </div>
                {c.description ? <p className="mt-2 line-clamp-3 text-sm text-ink-soft">{c.description}</p> : null}
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
                  <dt className="text-muted">Services</dt>
                  <dd className="text-ink-soft">{c.category_names.join(", ") || "—"}</dd>
                  <dt className="text-muted">Towns</dt>
                  <dd className="text-ink-soft">{c.area_names.join(", ") || "—"}</dd>
                </dl>
                {c.website ? (
                  <a href={c.website} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block text-[13px] text-brand hover:underline">
                    {c.website.replace(/^https?:\/\//, "")}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
