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
    ok: "border-ok/25 bg-ok-soft text-ok",
    bad: "border-bad/25 bg-bad-soft text-bad",
    info: "border-info/20 bg-info-soft text-ink-soft",
  }[tone];
  return (
    <p role={tone === "bad" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${styles}`}>
      {children}
    </p>
  );
}

export function Field({
  name,
  id,
  label,
  hint,
  children,
}: {
  name: string;
  /** The control's id when it differs from its name, e.g. two forms on one page. */
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const errors = use(ErrorsContext)?.[name];
  return (
    <div className="space-y-1.5">
      <label htmlFor={id ?? name} className="block text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {errors?.length ? (
        <p className="text-[13px] text-bad" id={`${name}-error`}>
          {errors[0]}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const control =
  "block w-full rounded-md border border-line-strong bg-surface px-3 text-base text-ink shadow-[0_1px_1px_rgba(13,22,38,0.03)] transition-[border-color,box-shadow] duration-150 placeholder:text-faint hover:border-faint focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/15 aria-[invalid=true]:border-bad aria-[invalid=true]:focus:ring-bad/15 disabled:bg-subtle disabled:text-muted sm:text-sm";

/** Marks a control invalid and links it to its error when the form returned one for it. */
function useInvalid(name: string | undefined) {
  const errors = use(ErrorsContext);
  const invalid = Boolean(name && errors?.[name]?.length);
  return invalid ? { "aria-invalid": true as const, "aria-describedby": `${name}-error` } : {};
}

export function Input(props: ComponentProps<"input">) {
  const invalid = useInvalid(props.name);
  return <input id={props.name} {...invalid} {...props} className={`${control} h-10 sm:h-9 ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  const invalid = useInvalid(props.name);
  return <textarea id={props.name} rows={4} {...invalid} {...props} className={`${control} py-2 ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  const invalid = useInvalid(props.name);
  return <select id={props.name} {...invalid} {...props} className={`${control} h-10 pr-8 sm:h-9 ${props.className ?? ""}`} />;
}

export function Checkbox({ label, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line px-3 py-2.5 text-sm transition-colors hover:border-line-strong has-[:checked]:border-navy/40 has-[:checked]:bg-subtle">
      <input type="checkbox" {...props} className="mt-0.5 h-4 w-4 accent-[var(--color-navy)]" />
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
    <Button type="submit" disabled={pending} aria-busy={pending || undefined} variant={variant} size={size} name={name} value={value}>
      {pending ? (
        <>
          <Spinner />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export function Spinner() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 animate-spin" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
