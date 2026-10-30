import { SubNav } from "@/components/app/nav";
import { ReviewStatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ORGANIZATION_KIND_LABEL } from "@/lib/labels";
import { requireMembership } from "@/server/actions/guards";

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const { org } = await requireMembership(orgId);
  const base = `/app/org/${org.id}`;
  const items = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/profile`, label: "Business profile" },
    ...(org.kind === "contractor"
      ? [
          { href: `${base}/jobs`, label: "Jobs" },
          { href: `${base}/services`, label: "Services & areas" },
        ]
      : []),
    { href: `${base}/documents`, label: "Documents" },
    { href: `${base}/team`, label: "Team" },
  ];
  return (
    <>
      <PageHeader
        title={org.name}
        meta={<ReviewStatusBadge status={org.status} />}
        description={`${ORGANIZATION_KIND_LABEL[org.kind]} · ${org.market_name}, NY · You are ${org.my_role === "owner" ? "the owner" : `a ${org.my_role}`}`}
      />
      <SubNav items={items} />
      {children}
    </>
  );
}
