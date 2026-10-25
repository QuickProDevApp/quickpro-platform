import { redirect } from "next/navigation";
import { SubNav } from "@/components/app/nav";
import { ReviewStatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/server/auth/session";
import { getWorkerProfile } from "@/server/data/workers";

export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const profile = await getWorkerProfile(user.id);
  if (!profile) redirect("/app/onboarding?as=worker");
  return (
    <>
      <PageHeader
        title={user.fullName || "Worker profile"}
        meta={<ReviewStatusBadge status={profile.status} />}
        description="Your worker profile is visible to QuickPro staff. Businesses will see it when you apply for their shifts."
      />
      <SubNav
        items={[
          { href: "/app/worker", label: "Overview", exact: true },
          { href: "/app/worker/profile", label: "Profile & skills" },
          { href: "/app/worker/availability", label: "Availability" },
          { href: "/app/worker/documents", label: "Certifications" },
        ]}
      />
      {children}
    </>
  );
}
