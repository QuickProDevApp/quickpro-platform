import { SubNav } from "@/components/app/nav";
import { requireAdmin } from "@/server/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <SubNav
        items={[
          { href: "/app/admin", label: "Overview", exact: true },
          { href: "/app/admin/jobs", label: "Jobs" },
          { href: "/app/admin/organizations", label: "Organizations" },
          { href: "/app/admin/workers", label: "Workers" },
          { href: "/app/admin/documents", label: "Documents" },
          { href: "/app/admin/audit", label: "Audit log" },
        ]}
      />
      {children}
    </>
  );
}
