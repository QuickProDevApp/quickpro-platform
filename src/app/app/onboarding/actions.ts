"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { createOrganization } from "@/server/data/organizations";
import { createWorkerProfile } from "@/server/data/workers";
import { toUserMessage } from "@/server/errors";
import { createOrganizationSchema, fieldErrorsOf, formObject, type FormState } from "@/lib/schemas";

export async function createOrganizationAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = createOrganizationSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };

  let orgId: string;
  try {
    orgId = await createOrganization(user.id, parsed.data.kind, parsed.data.name, parsed.data.marketId);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  redirect(`/app/org/${orgId}/profile`);
}

export async function createWorkerProfileAction(): Promise<FormState> {
  const user = await requireUser();
  try {
    await createWorkerProfile(user.id);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  redirect("/app/worker/profile");
}
