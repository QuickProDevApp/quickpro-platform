import { formatCents, formatShift, shiftHours } from "@/lib/labels";
import type { Job, JobSite } from "@/server/data/jobs";

/** The facts of a job, shared by the contractor, worker and staff views. */
export function JobFacts({ job }: { job: Job }) {
  const hours = shiftHours(job.starts_at, job.ends_at);
  return (
    <dl className="divide-y divide-line text-sm">
      <Fact label="When" value={formatShift(job.starts_at, job.ends_at)} detail={`${hours} hours, Eastern time`} />
      <Fact label="Where" value={`${job.area_name}, NY`} />
      <Fact label="Pay" value={`${formatCents(job.pay_rate_cents)} an hour`} detail={`About ${formatCents(Math.round(job.pay_rate_cents * hours))} for the shift`} />
      <Fact label="People needed" value={String(job.headcount)} />
      <Fact label="Category" value={job.category_name} />
      <Fact label="Engagement" value={job.engagement_name} detail={job.engagement_description} />
      {job.skill_names.length ? <Fact label="Skills wanted" value={job.skill_names.join(", ")} /> : null}
    </dl>
  );
}

export function SiteFacts({ site }: { site: JobSite }) {
  return (
    <dl className="divide-y divide-line text-sm">
      <Fact label="Address" value={`${site.address_line1}, ${site.city}, NY ${site.postal_code}`} />
      <Fact label="Ask for" value={site.contact_name} detail={site.contact_phone} />
      {site.site_notes ? <Fact label="Arrival notes" value={site.site_notes} /> : null}
    </dl>
  );
}

export function Fact({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-x-3 py-2.5 first:pt-0 last:pb-0">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 text-ink">
        {value}
        {detail ? <span className="mt-0.5 block text-xs leading-[1.125rem] text-muted">{detail}</span> : null}
      </dd>
    </div>
  );
}
