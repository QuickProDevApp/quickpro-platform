"use server";

// Support requests: the person who asked and QuickPro staff. The database
// decides who may do what; these re-check the user, validate input and map
// errors.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/server/auth/session";
import { openSupportTicket, postSupportMessage, resolveMySupportTicket, updateSupportTicket } from "@/server/data/support";
import { toUserMessage, UserFacingError } from "@/server/errors";
import {
  fieldErrorsOf,
  formObject,
  supportMessageSchema,
  supportTicketSchema,
  supportUpdateSchema,
  uuid,
  type FormState,
} from "@/lib/schemas";

function ticketId(id: unknown): string {
  if (!uuid.safeParse(id).success) throw new UserFacingError("Support request not found.");
  return id as string;
}

function refresh(): void {
  revalidatePath("/app", "layout");
}

export async function openSupportTicketAction(_: FormState, formData: FormData): Promise<FormState> {
  let id: string;
  try {
    const user = await requireUser();
    const parsed = supportTicketSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    id = await openSupportTicket(user.id, { ...parsed.data, organizationId: parsed.data.organizationId || null });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  refresh();
  redirect(`/app/support/${id}?sent=1`);
}

/** The person replies; a reply to a resolved request reopens it. */
export async function replyToSupportTicketAction(id: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const parsed = supportMessageSchema.safeParse({ ...formObject(formData), internal: false });
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await postSupportMessage(user.id, ticketId(id), parsed.data.body, false);
    refresh();
    return { ok: true, message: "Sent to QuickPro support." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function resolveMySupportTicketAction(id: string): Promise<FormState> {
  try {
    const user = await requireUser();
    await resolveMySupportTicket(user.id, ticketId(id));
    refresh();
    return { ok: true, message: "Marked resolved." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

/** Staff reply, or add an internal note. */
export async function staffSupportMessageAction(id: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const parsed = supportMessageSchema.safeParse(formObject(formData, ["internal"]));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await postSupportMessage(admin.id, ticketId(id), parsed.data.body, parsed.data.internal);
    refresh();
    return { ok: true, message: parsed.data.internal ? "Internal note added." : "Reply sent." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function updateSupportTicketAction(id: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const admin = await requireAdmin();
    const parsed = supportUpdateSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await updateSupportTicket(admin.id, ticketId(id), { ...parsed.data, assignedTo: parsed.data.assignedTo || null });
    refresh();
    return { ok: true, message: "Saved." };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
