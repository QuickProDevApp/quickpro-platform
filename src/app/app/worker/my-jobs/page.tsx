import type { Metadata } from "next";
import Link from "next/link";
import { NoJobs, WorkerJobList } from "@/components/app/worker-job-list";
import { requireUser } from "@/server/auth/session";
import { listMyWork } from "@/server/data/jobs";

export const metadata: Metadata = { title: "My jobs" };

export default async function MyJobsPage() {
  const user = await requireUser();
  const jobs = await listMyWork(user.id);
  const offers = jobs.filter((j) => j.assignment_status === "offered" && j.status === "open" && j.starts_at > new Date());
  return (
    <div className="space-y-4">
      {offers.length ? (
        <p className="rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 text-sm text-brand">
          You have {offers.length} {offers.length === 1 ? "offer" : "offers"} waiting for an answer.
        </p>
      ) : null}
      <WorkerJobList
        jobs={jobs}
        showJobStatus
        empty={
          <NoJobs title="You haven't applied for any jobs yet">
            <Link href="/app/worker/jobs" className="font-medium text-brand hover:underline">
              Find work
            </Link>
          </NoJobs>
        }
      />
    </div>
  );
}
