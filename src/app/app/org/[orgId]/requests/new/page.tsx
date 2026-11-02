import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Field, FormMessage, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { requireMembership } from "@/server/actions/guards";
import { canDispatch } from "@/server/data/organizations";
import { listCategories, listServiceAreas } from "@/server/data/reference";
import { createRequestAction } from "../actions";

export const metadata: Metadata = { title: "Request service" };

export default async function NewRequestPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (org.kind !== "customer" || !canDispatch(org.my_role)) notFound();
  if (org.status !== "approved") {
    return <FormMessage tone="info">You can request service once QuickPro staff approve your organization.</FormMessage>;
  }
  const [categories, areas] = await Promise.all([listCategories(user.id), listServiceAreas(user.id, org.market_id)]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const matchingArea = areas.find((a) => a.name === org.city)?.id;

  return (
    <div className="max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-ink">Request service</h2>
      <p className="mb-5 text-sm text-muted">
        Approved contractors who list this service and town will see the request and can send you a quote. You can also
        invite contractors from the directory once it&apos;s posted.
      </p>
      <ActionForm action={createRequestAction.bind(null, org.id)} className="space-y-6">
        <Card>
          <CardHeader title="The work" />
          <CardBody className="space-y-4">
            <Field name="title" label="Title" hint="For example: Nightly cleaning for a 3-floor office">
              <Input name="title" required maxLength={120} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="categoryId" label="Service">
                <Select name="categoryId" defaultValue={categories[0]?.id}>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field name="serviceAreaId" label="Town">
                <Select name="serviceAreaId" defaultValue={matchingArea}>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field
              name="description"
              label="Scope"
              hint="What needs doing, how big the space is, how often, and anything contractors should price in."
            >
              <Textarea name="description" required minLength={10} maxLength={4000} rows={5} />
            </Field>
            <Field
              name="requirements"
              label="Requirements"
              hint="Optional: certifications, insurance limits, background or badge checks, equipment, working hours."
            >
              <Textarea name="requirements" maxLength={2000} rows={3} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Timing and budget" description="Contractors see these before they quote. A budget is optional." />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="preferredStart" label="Preferred start">
                <Input type="date" name="preferredStart" min={today} required />
              </Field>
              <Field name="preferredEnd" label="Finish by" hint="Optional">
                <Input type="date" name="preferredEnd" min={today} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="budgetMin" label="Budget from (USD)" hint="Optional">
                <Input name="budgetMin" inputMode="decimal" placeholder="2,000" />
              </Field>
              <Field name="budgetMax" label="Budget up to (USD)" hint="Optional">
                <Input name="budgetMax" inputMode="decimal" placeholder="4,000" />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Site and contact"
            description="Shared only with the contractor whose quote you accept, and with QuickPro staff."
          />
          <CardBody className="space-y-4">
            <Field name="addressLine1" label="Street address">
              <Input name="addressLine1" defaultValue={org.address_line1 ?? ""} required autoComplete="address-line1" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <Field name="city" label="City or hamlet">
                <Input name="city" defaultValue={org.city ?? ""} required autoComplete="address-level2" />
              </Field>
              <Field name="postalCode" label="ZIP code">
                <Input name="postalCode" defaultValue={org.postal_code ?? ""} required inputMode="numeric" autoComplete="postal-code" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="contactName" label="Contact name">
                <Input name="contactName" defaultValue={user.fullName ?? ""} required />
              </Field>
              <Field name="contactPhone" label="Contact phone">
                <Input name="contactPhone" type="tel" defaultValue={org.phone ?? ""} required autoComplete="tel" />
              </Field>
            </div>
            <Field name="accessNotes" label="Access notes" hint="Optional: parking, entrance, hours the building is open.">
              <Textarea name="accessNotes" maxLength={1000} rows={2} />
            </Field>
          </CardBody>
        </Card>

        <div className="flex justify-end">
          <SubmitButton pendingLabel="Posting…">Post request</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
