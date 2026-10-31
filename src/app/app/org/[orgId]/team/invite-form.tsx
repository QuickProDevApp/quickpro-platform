"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage, Input, Select } from "@/components/ui/form";
import { ORG_ROLE_DESCRIPTION, ORG_ROLE_LABEL } from "@/lib/labels";
import type { InviteState } from "./actions";

/**
 * Creates an invitation and shows its one-time link. The link is the only
 * copy of the token, so it is shown once here and never stored in the page.
 */
export function InviteForm({
  action,
  roles,
}: {
  action: (state: InviteState, formData: FormData) => Promise<InviteState>;
  roles: readonly ("admin" | "dispatcher" | "member")[];
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false });
  const [copied, setCopied] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(() => formAction(formData));
    form.querySelector<HTMLInputElement>("input[name=email]")?.focus();
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
    } catch {
      // Clipboard can be blocked; the link stays selectable in the box.
      setCopied(null);
    }
  }

  const errors = state.fieldErrors;
  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-start" noValidate>
        <div>
          <label htmlFor="invite-email" className="sr-only">Email</label>
          <Input id="invite-email" name="email" type="email" placeholder="name@company.com" autoComplete="off" aria-invalid={errors?.email ? true : undefined} />
          {errors?.email ? <p className="mt-1 text-sm text-bad">{errors.email[0]}</p> : null}
        </div>
        <div>
          <label htmlFor="invite-role" className="sr-only">Role</label>
          <Select id="invite-role" name="role" defaultValue="member">
            {roles.map((role) => (
              <option key={role} value={role}>{ORG_ROLE_LABEL[role]}</option>
            ))}
          </Select>
        </div>
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create invite link"}</Button>
      </form>
      <ul className="space-y-1 text-xs text-muted">
        {roles.map((role) => (
          <li key={role}><span className="font-medium text-ink-soft">{ORG_ROLE_LABEL[role]}:</span> {ORG_ROLE_DESCRIPTION[role]}</li>
        ))}
      </ul>
      {state.message && !state.ok ? <FormMessage tone="bad">{state.message}</FormMessage> : null}
      {state.ok && state.link ? (
        <div className="space-y-2 rounded-lg border border-ok/30 bg-ok-soft p-3" data-testid="invite-link">
          <p className="text-sm text-ink">
            Send this link to <span className="font-medium">{state.email}</span>. They sign in or create an account with that
            email, then accept. The link works once and expires in 14 days. You won&apos;t see it again after you leave this page.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={state.link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="secondary" onClick={() => copy(state.link!)}>
              {copied === state.link ? "Copied" : "Copy link"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
