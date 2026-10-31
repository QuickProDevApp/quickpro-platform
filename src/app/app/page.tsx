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
        description="Your businesses and profiles on QuickPro."
        actions={
          <LinkButton href="/app/onboarding" variant="secondary">
            Add a business or profile
          </LinkButton>
        }
      />
      <Card className="max-w-3xl">
        <ul className="divide-y divide-line">
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
        </ul>
      </Card>
    </>
  );
}

function HubCard({ href, title, subtitle, badge }: { href: string; title: string; subtitle: string; badge?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-subtle/60 sm:px-5">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-navy text-sm font-semibold text-white">
          {title.charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink">{title}</span>
          <span className="block truncate text-[13px] text-muted">{subtitle}</span>
        </span>
        {badge}
        <span aria-hidden className="text-faint">›</span>
      </Link>
    </li>
  );
}
