import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { NavLinks, type NavItem } from "@/components/app/nav";
import { requireUser } from "@/server/auth/session";
import { getMyRoles } from "@/server/data/home";
import { unreadNotificationCount } from "@/server/data/notifications";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [roles, unread] = await Promise.all([getMyRoles(user.id), unreadNotificationCount(user.id)]);

  const items: NavItem[] = [{ href: "/app", label: "Home", exact: true }];
  for (const org of roles.organizations) items.push({ href: `/app/org/${org.id}`, label: org.name });
  if (roles.worker) items.push({ href: "/app/worker", label: "Worker profile" });
  if (user.isAdmin) items.push({ href: "/app/admin", label: "Staff" });

  return (
    <div className="flex min-h-full flex-col">
      <header className="bg-navy text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex h-14 items-center justify-between gap-4">
            <Logo href="/app" inverted />
            <div className="flex items-center gap-1">
              <Link
                href="/app/notifications"
                className="relative rounded-md p-2 text-blue-100 hover:bg-white/10"
                aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
                data-testid="notifications-link"
              >
                <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 1 1-6 0m6 0H9" />
                </svg>
                {unread > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-bad px-1 text-center text-[11px] font-semibold leading-5 text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </Link>
              <Link href="/app/account" className="hidden max-w-48 truncate rounded-md px-3 py-2 text-sm text-blue-100 hover:bg-white/10 sm:block">
                {user.fullName || user.email}
              </Link>
              <Link href="/app/account" className="rounded-md px-3 py-2 text-sm text-blue-100 hover:bg-white/10 sm:hidden">
                Account
              </Link>
              <form action="/auth/sign-out" method="post">
                <button className="rounded-md px-3 py-2 text-sm text-blue-100 hover:bg-white/10" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <div className="pb-2">
            <NavLinks items={items} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
