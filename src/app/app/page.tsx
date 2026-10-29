import Link from "next/link";
import { redirect } from "next/navigation";
import { ReviewStatusBadge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ORGANIZATION_KIND_LABEL } from "@/lib/labels";
import { requireUser } from "@/server/auth/session";
import { getMyRoles } from "@/server/data/home";

export default async function AppHome() {
  const user = await requireUser();
  const roles = await getMyRoles(user.id);
  const count = roles.organizations.length + (roles.worker ? 1 : 0);

  if (count === 0 && !user.isAdmin) redirect("/app/onboarding");
  if (count === 1 && !user.isAdmin) {
    redirect(roles.worker ? "/app/worker" : `/app/org/${roles.organizations[0].id}`);
  }

  return (
    <>
      <PageHeader
        title={`Welcome${user.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}`}
        description="Choose where to work."
        actions={
          <LinkButton href="/app/onboarding" variant="secondary">
            Add a business or profile
          </LinkButton>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {user.isAdmin ? (
          <HubCard href="/app/admin" title="QuickPro staff" subtitle="Reviews, matching and the audit log" />
        ) : null}
        {roles.organizations.map((org) => (
          <HubCard
            key={org.id}
            href={`/app/org/${org.id}`}
            title={org.name}
            subtitle={`${ORGANIZATION_KIND_LABEL[org.kind]} · ${org.role}`}
            badge={<ReviewStatusBadge status={org.status} />}
          />
        ))}
        {roles.worker ? (
          <HubCard
            href="/app/worker"
            title="Worker profile"
            subtitle="Skills, availability and documents"
            badge={<ReviewStatusBadge status={roles.worker.status} />}
          />
        ) : null}
      </div>
    </>
  );
}

function HubCard({ href, title, subtitle, badge }: { href: string; title: string; subtitle: string; badge?: React.ReactNode }) {
  return (
    <Link href={href} className="group">
      <Card className="h-full p-5 transition-shadow group-hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold text-ink">{title}</h2>
          {badge}
        </div>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </Card>
    </Link>
  );
}
