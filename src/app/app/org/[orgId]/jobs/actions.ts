"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDispatcher } from "@/server/actions/guards";
import {
  cancelAssignment,
  cancelJob,
  completeJob,
  createJob,
  declineApplication,
  getJob,
  offerJob,
  updateJob,
} from "@/server/data/jobs";
import { toUserMessage, UserFacingError } from "@/server/errors";
import { fieldErrorsOf, formObject, jobSchema, reasonSchema, uuid, type FormState } from "@/lib/schemas";

/** The job, if it belongs to this organization. */
async function requireOrgJob(orgId: string, jobId: unknown) {
  const { user, org } = await requireDispatcher(orgId);
  const parsed = uuid.safeParse(jobId);
  const job = parsed.success ? await getJob(user.id, parsed.data) : null;
  if (!job || job.organization_id !== org.id) throw new UserFacingError("Job not found.");
  return { user, org, job };
}

function done(orgId: string, message: string): FormState {
  revalidatePath(`/app/org/${orgId}`, "layout");
  return { ok: true, message };
}

const skillIds = (formData: FormData) => formData.getAll("skillId").map((v) => uuid.parse(v));

export async function createJobAction(orgId: string, _: FormState, formData: FormData): Promise<FormState> {
  let jobId: string;
  try {
    const { user, org } = await requireDispatcher(orgId);
    const parsed = jobSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    jobId = await createJob(user.id, org.id, parsed.data, skillIds(formData));
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
  revalidatePath(`/app/org/${orgId}`, "layout");
  redirect(`/app/org/${orgId}/jobs/${jobId}?posted=1`);
}

export async function updateJobAction(orgId: string, jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, job } = await requireOrgJob(orgId, jobId);
    const parsed = jobSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await updateJob(user.id, job.id, parsed.data, skillIds(formData));
    return done(orgId, "Job saved.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function offerJobAction(orgId: string, jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, job } = await requireOrgJob(orgId, jobId);
    await offerJob(user.id, job.id, uuid.parse(formData.get("workerId")));
    return done(orgId, "Offer sent. The worker sees it the next time they open QuickPro.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function declineApplicationAction(orgId: string, jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user } = await requireOrgJob(orgId, jobId);
    await declineApplication(user.id, uuid.parse(formData.get("applicationId")), String(formData.get("note") ?? ""));
    return done(orgId, "Application declined.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function cancelAssignmentAction(orgId: string, jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user } = await requireOrgJob(orgId, jobId);
    const parsed = reasonSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await cancelAssignment(user.id, uuid.parse(formData.get("assignmentId")), parsed.data.reason);
    return done(orgId, "Assignment cancelled. The spot is open again.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function cancelJobAction(orgId: string, jobId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, job } = await requireOrgJob(orgId, jobId);
    const parsed = reasonSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    await cancelJob(user.id, job.id, parsed.data.reason);
    return done(orgId, "Job cancelled. Workers who were offered or booked can see the reason.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}

export async function completeJobAction(orgId: string, jobId: string): Promise<FormState> {
  try {
    const { user, job } = await requireOrgJob(orgId, jobId);
    await completeJob(user.id, job.id);
    return done(orgId, "Job marked complete.");
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
