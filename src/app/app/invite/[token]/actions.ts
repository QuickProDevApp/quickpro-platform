"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { acceptInvitation } from "@/server/data/team";
import { toUserMessage } from "@/server/errors";
import type { FormState } from "@/lib/schemas";

const TOKEN = /^[0-9a-f]{64}$/;

export async function acceptInvitationAction(token: string): Promise<FormState> {
  const user = await requireUser();
  if (!TOKEN.test(token)) return { ok: false, message: "This invitation link is not valid." };
  let orgId: string;
  try {
    orgId = await acceptInvitation(user.id, token);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath("/app", "layout");
  redirect(`/app/org/${orgId}`);
}
