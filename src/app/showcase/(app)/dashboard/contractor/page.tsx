import type { Metadata } from "next";
import Link from "next/link";
import { ContractorProjectsPanel, InsuranceCard, Operations, TagList } from "@/components/app/org-overview";
import { StatTiles } from "@/components/app/stat-tiles";
import { Badge, DocumentStatusBadge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { sampleContractorProjects, sampleJobs } from "@/showcase/data";

export const metadata: Metadata = { title: "Contractor dashboard" };
export const dynamic = "force-dynamic";

/** Bayview Build Co.'s overview, from sample records (D-047). */
export default function ShowcaseContractorDashboard() {
  const jobs = sampleJobs();
  const projects = sampleContractorProjects();
  const now = new Date().getTime();
  const expires = new Date(now + 300 * 86_400_000).toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Bayview Build Co."
        meta={<Badge dot tone="ok">Sample business</Badge>}
        description="Contractor · Suffolk County, NY · Viewing as Marcus, the owner"
      />
      <div className="space-y-6">
        <StatTiles
          tiles={[
            { label: "Requests to quote", value: 3, href: "/showcase/dashboard/contractor", icon: "inbox", highlight: true, hint: "Review and quote" },
            { label: "Projects in progress", value: projects.length, href: "/showcase/dashboard/contractor", icon: "hammer" },
            { label: "Upcoming jobs", value: jobs.length, href: "/showcase/dashboard/contractor", icon: "calendar" },
            { label: "Subcontract offers", value: 1, href: "/showcase/dashboard/contractor", icon: "handshake", highlight: true, hint: "Waiting for your answer" },
          ]}
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-6">
            <FormMessage tone="info">
              3 customer requests match your services and towns.{" "}
              <Link href="/contractors" className="font-medium text-brand hover:underline">
                See who else is quoting
              </Link>
            </FormMessage>
            <ContractorProjectsPanel orgId="sample" projects={projects} />
            <Operations orgId="sample" jobs={jobs} canPost={false} now={now} />
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader title="Services" />
              <CardBody className="space-y-3 text-sm">
                <TagList empty="" items={["General construction and labor", "Carpentry", "Painting and drywall"]} />
                <div>
                  <p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">Areas</p>
                  <TagList empty="" items={["Babylon", "Brookhaven", "Islip"]} />
                </div>
              </CardBody>
            </Card>
            <InsuranceCard status="current" documentsHref="/showcase/dashboard/contractor" />
            <Card>
              <CardHeader title="Documents" />
              <CardBody>
                <p className="text-sm font-medium text-ink">General liability certificate of insurance</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <DocumentStatusBadge status="approved" expiresOn={expires} />
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
