import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/schemas";
import type { ChecklistItem } from "@/server/data/checklists";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const timeFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

function Box({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
        done ? "border-ok bg-ok text-white" : "border-line-strong bg-surface"
      }`}
    >
      {done ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}

/**
 * A job's checklist. The business builds it and sees who checked each item;
 * the booked crew check items off once they've checked in.
 */
export function JobChecklist({
  items,
  viewer,
  currentUserId,
  canEdit,
  canCheck,
  lockedReason,
  addAction,
  removeAction,
  doneAction,
}: {
  items: ChecklistItem[];
  viewer: "business" | "crew";
  currentUserId: string;
  /** Dispatchers, while the job is open or filled. */
  canEdit: boolean;
  /** Who may tick items now. */
  canCheck: boolean;
  /** Shown when items can't be ticked yet, for example before check-in. */
  lockedReason?: string;
  addAction?: Action;
  removeAction?: Action;
  doneAction: Action;
}) {
  const done = items.filter((i) => i.done_at).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  return (
    <Card>
      <CardHeader
        title="Checklist"
        description={
          viewer === "business"
            ? "What the crew must do on site. Booked workers check items off once they've checked in."
            : "What the business needs done on this shift."
        }
        action={
          items.length ? (
            <span className="tabular text-[13px] font-medium text-ink-soft" data-testid="checklist-progress">
              {done} of {items.length} done
            </span>
          ) : null
        }
      />
      <CardBody className="space-y-4">
        {items.length ? (
          <div
            className="h-1.5 overflow-hidden rounded-full bg-subtle"
            role="progressbar"
            aria-label="Checklist progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div className="h-full rounded-full bg-ok transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
        {lockedReason && items.length && !canCheck ? <p className="text-[13px] text-muted">{lockedReason}</p> : null}
        {items.length ? (
          <ul className="divide-y divide-line rounded-md border border-line">
            {items.map((item) => {
              const isDone = !!item.done_at;
              const who = item.done_by === currentUserId ? "you" : viewer === "business" ? item.done_by_name : null;
              return (
                <li
                  key={item.id}
                  className="flex items-start gap-2 px-3 py-2.5"
                  data-testid="checklist-item"
                  data-done={isDone}
                >
                  <ActionForm action={doneAction} className="min-w-0 flex-1" successMessage={false}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="done" value={isDone ? "false" : "true"} />
                    <div className="flex items-start gap-3">
                      {canCheck ? (
                        <button
                          type="submit"
                          className="-m-2 rounded-md p-2 hover:bg-subtle focus-visible:outline-2 focus-visible:outline-brand"
                          aria-label={isDone ? `Mark not done: ${item.label}` : `Mark done: ${item.label}`}
                        >
                          <Box done={isDone} />
                        </button>
                      ) : (
                        <span className="pt-px">
                          <Box done={isDone} />
                          <span className="sr-only">{isDone ? "Done:" : "Not done:"}</span>
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm leading-5 ${isDone ? "text-muted line-through decoration-line-strong" : "text-ink"}`}
                        >
                          {item.label}
                        </p>
                        {isDone && item.done_at ? (
                          <p className="mt-0.5 text-xs text-muted">
                            {who ? `Done by ${who}` : "Done"} · {timeFormat.format(item.done_at)}
                            {item.done_note ? <span className="text-ink-soft"> · “{item.done_note}”</span> : null}
                          </p>
                        ) : canCheck ? (
                          <details className="group mt-1">
                            <summary className="cursor-pointer text-xs font-medium text-muted hover:text-ink">
                              Done, with a note
                            </summary>
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
                              <Input
                                name="note"
                                maxLength={500}
                                placeholder="For example: two coats, mats replaced"
                                aria-label={`Note for ${item.label}`}
                              />
                              <SubmitButton size="sm" variant="secondary" pendingLabel="Saving…">
                                Mark done
                              </SubmitButton>
                            </div>
                          </details>
                        ) : null}
                      </div>
                    </div>
                  </ActionForm>
                  {canEdit && removeAction ? (
                    <ActionForm action={removeAction} className="shrink-0" successMessage={false}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <button
                        type="submit"
                        className="rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-subtle hover:text-bad"
                        aria-label={`Remove: ${item.label}`}
                      >
                        Remove
                      </button>
                    </ActionForm>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : viewer === "business" ? (
          <EmptyState title="No checklist yet">
            {canEdit
              ? "Add what the crew must do on site, one item at a time."
              : "Dispatchers can add one while the job is open."}
          </EmptyState>
        ) : null}
        {canEdit && addAction ? (
          <ActionForm
            action={addAction}
            resetOnSuccess
            successMessage={false}
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <Field name="label" id="checklist-new" label="Add an item">
                <Input
                  id="checklist-new"
                  name="label"
                  maxLength={200}
                  placeholder="For example: Strip and wax the lobby"
                  required
                />
              </Field>
            </div>
            <SubmitButton variant="secondary" pendingLabel="Adding…">
              Add
            </SubmitButton>
          </ActionForm>
        ) : null}
      </CardBody>
    </Card>
  );
}
