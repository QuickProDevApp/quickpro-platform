import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Checkbox, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { formatCents } from "@/lib/labels";
import type { FormState } from "@/lib/schemas";
import type { EngagementType, Job, JobSite } from "@/server/data/jobs";
import type { ServiceArea, ServiceCategory, Skill } from "@/server/data/reference";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/** Post or edit a job. Times are entered in the market's local time (New York). */
export function JobForm({
  action,
  job,
  site,
  categories,
  areas,
  skills,
  engagementTypes,
  minPayCents,
  submitLabel,
  booked = false,
  prefill,
  intro,
}: {
  action: Action;
  job?: Job;
  site?: JobSite | null;
  /** Starting values for a new job, e.g. from the project it is scheduled for. */
  prefill?: Partial<Pick<Job, "title" | "description" | "category_id" | "service_area_id" | "local_date">>;
  /** Shown above the form. */
  intro?: React.ReactNode;
  categories: ServiceCategory[];
  areas: ServiceArea[];
  skills: (Skill & { category_name: string | null })[];
  engagementTypes: EngagementType[];
  minPayCents: number | null;
  submitLabel: string;
  /** Someone has been offered or accepted: time, town, engagement and pay cuts are locked. */
  booked?: boolean;
}) {
  const lockNote = booked ? "Locked while workers are offered or booked. Cancel their assignments to change it." : undefined;
  return (
    <ActionForm action={action} className="space-y-6">
      {intro}
      <Card>
        <CardHeader title="The work" />
        <CardBody className="space-y-4">
          <Field name="title" label="Job title" hint="For example: Overnight floor strip and wax">
            <Input name="title" defaultValue={job?.title ?? prefill?.title} required maxLength={120} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="categoryId" label="Category">
              <Select name="categoryId" defaultValue={job?.category_id ?? prefill?.category_id ?? categories[0]?.id}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field name="serviceAreaId" label="Town" hint={lockNote}>
              <Select name="serviceAreaId" defaultValue={job?.service_area_id ?? prefill?.service_area_id} disabled={booked}>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              {booked ? <input type="hidden" name="serviceAreaId" value={job?.service_area_id} /> : null}
            </Field>
          </div>
          <Field name="description" label="What workers will do" hint="Tasks, equipment provided, dress code, anything they should bring.">
            <Textarea name="description" defaultValue={job?.description ?? prefill?.description} maxLength={4000} />
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">Skills you are looking for</legend>
            <p className="mb-2 text-xs text-muted">Workers without them can still apply; you will see how each applicant matches.</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {skills.map((s) => (
                <Checkbox key={s.id} name="skillId" value={s.id} defaultChecked={job?.skill_ids.includes(s.id)} label={s.name} />
              ))}
            </div>
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="When, how many, and pay" description="Times are Eastern (New York). An end time before the start time means the shift runs past midnight." />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="date" label="Date" hint={lockNote}>
              <Input type="date" name="date" defaultValue={job?.local_date ?? prefill?.local_date} readOnly={booked} required />
            </Field>
            <Field name="startTime" label="Start time">
              <Input type="time" name="startTime" defaultValue={job?.local_start ?? "08:00"} readOnly={booked} required />
            </Field>
            <Field name="endTime" label="End time">
              <Input type="time" name="endTime" defaultValue={job?.local_end ?? "16:00"} readOnly={booked} required />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="headcount" label="People needed">
              <Input type="number" name="headcount" min={1} max={50} defaultValue={job?.headcount ?? 1} required />
            </Field>
            <Field
              name="payRate"
              label="Hourly pay (USD)"
              hint={
                booked
                  ? "You can raise the pay while workers are booked, not lower it."
                  : minPayCents
                    ? `At least ${formatCents(minPayCents)} an hour in this market.`
                    : undefined
              }
            >
              <Input
                name="payRate"
                inputMode="decimal"
                defaultValue={job ? (job.pay_rate_cents / 100).toFixed(2) : undefined}
                placeholder="24.00"
                required
              />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-ink">How you engage the workers</legend>
            <p className="mb-2 text-xs text-muted">
              Workers see this before they apply. Your business is responsible for engaging them on this basis, including
              payroll, taxes and employment eligibility where they apply. QuickPro is not the employer.
            </p>
            <div className="space-y-2">
              {engagementTypes.map((e, i) => (
                <label
                  key={e.id}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 text-sm hover:bg-canvas has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
                >
                  <input
                    type="radio"
                    name="engagementTypeId"
                    value={e.id}
                    defaultChecked={job ? job.engagement_type_id === e.id : i === 0}
                    disabled={booked && job?.engagement_type_id !== e.id}
                    className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]"
                  />
                  <span>
                    <span className="block font-medium text-ink">{e.name}</span>
                    <span className="block text-xs text-muted">{e.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="On site" description="Only shared with workers who accept the job, and with QuickPro staff." />
        <CardBody className="space-y-4">
          <Field name="addressLine1" label="Street address">
            <Input name="addressLine1" defaultValue={site?.address_line1} autoComplete="street-address" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="city" label="City or hamlet">
              <Input name="city" defaultValue={site?.city} required />
            </Field>
            <Field name="postalCode" label="ZIP code">
              <Input name="postalCode" defaultValue={site?.postal_code} inputMode="numeric" required />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="contactName" label="Ask for">
              <Input name="contactName" defaultValue={site?.contact_name} required />
            </Field>
            <Field name="contactPhone" label="On-site phone">
              <Input name="contactPhone" type="tel" defaultValue={site?.contact_phone} required />
            </Field>
          </div>
          <Field name="siteNotes" label="Arrival notes" hint="Parking, entrance, check-in procedure.">
            <Textarea name="siteNotes" defaultValue={site?.site_notes} rows={3} maxLength={1000} />
          </Field>
        </CardBody>
      </Card>

      <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
