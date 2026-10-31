import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/server/auth/session";
import { listNotifications } from "@/server/data/notifications";
import { markAllReadAction } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

const timeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await listNotifications(user.id);
  const unread = notifications.filter((n) => !n.read_at).length;
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates on your jobs, applications, team and reviews. QuickPro shows these here only; it doesn't email or text them yet."
        actions={
          unread > 0 ? (
            <ActionForm action={markAllReadAction} successMessage={false}>
              <SubmitButton variant="secondary" pendingLabel="Marking…">Mark all read</SubmitButton>
            </ActionForm>
          ) : null
        }
      />
      <Card>
        {notifications.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nothing yet">You&apos;ll see applications, offers, messages and review decisions here.</EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {notifications.map((n) => (
              <li key={n.id} data-testid="notification">
                <Link
                  href={`/app/notifications/open/${n.id}`}
                  prefetch={false}
                  className={`flex gap-3 px-5 py-4 hover:bg-canvas ${n.read_at ? "" : "bg-brand-soft/40"}`}
                >
                  <span
                    aria-hidden
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-brand"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">
                      {n.read_at ? null : <span className="sr-only">Unread: </span>}
                      {n.title}
                    </span>
                    {n.body ? <span className="mt-0.5 block text-sm text-muted line-clamp-2">{n.body}</span> : null}
                    <span className="mt-1 block text-xs text-muted">{timeFormat.format(n.created_at)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
