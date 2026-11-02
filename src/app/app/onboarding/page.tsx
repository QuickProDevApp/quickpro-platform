import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ActionForm, Field, Input, Select, SubmitButton } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/server/auth/session";
import { getMyRoles } from "@/server/data/home";
import { listActiveMarkets, type Market } from "@/server/data/reference";
import { createOrganizationAction, createWorkerProfileAction } from "./actions";

export const metadata: Metadata = { title: "Get started" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const user = await requireUser();
  const [{ as }, markets, roles] = await Promise.all([searchParams, listActiveMarkets(user.id), getMyRoles(user.id)]);
  const highlight = (key: string) => (as === key ? "ring-2 ring-brand" : "");

  return (
    <>
      <PageHeader
        title="How will you use QuickPro?"
        description="You can add more later. One account can run a business and hold a worker profile."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={`flex flex-col p-5 ${highlight("contractor")}`}>
          <h2 className="font-semibold">Register a service business</h2>
          <p className="mt-1 text-sm text-muted">
            For cleaning, pressure washing, landscaping and facility service companies that want help staffing and
            coordinating commercial work.
          </p>
          <OrganizationForm kind="contractor" markets={markets} label="Business name" cta="Register business" />
        </Card>

        <Card className={`flex flex-col p-5 ${highlight("worker")}`}>
          <h2 className="font-semibold">Create a worker profile</h2>
          <p className="mt-1 text-sm text-muted">
            For people who want shifts with local service companies. Share your skills, where you can travel and when
            you are available.
          </p>
          <div className="mt-auto pt-5">
            {roles.worker ? (
              <LinkButton href="/app/worker" variant="secondary">
                Open your worker profile
              </LinkButton>
            ) : (
              <ActionForm action={createWorkerProfileAction}>
                <SubmitButton pendingLabel="Creating…">Create worker profile</SubmitButton>
              </ActionForm>
            )}
          </div>
        </Card>

        <Card className={`flex flex-col p-5 ${highlight("customer")}`}>
          <h2 className="font-semibold">Register a property or organization</h2>
          <p className="mt-1 text-sm text-muted">
            For property managers, facilities and businesses that need commercial services. Once approved, post
            requests and compare quotes from reviewed local contractors.
          </p>
          <OrganizationForm kind="customer" markets={markets} label="Organization name" cta="Register organization" />
        </Card>
      </div>
    </>
  );
}

function OrganizationForm({
  kind,
  markets,
  label,
  cta,
}: {
  kind: "contractor" | "customer";
  markets: Market[];
  label: string;
  cta: string;
}) {
  return (
    <ActionForm action={createOrganizationAction} className="mt-auto space-y-3 pt-5">
      <input type="hidden" name="kind" value={kind} />
      <Field name="name" id={`${kind}-name`} label={label}>
        <Input name="name" id={`${kind}-name`} autoComplete="organization" required />
      </Field>
      {markets.length === 1 ? (
        <>
          <input type="hidden" name="marketId" value={markets[0].id} />
          <p className="text-xs text-muted">
            Market: {markets[0].name}, {markets[0].state_code}
          </p>
        </>
      ) : (
        <Field name="marketId" id={`${kind}-market`} label="Market">
          <Select name="marketId" id={`${kind}-market`} defaultValue="">
            <option value="" disabled>
              Choose a market
            </option>
            {markets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}, {m.state_code}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <SubmitButton pendingLabel="Creating…">{cta}</SubmitButton>
    </ActionForm>
  );
}
