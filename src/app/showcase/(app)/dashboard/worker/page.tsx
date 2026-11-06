import type { Metadata } from "next";
import { StatTiles } from "@/components/app/stat-tiles";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatCents, shiftHours, shiftParts } from "@/lib/labels";
import { sampleWorkerShifts } from "@/showcase/data";

export const metadata: Metadata = { title: "Worker dashboard" };
export const dynamic = "force-dynamic";

/** A sample tradesperson's overview (D-047). */
export default function ShowcaseWorkerDashboard() {
  const shifts = sampleWorkerShifts();
  const offers = shifts.filter((s) => s.offer).length;
  return (
    <>
      <PageHeader
        title="Ana Morales"
        meta={<Badge dot tone="ok">Sample worker</Badge>}
        description="Finish carpenter, 9 years in commercial interiors · Islip, NY"
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <StatTiles
            tiles={[
              { label: "Booked shifts", value: shifts.length - offers, href: "/showcase/dashboard/worker", icon: "calendar" },
              { label: "Offers to answer", value: offers, href: "/showcase/dashboard/worker", icon: "handshake", highlight: offers > 0, hint: "Accept or decline" },
              { label: "Applications", value: 2, href: "/showcase/dashboard/worker", icon: "check" },
            ]}
          />
          <Card>
            <CardHeader title="Your next shifts" description="Booked work, soonest first. Addresses and site contacts are on each job." />
            <ul className="divide-y divide-line">
              {shifts.map((j) => {
                const { day, time } = shiftParts(j.starts_at, j.ends_at);
                return (
                  <li key={j.id} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                    <span className="w-16 shrink-0 border-r border-line pr-3 text-[13px] leading-5 font-medium text-ink">{day}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-ink">{j.title}</span>
                        {j.offer ? (
                          <Badge dot tone="warn">
                            Offer waiting
                          </Badge>
                        ) : null}
                      </span>
                      <span className="block text-[13px] text-muted">
                        {time} · {j.org} · {j.area}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tabular block text-sm font-semibold text-ink">{formatCents(j.rate)}/hr</span>
                      <span className="tabular block text-xs text-muted">
                        ≈ {formatCents(Math.round(j.rate * shiftHours(j.starts_at, j.ends_at)))}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
          <p className="text-[13px] leading-5 text-muted">
            Each job says how the business engages you (for example as its employee). The business handles the paperwork
            that requires, and pays you for approved hours.
          </p>
        </div>
        <Card className="self-start">
          <CardHeader title="At a glance" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              {[
                ["Home area", "Islip"],
                ["Travel", "Up to 25 miles, has a vehicle"],
                ["Desired rate", "$38.00/hr"],
                ["Skills", "Finish carpentry, doors and hardware"],
                ["Availability", "Mon–Fri 7:00 AM–4:00 PM"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
                  <dd className="mt-0.5 text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
