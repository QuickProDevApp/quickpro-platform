"use server";

import { revalidatePath } from "next/cache";
import { requireOrgManager } from "@/server/actions/guards";
import { deleteDocument, uploadDocument } from "@/server/data/documents";
import {
  setContractorCapabilities,
  submitOrganizationForReview,
  updateOrganizationProfile,
} from "@/server/data/organizations";
import { toUserMessage, UserFacingError } from "@/server/errors";
import {
  documentUploadSchema,
  fieldErrorsOf,
  formObject,
  organizationProfileSchema,
  uuid,
  type FormState,
} from "@/lib/schemas";

function done(orgId: string, message: string): FormState {
  revalidatePath(`/app/org/${orgId}`, "layout");
  return { ok: true, message };
}

export async function updateOrganizationProfileAction(orgId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, org } = await requireOrgManager(orgId);
    const parsed = organizationProfileSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await updateOrganizationProfile(user.id, org.id, parsed.data);
    return done(org.id, "Business profile saved.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function saveCapabilitiesAction(orgId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, org } = await requireOrgManager(orgId);
    if (org.kind !== "contractor") throw new UserFacingError("Only contractor businesses list services.");
    const ids = (name: string) => formData.getAll(name).map((v) => uuid.parse(v));
    await setContractorCapabilities(user.id, org.id, { categoryIds: ids("categoryId"), areaIds: ids("areaId") });
    return done(org.id, "Services and areas saved.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function submitOrganizationAction(orgId: string): Promise<FormState> {
  try {
    const { user, org } = await requireOrgManager(orgId);
    await submitOrganizationForReview(user.id, org.id);
    return done(org.id, "Submitted. QuickPro staff will review your registration.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function uploadOrganizationDocumentAction(orgId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, org } = await requireOrgManager(orgId);
    const parsed = documentUploadSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, fieldErrors: { file: ["Choose a file to upload."] } };
    }
    await uploadDocument(user.id, { kind: "org", orgId: org.id }, {
      ...parsed.data,
      fileName: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return done(org.id, "Document uploaded. It will be reviewed by QuickPro staff.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function deleteOrganizationDocumentAction(orgId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, org } = await requireOrgManager(orgId);
    await deleteDocument(user.id, uuid.parse(formData.get("documentId")));
    return done(org.id, "Document deleted.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
