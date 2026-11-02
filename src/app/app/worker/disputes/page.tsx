import type { Metadata } from "next";
import { DisputeList } from "@/components/app/dispute-view";
import { requireUser } from "@/server/auth/session";
import { listDisputes } from "@/server/data/disputes";

export const metadata: Metadata = { title: "Disputes" };

export default async function WorkerDisputesPage() {
  const user = await requireUser();
  const disputes = await listDisputes(user.id, null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Disputes</h2>
        <p className="text-[13px] text-muted">Raise one from the shift it&apos;s about, in My jobs.</p>
      </div>
      <DisputeList
        disputes={disputes}
        href={(d) => `/app/worker/disputes/${d.id}`}
        viewer="worker"
        emptyText="Problems you raise about a shift, such as hours or pay, or that a business raises about your work, appear here."
      />
    </div>
  );
}
