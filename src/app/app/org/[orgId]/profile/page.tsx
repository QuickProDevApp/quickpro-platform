import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Field, FormMessage, Input, SubmitButton, Textarea } from "@/components/ui/form";
import { requireMembership } from "@/server/actions/guards";
import { canManage } from "@/server/data/organizations";
import { updateOrganizationProfileAction } from "../actions";

export const metadata: Metadata = { title: "Business profile" };

export default async function OrganizationProfilePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { org } = await requireMembership(orgId);
  const editable = canManage(org.my_role);
  // Mirrors app.guard_reviewed_org_identity: names are frozen while staff review
  // them or while suspended. Changing them once approved sends the
  // organization back to review.
  const identityLocked = org.status === "pending_review" || org.status === "suspended";
  const identityHint =
    org.status === "pending_review"
      ? "Locked while QuickPro staff review your registration."
      : org.status === "suspended"
        ? "Locked while your organization is suspended. Contact QuickPro staff to change it."
        : org.status === "approved"
          ? "Changing this sends your registration back to QuickPro staff for review."
          : undefined;
  const isContractor = org.kind === "contractor";

  return (
    <Card className="max-w-3xl">
      <CardHeader
        title={isContractor ? "Business profile" : "Organization profile"}
        description="QuickPro staff use these details to review your registration."
      />
      <CardBody>
        {!editable ? (
          <div className="mb-4">
            <FormMessage tone="info">Only owners and admins of this organization can edit its profile.</FormMessage>
          </div>
        ) : null}
        <ActionForm action={updateOrganizationProfileAction.bind(null, org.id)}>
          <fieldset disabled={!editable} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                name="name"
                label={isContractor ? "Business name (as customers know you)" : "Organization name"}
                hint={identityHint}
              >
                {identityLocked ? (
                  <>
                    <Input name="name-display" value={org.name} disabled readOnly />
                    <input type="hidden" name="name" value={org.name} />
                  </>
                ) : (
                  <Input name="name" defaultValue={org.name} required />
                )}
              </Field>
              <Field
                name="legalName"
                label="Legal name"
                hint={identityHint ?? (isContractor ? "As it appears on your insurance certificate." : undefined)}
              >
                {identityLocked ? (
                  <>
                    <Input name="legalName-display" value={org.legal_name ?? ""} disabled readOnly />
                    <input type="hidden" name="legalName" value={org.legal_name ?? ""} />
                  </>
                ) : (
                  <Input name="legalName" defaultValue={org.legal_name ?? ""} />
                )}
              </Field>
              <Field name="phone" label="Business phone">
                <Input name="phone" type="tel" defaultValue={org.phone ?? ""} autoComplete="tel" />
              </Field>
              <Field name="email" label="Business email">
                <Input name="email" type="email" defaultValue={org.email ?? ""} autoComplete="email" />
              </Field>
              <Field name="website" label="Website">
                <Input name="website" defaultValue={org.website ?? ""} placeholder="example.com" />
              </Field>
              {isContractor ? (
                <>
                  <Field name="yearsInBusiness" label="Years in business">
                    <Input name="yearsInBusiness" inputMode="numeric" defaultValue={org.years_in_business ?? ""} />
                  </Field>
                  <Field name="crewSize" label="Current crew size" hint="People you can staff today, including you.">
                    <Input name="crewSize" inputMode="numeric" defaultValue={org.crew_size ?? ""} />
                  </Field>
                </>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
              <Field name="addressLine1" label={isContractor ? "Business address" : "Primary property or office address"}>
                <Input name="addressLine1" defaultValue={org.address_line1 ?? ""} autoComplete="address-line1" />
              </Field>
              <Field name="city" label="City or hamlet">
                <Input name="city" defaultValue={org.city ?? ""} autoComplete="address-level2" />
              </Field>
              <Field name="postalCode" label="ZIP">
                <Input name="postalCode" inputMode="numeric" defaultValue={org.postal_code ?? ""} autoComplete="postal-code" />
              </Field>
            </div>
            <Field
              name="description"
              label={isContractor ? "About your business" : "About your properties"}
              hint={isContractor ? "The kinds of commercial work you do and the clients you serve." : "Property types, sizes and the services you typically need."}
            >
              <Textarea name="description" defaultValue={org.description} maxLength={2000} />
            </Field>
            {editable ? <SubmitButton>Save profile</SubmitButton> : null}
          </fieldset>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
