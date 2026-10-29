"use client";

import {
  createContext,
  startTransition,
  use,
  useActionState,
  useEffect,
  useRef,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import type { FieldErrors, FormState } from "@/lib/schemas";
import { Button } from "./button";

const ErrorsContext = createContext<FieldErrors | undefined>(undefined);
const PendingContext = createContext(false);

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * A form bound to a server action with useActionState. Shows the action's
 * message and makes field errors available to <Field>.
 *
 * Submits from onSubmit rather than the action prop so React does not reset
 * the fields after a failed validation.
 */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
  resetOnSuccess = false,
  successMessage = true,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  successMessage?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(formData));
  }

  return (
    <form ref={ref} onSubmit={onSubmit} className={className} noValidate>
      <PendingContext value={pending}>
        <ErrorsContext value={state.fieldErrors}>
          {state.message && (!state.ok || successMessage) ? (
            <FormMessage tone={state.ok ? "ok" : "bad"}>{state.message}</FormMessage>
          ) : null}
          {children}
        </ErrorsContext>
      </PendingContext>
    </form>
  );
}

export function FormMessage({ tone, children }: { tone: "ok" | "bad" | "info"; children: ReactNode }) {
  const styles = {
    ok: "border-ok/30 bg-ok-soft text-ok",
    bad: "border-bad/30 bg-bad-soft text-bad",
    info: "border-info/30 bg-info-soft text-info",
  }[tone];
  return (
    <p role={tone === "bad" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>
      {children}
    </p>
  );
}

export function Field({
  name,
  label,
  hint,
  children,
}: {
  name: string;
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const errors = use(ErrorsContext)?.[name];
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {errors?.length ? (
        <p className="text-sm text-bad" id={`${name}-error`}>
          {errors[0]}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const control =
  "block w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-canvas disabled:text-muted";

export function Input(props: ComponentProps<"input">) {
  return <input id={props.name} {...props} className={`${control} h-10 ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea id={props.name} rows={4} {...props} className={`${control} py-2 ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select id={props.name} {...props} className={`${control} h-10 ${props.className ?? ""}`} />;
}

export function Checkbox({ label, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 text-sm hover:bg-canvas has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
      <input type="checkbox" {...props} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
      <span className="text-ink">{label}</span>
    </label>
  );
}

export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  variant,
  size,
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  name?: string;
  value?: string;
}) {
  const pending = use(PendingContext);
  return (
    <Button type="submit" disabled={pending} variant={variant} size={size} name={name} value={value}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
