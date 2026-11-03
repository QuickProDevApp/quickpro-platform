"use server";

// Job checklists (D-034). The database decides who may change what (business
// dispatchers, and booked crew once checked in); these re-check the user,
// validate input and map errors.

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { addJobChecklistItem, removeJobChecklistItem, setJobChecklistItemDone } from "@/server/data/checklists";
import { toUserMessage, UserFacingError } from "@/server/errors";
import {
  checklistDoneSchema,
  checklistItemSchema,
  fieldErrorsOf,
  formObject,
  uuid,
  type FormState,
} from "@/lib/schemas";

function jobIdOf(id: unknown): string {
  if (!uuid.safeParse(id).success) throw new UserFacingError("Job not found.");
  return id as string;
}

function refresh() {
  revalidatePath("/app", "layout");
}

export async function addChecklistItemAction(jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const parsed = checklistItemSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await addJobChecklistItem(user.id, jobIdOf(jobId), parsed.data.label);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  refresh();
  return { ok: true, message: "Added to the checklist." };
}

export async function removeChecklistItemAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const itemId = uuid.safeParse(formData.get("itemId"));
    if (!itemId.success) throw new UserFacingError("Checklist item not found.");
    await removeJobChecklistItem(user.id, itemId.data);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  refresh();
  return { ok: true };
}

export async function setChecklistItemDoneAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const parsed = checklistDoneSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error), message: "Check the note." };
    await setJobChecklistItemDone(user.id, parsed.data.itemId, parsed.data.done, parsed.data.note);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  refresh();
  return { ok: true };
}
