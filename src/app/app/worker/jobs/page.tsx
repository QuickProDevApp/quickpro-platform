import type { Metadata } from "next";
import Link from "next/link";
import { FilterLinks } from "@/components/app/filter-links";
import { NoJobs, WorkerJobList } from "@/components/app/worker-job-list";
import { FormMessage } from "@/components/ui/form";
import { requireUser } from "@/server/auth/session";
import { listOpenJobsForWorker } from "@/server/data/jobs";
import { getWorkerProfile } from "@/server/data/workers";

export const metadata: Metadata = { title: "Find work" };

export default async function FindWorkPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; fit?: string }>;
}) {
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
  const query = await searchParams;
  const scope = query.scope === "all" ? "all" : "local";
  const fitOnly = query.fit === "1";
  const jobs = await listOpenJobsForWorker(user.id, scope, fitOnly);
  const scopeParam = scope === "all" ? "all" : undefined;
  const fitParam = fitOnly ? "1" : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-3">
        <FilterLinks
          basePath="/app/worker/jobs"
          param="scope"
          current={scopeParam}
          extra={{ fit: fitParam }}
          options={[
            { value: undefined, label: "In my towns" },
            { value: "all", label: "Everywhere QuickPro is open" },
          ]}
        />
        <FilterLinks
          basePath="/app/worker/jobs"
          param="fit"
          current={fitParam}
          extra={{ scope: scopeParam }}
          options={[
            { value: undefined, label: "Any time" },
            { value: "1", label: "Fits my availability" },
          ]}
        />
      </div>
      <WorkerJobList
        jobs={jobs}
        showFit
        empty={
          <NoJobs
            title={
              fitOnly
                ? "No open jobs fit your availability right now"
                : scope === "local"
                  ? "No open jobs in your towns right now"
                  : "No open jobs right now"
            }
          >
            {fitOnly ? (
              <>
                <Link
                  href={`/app/worker/jobs${scopeParam ? "?scope=all" : ""}`}
                  className="font-medium text-brand hover:underline"
                >
                  See jobs at any time
                </Link>{" "}
                or update your weekly hours on your{" "}
                <Link href="/app/worker/profile" className="font-medium text-brand hover:underline">
                  profile
                </Link>
                .
              </>
            ) : scope === "local" ? (
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
