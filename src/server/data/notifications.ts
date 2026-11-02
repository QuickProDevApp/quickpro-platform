import "server-only";
import { withUser } from "@/server/db/client";

export type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link_path: string | null;
  created_at: Date;
  read_at: Date | null;
};

export function listNotifications(userId: string, limit = 50) {
  return withUser(userId, (tx) => tx<Notification[]>`
    select id, kind, title, body, link_path, created_at, read_at
    from public.notifications
    where user_id = ${userId}
    order by created_at desc, id
    limit ${limit}
  `);
}

export async function unreadNotificationCount(userId: string) {
  const [row] = await withUser(userId, (tx) => tx<{ n: number }[]>`
    select count(*)::int as n from public.notifications where user_id = ${userId} and read_at is null
  `);
  return row.n;
}

/** Marks one notification read and returns where it points, if it is the user's. */
export async function openNotification(userId: string, id: string) {
  return withUser(userId, async (tx) => {
    const [row] = await tx<{ link_path: string | null }[]>`select link_path from public.notifications where id = ${id}`;
    if (!row) return null;
    await tx`select public.mark_notifications_read(${[id]}::uuid[])`;
    return row;
  });
}

export async function markAllNotificationsRead(userId: string) {
  await withUser(userId, (tx) => tx`select public.mark_notifications_read(null)`);
}
