import type { Metadata } from "next";
import Link from "next/link";
import { FilterLinks } from "@/components/app/filter-links";
import { NoJobs, WorkerJobList } from "@/components/app/worker-job-list";
import { FormMessage } from "@/components/ui/form";
import { requireUser } from "@/server/auth/session";
import { listOpenJobsForWorker } from "@/server/data/jobs";
import { getWorkerProfile } from "@/server/data/workers";

export const metadata: Metadata = { title: "Find work" };

export default async function FindWorkPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const user = await requireUser();
  const profile = await getWorkerProfile(user.id);
  if (!profile) return null;
  if (profile.status !== "approved") {
    return (
      <FormMessage tone="info">
        Jobs from local businesses appear here once QuickPro staff approve your worker profile. Finish your profile and submit
        it from the Overview tab.
      </FormMessage>
    );
  }
  const scope = (await searchParams).scope === "all" ? "all" : "local";
  const jobs = await listOpenJobsForWorker(user.id, scope);

  return (
    <div className="space-y-4">
      <FilterLinks
        basePath="/app/worker/jobs"
        param="scope"
        current={scope === "all" ? "all" : undefined}
        options={[
          { value: undefined, label: "In my towns" },
          { value: "all", label: "Everywhere QuickPro is open" },
        ]}
      />
      <WorkerJobList
        jobs={jobs}
        empty={
          <NoJobs title={scope === "local" ? "No open jobs in your towns right now" : "No open jobs right now"}>
            {scope === "local" ? (
              <>
                <Link href="/app/worker/jobs?scope=all" className="font-medium text-brand hover:underline">
                  See jobs everywhere
                </Link>{" "}
                or add towns to your{" "}
                <Link href="/app/worker/profile" className="font-medium text-brand hover:underline">
                  profile
                </Link>
                .
              </>
            ) : (
              "New jobs appear here as soon as businesses post them."
            )}
          </NoJobs>
        }
      />
    </div>
  );
}
