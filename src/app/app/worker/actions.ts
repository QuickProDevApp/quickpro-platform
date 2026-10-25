"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { deleteDocument, uploadDocument } from "@/server/data/documents";
import {
  addAvailability,
  getWorkerProfile,
  removeAvailability,
  saveWorkerProfileAndSelections,
  submitWorkerProfileForReview,
} from "@/server/data/workers";
import { toUserMessage, UserFacingError } from "@/server/errors";
import {
  availabilitySchema,
  documentUploadSchema,
  fieldErrorsOf,
  formObject,
  uuid,
  workerProfileSchema,
  type FormState,
} from "@/lib/schemas";

async function requireWorker() {
  const user = await requireUser();
  const profile = await getWorkerProfile(user.id);
  if (!profile) throw new UserFacingError("Create your worker profile first.");
  return { user, profile };
}

function done(message: string): FormState {
  revalidatePath("/app/worker", "layout");
  return { ok: true, message };
}

export async function updateWorkerProfileAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user } = await requireWorker();
    const parsed = workerProfileSchema.safeParse(formObject(formData, ["hasVehicle", "hasDriversLicense"]));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    const ids = (name: string) => formData.getAll(name).map((v) => uuid.parse(v));
    await saveWorkerProfileAndSelections(user.id, parsed.data, ids("skillId"), ids("areaId"));
    return done("Profile saved.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function addAvailabilityAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user } = await requireWorker();
    const parsed = availabilitySchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await addAvailability(user.id, parsed.data.weekday, parsed.data.startTime, parsed.data.endTime);
    return done("Availability added.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function removeAvailabilityAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user } = await requireWorker();
    await removeAvailability(user.id, uuid.parse(formData.get("id")));
    return done("Availability removed.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function submitWorkerProfileAction(): Promise<FormState> {
  try {
    const { user } = await requireWorker();
    await submitWorkerProfileForReview(user.id);
    return done("Submitted. QuickPro staff will review your profile.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function uploadWorkerDocumentAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user } = await requireWorker();
    const parsed = documentUploadSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, fieldErrors: { file: ["Choose a file to upload."] } };
    }
    await uploadDocument(user.id, { kind: "worker", userId: user.id }, {
      ...parsed.data,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return done("Document uploaded. It will be reviewed by QuickPro staff.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function deleteWorkerDocumentAction(_: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user } = await requireWorker();
    await deleteDocument(user.id, uuid.parse(formData.get("documentId")));
    return done("Document deleted.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
