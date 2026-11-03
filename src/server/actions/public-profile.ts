"use server";

import { revalidatePath } from "next/cache";
import { requireOrgManager } from "@/server/actions/guards";
import { getPublicProfileSettings, setPublicProfile } from "@/server/data/public-profiles";
import { toUserMessage, UserFacingError } from "@/server/errors";
import { fieldErrorsOf, formObject, publicProfileSchema, type FormState } from "@/lib/schemas";

/** Publish, unpublish, or change the address of a contractor's public profile. */
export async function savePublicProfileAction(orgId: string, _: FormState, formData: FormData): Promise<FormState> {
  try {
    const { user, org } = await requireOrgManager(orgId);
    if (org.kind !== "contractor") throw new UserFacingError("Public profiles are for contractor businesses.");
    const parsed = publicProfileSchema.safeParse(formObject(formData));
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
    const current = await getPublicProfileSettings(user.id, org.id);
    const publish = parsed.data.intent === "publish" || (parsed.data.intent === "save" && !!current?.is_published);
    const slug = await setPublicProfile(user.id, org.id, publish, parsed.data.slug);
    if (current?.slug && current.slug !== slug) revalidatePath(`/contractors/${current.slug}`);
    revalidatePath(`/contractors/${slug}`);
    revalidatePath("/contractors");
    revalidatePath(`/app/org/${org.id}/profile`);
    return {
      ok: true,
      message:
        parsed.data.intent === "publish"
          ? "Published. Anyone can now see your profile."
          : parsed.data.intent === "unpublish"
            ? "Unpublished. Your profile is no longer public."
            : "Page address saved.",
    };
  } catch (error) {
    return { ok: false, message: toUserMessage(error) };
  }
}
