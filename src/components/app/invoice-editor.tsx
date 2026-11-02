"use client";

import { useState } from "react";
import { ActionForm, Field, Input, SubmitButton, Textarea } from "@/components/ui/form";
import type { FormState } from "@/lib/schemas";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Row = { key: number; description: string; quantity: string; unit: string };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function cents(value: string): number | null {
  const n = Number(value.replace(/[$,\s]/g, ""));
  return value.trim() === "" || !Number.isFinite(n) || n < 0 ? null : Math.round(n * 100);
}

/**
 * Editing a draft invoice: line items with live totals, due date, sales tax,
 * notes and payment instructions. The totals here are a preview; the
 * database works out the real ones when the draft is saved.
 */
export function InvoiceEditor({
  action,
  initial,
}: {
  action: Action;
  initial: {
    dueDate: string;
    taxRate: string;
    notes: string;
    paymentInstructions: string;
    lines: { description: string; quantity: number; unit_cents: number }[];
  };
}) {
  const [rows, setRows] = useState<Row[]>(() => {
    const start = initial.lines.map((l, i) => ({
      key: i,
      description: l.description,
      quantity: String(l.quantity),
      unit: (l.unit_cents / 100).toFixed(2),
    }));
    return start.length ? start : [{ key: 0, description: "", quantity: "1", unit: "" }];
  });
  const [taxRate, setTaxRate] = useState(initial.taxRate);
  const [nextKey, setNextKey] = useState(rows.length);

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const amounts = rows.map((r) => {
    const q = Number(r.quantity);
    const u = cents(r.unit);
    return Number.isFinite(q) && q > 0 && u !== null ? Math.round(q * u) : null;
  });
  const subtotal = amounts.reduce<number>((sum, a) => sum + (a ?? 0), 0);
  const rate = Number(taxRate || 0);
  const tax = Number.isFinite(rate) && rate >= 0 ? Math.round((subtotal * Math.round(rate * 1000)) / 100000) : 0;

  return (
    <ActionForm action={action} className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="mb-1 text-[13px] font-medium text-ink">Line items</legend>
        <div className="hidden grid-cols-[1fr_5.5rem_8rem_7rem_2rem] gap-2 text-xs font-medium tracking-wide text-faint uppercase sm:grid">
          <span>Description</span>
          <span>Qty</span>
          <span>Unit price</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        <ol className="space-y-3 sm:space-y-2">
          {rows.map((r, i) => (
            <li
              key={r.key}
              className="grid grid-cols-[1fr_1fr] gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_5.5rem_8rem_7rem_2rem] sm:items-center sm:border-0 sm:p-0"
              data-testid="invoice-line"
            >
              <div className="col-span-2 sm:col-span-1">
                <span className="mb-1 block text-xs text-muted sm:hidden" aria-hidden>
                  Description
                </span>
                <Input
                  name="lineDescription"
                  aria-label={`Line ${i + 1} description`}
                  value={r.description}
                  maxLength={500}
                  onChange={(e) => update(r.key, { description: e.target.value })}
                />
              </div>
              <div>
                <span className="mb-1 block text-xs text-muted sm:hidden" aria-hidden>
                  Qty
                </span>
                <Input
                  name="lineQuantity"
                  aria-label={`Line ${i + 1} quantity`}
                  inputMode="decimal"
                  value={r.quantity}
                  onChange={(e) => update(r.key, { quantity: e.target.value })}
                />
              </div>
              <div>
                <span className="mb-1 block text-xs text-muted sm:hidden" aria-hidden>
                  Unit price ($)
                </span>
                <Input
                  name="lineUnit"
                  aria-label={`Line ${i + 1} unit price in dollars`}
                  inputMode="decimal"
                  value={r.unit}
                  onChange={(e) => update(r.key, { unit: e.target.value })}
                />
              </div>
              <p className="tabular self-center text-sm text-ink-soft sm:text-right">
                <span className="text-xs text-muted sm:hidden">Amount </span>
                {amounts[i] === null ? "—" : money.format(amounts[i]! / 100)}
              </p>
              <div className="flex justify-end">
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-bad"
                    aria-label={`Remove line ${i + 1}`}
                  >
                    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
                      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        {rows.length < 50 ? (
          <button
            type="button"
            onClick={() => {
              setRows((rs) => [...rs, { key: nextKey, description: "", quantity: "1", unit: "" }]);
              setNextKey((k) => k + 1);
            }}
            className="text-sm font-medium text-brand hover:underline"
          >
            + Add a line
          </button>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="dueDate" label="Due date">
          <Input id="dueDate" name="dueDate" type="date" defaultValue={initial.dueDate} required />
        </Field>
        <Field
          name="taxRate"
          label="Sales tax rate (%)"
          hint="Leave blank if the work isn't taxable. You decide what's taxable; QuickPro doesn't calculate tax rules."
        >
          <Input id="taxRate" name="taxRate" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
        </Field>
      </div>

      <dl className="tabular ml-auto max-w-xs space-y-1 text-sm" aria-label="Totals preview">
        <div className="flex justify-between gap-6">
          <dt className="text-muted">Subtotal</dt>
          <dd>{money.format(subtotal / 100)}</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="text-muted">Sales tax</dt>
          <dd>{money.format(tax / 100)}</dd>
        </div>
        <div className="flex justify-between gap-6 border-t border-line pt-1 font-semibold text-ink">
          <dt>Total</dt>
          <dd data-testid="invoice-total-preview">{money.format((subtotal + tax) / 100)}</dd>
        </div>
      </dl>

      <Field name="paymentInstructions" label="How to pay you" hint="Shown on the invoice. For example: who checks are payable to, or to ask for bank details.">
        <Textarea id="paymentInstructions" name="paymentInstructions" rows={2} maxLength={1000} defaultValue={initial.paymentInstructions} />
      </Field>
      <Field name="notes" label="Notes" hint="Optional. Shown on the invoice.">
        <Textarea id="notes" name="notes" rows={2} maxLength={2000} defaultValue={initial.notes} />
      </Field>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <SubmitButton name="intent" value="issue" pendingLabel="Issuing…">
          Issue invoice
        </SubmitButton>
        <SubmitButton name="intent" value="save" variant="secondary" pendingLabel="Saving…">
          Save draft
        </SubmitButton>
      </div>
      <p className="text-[13px] text-muted">
        Issuing numbers the invoice and sends it to the business in QuickPro. It can&apos;t be edited after that, only voided.
      </p>
    </ActionForm>
  );
}
