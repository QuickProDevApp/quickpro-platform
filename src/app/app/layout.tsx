import { AppHeader, type NavItem } from "@/components/app/nav";
import { requireUser } from "@/server/auth/session";
import { getMyRoles } from "@/server/data/home";
import { unreadNotificationCount } from "@/server/data/notifications";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [roles, unread] = await Promise.all([getMyRoles(user.id), unreadNotificationCount(user.id)]);

  const items: NavItem[] = [{ href: "/app", label: "Home", exact: true }];
  for (const org of roles.organizations) items.push({ href: `/app/org/${org.id}`, label: org.name });
  if (roles.worker) items.push({ href: "/app/worker", label: "Work" });
  if (user.isAdmin) items.push({ href: "/app/admin", label: "Staff" });

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader items={items} unread={unread} name={user.fullName} email={user.email} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
