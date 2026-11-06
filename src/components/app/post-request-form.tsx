import { ActionForm, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import type { FormState } from "@/lib/schemas";

type Option = { id: string; name: string };

/** A numbered section of the form. */
function Step({
  n,
  title,
  description,
  children,
}: {
  n: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-surface ring-1 ring-line" aria-labelledby={`step-${n}`}>
      <div className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
        <span
          aria-hidden
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-white"
        >
          {n}
        </span>
        <div className="min-w-0">
          <h3 id={`step-${n}`} className="text-[16px] font-bold tracking-[-0.01em] text-ink">
            {title}
          </h3>
          {description ? <p className="mt-0.5 text-[13.5px] leading-5 text-muted">{description}</p> : null}
        </div>
      </div>
      <div className="space-y-4 px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

const NEXT_STEPS = [
  { title: "Matched pros see it", body: "Approved contractors who list this service and town are notified." },
  { title: "Quotes come to you", body: "Compare prices, timing and reviews side by side. Ask questions in messages." },
  { title: "Award the work", body: "Accept one quote. Only that contractor sees the site address and contact." },
];

/**
 * The customer's "request service" form. The page passes its server action
 * and the organization's details; the presentation preview (D-047) passes
 * an action that validates the same way and saves nothing.
 */
export function PostRequestForm({
  action,
  categories,
  areas,
  matchingArea,
  today,
  defaults,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  categories: Option[];
  areas: Option[];
  matchingArea: string | undefined;
  today: string;
  defaults: { addressLine1: string; city: string; postalCode: string; contactName: string; contactPhone: string };
}) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        <div className="mb-6">
          <p className="text-[12.5px] font-semibold tracking-[0.06em] text-brand uppercase">New project</p>
          <h2 className="mt-1.5 text-[24px] leading-tight font-bold tracking-[-0.025em] text-ink sm:text-[28px]">
            Request service
          </h2>
          <p className="mt-2 max-w-2xl text-[15px] leading-6 text-ink-soft">
            Approved contractors who list this service and town will see the request and can send you a quote. You can
            also invite contractors from the directory once it&apos;s posted.
          </p>
        </div>
        <ActionForm action={action} className="space-y-6">
          <Step n={1} title="The work" description="What you need done, and where.">
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
          </Step>

          <Step
            n={2}
            title="Timing and budget"
            description="Contractors see these before they quote. A budget is optional."
          >
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
          </Step>

          <Step
            n={3}
            title="Site and contact"
            description="Shared only with the contractor whose quote you accept, and with QuickPro staff."
          >
            <Field name="addressLine1" label="Street address">
              <Input name="addressLine1" defaultValue={defaults.addressLine1} required autoComplete="address-line1" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <Field name="city" label="City or hamlet">
                <Input name="city" defaultValue={defaults.city} required autoComplete="address-level2" />
              </Field>
              <Field name="postalCode" label="ZIP code">
                <Input
                  name="postalCode"
                  defaultValue={defaults.postalCode}
                  required
                  inputMode="numeric"
                  autoComplete="postal-code"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name="contactName" label="Contact name">
                <Input name="contactName" defaultValue={defaults.contactName} required />
              </Field>
              <Field name="contactPhone" label="Contact phone">
                <Input name="contactPhone" type="tel" defaultValue={defaults.contactPhone} required autoComplete="tel" />
              </Field>
            </div>
            <Field
              name="accessNotes"
              label="Access notes"
              hint="Optional: parking, entrance, hours the building is open."
            >
              <Textarea name="accessNotes" maxLength={1000} rows={2} />
            </Field>
          </Step>

          <div className="flex flex-col-reverse items-stretch gap-3 rounded-2xl bg-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-[13.5px] leading-5 text-muted">Posting is free. You choose who to hire, if anyone.</p>
            <SubmitButton pendingLabel="Posting…">Post request</SubmitButton>
          </div>
        </ActionForm>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-2xl bg-charcoal p-5 text-white sm:p-6">
          <p className="text-[15px] font-bold">What happens next</p>
          <ol className="mt-4 space-y-4">
            {NEXT_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-bold text-[#f6884a]">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[14px] font-semibold">{s.title}</p>
                  <p className="mt-0.5 text-[13px] leading-5 text-white/70">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
