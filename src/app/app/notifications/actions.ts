"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { markAllNotificationsRead } from "@/server/data/notifications";
import { toUserMessage } from "@/server/errors";
import type { FormState } from "@/lib/schemas";

export async function markAllReadAction(): Promise<FormState> {
  const user = await requireUser();
  try {
    await markAllNotificationsRead(user.id);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: "All caught up." };
}
