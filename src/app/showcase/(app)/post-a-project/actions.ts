"use server";

import { fieldErrorsOf, formObject, serviceRequestSchema, type FormState } from "@/lib/schemas";
import { showcaseMode } from "@/server/env";

/**
 * The preview's "Post request": the same validation as the app, then
 * nothing is saved (D-047).
 */
export async function previewPostAction(_: FormState, formData: FormData): Promise<FormState> {
  if (!showcaseMode()) return { ok: false, message: "Not available." };
  const parsed = serviceRequestSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  return {
    ok: true,
    message:
      "Looks good. This is a preview, so nothing was saved. In QuickPro, matched contractors are notified now and their quotes arrive on your Requests page.",
  };
}
