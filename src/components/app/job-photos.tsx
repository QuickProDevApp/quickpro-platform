import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { ActionForm, Field, Input, Select, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/schemas";
import type { ChecklistItem } from "@/server/data/checklists";
import type { JobPhoto } from "@/server/data/job-photos";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const timeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

/**
 * Photos of the work on a job: the crew add them once checked in, the
 * business at any time while the job is open. Files are private and served
 * through the app.
 */
export function JobPhotos({
  photos,
  viewer,
  currentUserId,
  canAdd,
  canManage,
  lockedReason,
  checklist,
  uploadAction,
  hideAction,
  shareWith,
  shareAction,
}: {
  photos: JobPhoto[];
  viewer: "business" | "crew";
  currentUserId: string;
  /** Who may add photos now (the database checks again). */
  canAdd: boolean;
  /** Dispatchers while the job is open or filled: may take any photo off. */
  canManage: boolean;
  lockedReason?: string;
  checklist: ChecklistItem[];
  uploadAction: Action;
  hideAction: Action;
  /** The customer's name when this viewer can share photos to the project page (D-036). */
  shareWith?: string | null;
  shareAction?: Action;
}) {
  const sharing = viewer === "business" && !!shareWith && !!shareAction;
  const sharedCount = photos.filter((p) => p.shared_at).length;
  return (
    <Card>
      <CardHeader
        title="Photos"
        description={
          viewer === "business"
            ? sharing
              ? `Proof of the work, from the crew on site or your team. ${shareWith} sees only the photos you share; ${sharedCount} shared so far.`
              : "Proof of the work, from the crew on site or your team. Only your business, the booked crew and QuickPro staff can see them."
            : "Photos of your work for the business. Only the business, the booked crew and QuickPro staff can see them."
        }
        action={
          photos.length ? (
            <span className="tabular text-[13px] font-medium text-ink-soft">
              {photos.length} {photos.length === 1 ? "photo" : "photos"}
            </span>
          ) : null
        }
      />
      <CardBody className="space-y-4">
        {photos.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => {
              const mine = p.uploaded_by === currentUserId;
              const who = mine ? "You" : viewer === "business" ? (p.uploaded_by_name ?? "Someone") : null;
              const label = p.caption ?? p.checklist_label ?? "Job photo";
              return (
                <li key={p.id} className="min-w-0" data-testid="job-photo" data-shared={!!p.shared_at}>
                  <a
                    href={`/api/job-photos/${p.id}`}
                    target="_blank"
                    rel="noopener"
                    className="relative block overflow-hidden rounded-md border border-line bg-subtle focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    {sharing && p.shared_at ? (
                      <span className="absolute top-1.5 left-1.5 rounded-full bg-surface/95 px-2 py-0.5 text-[11px] font-medium text-ok shadow-sm ring-1 ring-line">
                        Shared
                      </span>
                    ) : null}
                    {/* eslint-disable-next-line @next/next/no-img-element -- private files served by an authorized route */}
                    <img
                      src={`/api/job-photos/${p.id}`}
                      alt={label}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                  </a>
                  <div className="mt-1.5 space-y-0.5 text-xs">
                    {p.caption ? <p className="line-clamp-2 text-ink">{p.caption}</p> : null}
                    {p.checklist_label ? <p className="line-clamp-1 text-ink-soft">For: {p.checklist_label}</p> : null}
                    <p className="text-muted">
                      {who ? `${who} · ` : ""}
                      {timeFormat.format(p.created_at)}
                    </p>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {sharing && shareAction ? (
                      <ActionForm action={shareAction} className="min-w-0" successMessage={false}>
                        <input type="hidden" name="photoId" value={p.id} />
                        <input type="hidden" name="shared" value={p.shared_at ? "false" : "true"} />
                        <button
                          type="submit"
                          className={`text-xs font-medium ${p.shared_at ? "text-muted hover:text-ink" : "text-brand hover:underline"}`}
                          aria-label={p.shared_at ? `Stop sharing: ${label}` : `Share with customer: ${label}`}
                        >
                          {p.shared_at ? "Stop sharing" : "Share with customer"}
                        </button>
                      </ActionForm>
                    ) : null}
                    {canManage || (mine && canAdd) ? (
                      <ActionForm action={hideAction} className="min-w-0" successMessage={false}>
                        <input type="hidden" name="photoId" value={p.id} />
                        <button
                          type="submit"
                          className="text-xs font-medium text-muted hover:text-bad"
                          aria-label={`Remove photo: ${label}`}
                        >
                          Remove
                        </button>
                      </ActionForm>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : viewer === "business" ? (
          <EmptyState title="No photos yet">Booked workers can add photos once they check in.</EmptyState>
        ) : null}
        {!canAdd && lockedReason ? <p className="text-[13px] text-muted">{lockedReason}</p> : null}
        {canAdd ? (
          <ActionForm
            action={uploadAction}
            resetOnSuccess
            className="space-y-3 rounded-md border border-dashed border-line-strong p-3"
          >
            <Field
              name="photo"
              id="job-photo-file"
              label="Add a photo"
              hint="JPEG or PNG, up to 10 MB. On a phone you can take one with the camera."
            >
              <Input
                id="job-photo-file"
                name="photo"
                type="file"
                accept="image/jpeg,image/png"
                required
                className="!h-auto py-1.5 text-ink-soft file:mr-3 file:rounded-md file:border-0 file:bg-subtle file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink hover:file:bg-line"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field name="caption" id="job-photo-caption" label="Caption (optional)">
                <Input
                  id="job-photo-caption"
                  name="caption"
                  maxLength={200}
                  placeholder="For example: Lobby after the second coat"
                />
              </Field>
              {checklist.length ? (
                <Field name="checklistItemId" id="job-photo-item" label="Checklist item (optional)">
                  <Select id="job-photo-item" name="checklistItemId" defaultValue="">
                    <option value="">Not for a specific item</option>
                    {checklist.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
            <SubmitButton variant="secondary" pendingLabel="Uploading…">
              Add photo
            </SubmitButton>
          </ActionForm>
        ) : null}
      </CardBody>
    </Card>
  );
}
