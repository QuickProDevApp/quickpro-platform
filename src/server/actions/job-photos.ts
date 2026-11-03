"use server";

// Job photos (D-035). The database decides who may add or remove photos;
// these re-check the user, validate input and map errors.

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { hideJobPhoto, uploadJobPhoto } from "@/server/data/job-photos";
import { toUserMessage, UserFacingError } from "@/server/errors";
import { MAX_DOCUMENT_BYTES } from "@/server/files/validate";
import { fieldErrorsOf, formObject, jobPhotoSchema, uuid, type FormState } from "@/lib/schemas";

export async function uploadJobPhotoAction(jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    if (!uuid.safeParse(jobId).success) throw new UserFacingError("Job not found.");
    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) return { ok: false, fieldErrors: { photo: ["Choose a photo."] } };
    if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, fieldErrors: { photo: ["Photos can be at most 10 MB."] } };
    const parsed = jobPhotoSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await uploadJobPhoto(user.id, {
      jobId,
      checklistItemId: parsed.data.checklistItemId,
      caption: parsed.data.caption,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath("/app", "layout");
  return { ok: true, message: "Photo added." };
}

export async function hideJobPhotoAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    const photoId = uuid.safeParse(formData.get("photoId"));
    if (!photoId.success) throw new UserFacingError("Photo not found.");
    await hideJobPhoto(user.id, photoId.data);
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath("/app", "layout");
  return { ok: true };
}
