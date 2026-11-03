import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, Field, FormMessage, Input, SubmitButton } from "@/components/ui/form";
import { formatDate } from "@/lib/labels";
import type { FormState } from "@/lib/schemas";
import type { PublicProfileSettings } from "@/server/data/public-profiles";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * A contractor's opt-in public profile: publish it, choose its address, or
 * take it down. Shows exactly what goes public and what doesn't.
 */
export function PublicProfileSettingsCard({
  settings,
  suggested,
  approved,
  editable,
  siteUrl,
  action,
}: {
  settings: PublicProfileSettings | null;
  suggested: string;
  approved: boolean;
  editable: boolean;
  siteUrl: string;
  action: Action;
}) {
  const published = !!settings?.is_published;
  const host = siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <Card className="max-w-3xl">
      <CardHeader
        title="Public profile"
        description="An optional page anyone can see, listed in QuickPro's contractor directory."
        action={
          published ? (
            <Badge tone="ok" dot>
              Published
            </Badge>
          ) : (
            <Badge tone="neutral">Not published</Badge>
          )
        }
      />
      <CardBody className="space-y-4">
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="font-medium text-ink">Shown publicly</p>
            <p className="mt-1 text-ink-soft">
              Business name, city, about text, services, towns, years in business, crew size, rating, and reviews from
              customers and primes (without their names). Whether a current liability certificate has been reviewed by
              staff.
            </p>
          </div>
          <div>
            <p className="font-medium text-ink">Never shown</p>
            <p className="mt-1 text-ink-soft">
              Phone, email, address, legal name, documents, your team, workers, prices and quotes.
            </p>
          </div>
        </div>
        {!approved ? (
          <FormMessage tone="info">You can publish once QuickPro staff approve your business.</FormMessage>
        ) : !editable ? (
          <FormMessage tone="info">Only owners and admins can publish or change the public profile.</FormMessage>
        ) : null}
        {published && settings ? (
          <p className="text-sm text-ink-soft">
            Live at{" "}
            <Link
              href={`/contractors/${settings.slug}`}
              className="font-medium text-brand hover:underline"
              data-testid="public-profile-link"
            >
              {host}/contractors/{settings.slug}
            </Link>{" "}
            since {formatDate(settings.published_at)}.
          </p>
        ) : null}
        {editable && approved ? (
          <ActionForm action={action}>
            <Field
              name="slug"
              label="Page address"
              hint={`${host}/contractors/your-address. Letters, numbers and hyphens.`}
            >
              <Input name="slug" defaultValue={settings?.slug ?? suggested} maxLength={60} required />
            </Field>
            <div className="flex flex-wrap gap-2">
              {published ? (
                <>
                  <SubmitButton name="intent" value="save" variant="secondary">
                    Save address
                  </SubmitButton>
                  <SubmitButton name="intent" value="unpublish" variant="secondary" pendingLabel="Unpublishing…">
                    Unpublish
                  </SubmitButton>
                </>
              ) : (
                <SubmitButton name="intent" value="publish" pendingLabel="Publishing…">
                  Publish profile
                </SubmitButton>
              )}
            </div>
          </ActionForm>
        ) : null}
      </CardBody>
    </Card>
  );
}
