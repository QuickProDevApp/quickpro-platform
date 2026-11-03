"use server";

// Timesheets (D-038). The database decides who may approve or question
// hours; these re-check the user, validate input and map errors.

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { approveTimesheet, queryTimesheet } from "@/server/data/timesheets";
import { toUserMessage } from "@/server/errors";
import {
  approveTimesheetSchema,
  fieldErrorsOf,
  formObject,
  queryTimesheetSchema,
  type FormState,
} from "@/lib/schemas";

export async function approveTimesheetAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const parsed = approveTimesheetSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await approveTimesheet(user.id, parsed.data);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: "Hours approved." };
}

export async function queryTimesheetAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const parsed = queryTimesheetSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await queryTimesheet(user.id, parsed.data.assignmentId, parsed.data.note);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: "Sent to the business. They'll look at the hours again." };
}
