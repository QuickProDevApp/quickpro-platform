import type { Metadata } from "next";
import { NewSupportRequestForm, SupportList } from "@/components/app/support";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SUPPORT_TOPICS } from "@/lib/schemas";
import { openSupportTicketAction } from "@/server/actions/support";
import { requireUser } from "@/server/auth/session";
import { getMyRoles } from "@/server/data/home";
import { listMySupportTickets, type SupportTopic } from "@/server/data/support";

export const metadata: Metadata = { title: "Help and support" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const user = await requireUser();
  const [roles, tickets] = await Promise.all([getMyRoles(user.id), listMySupportTickets(user.id)]);
  const requested = (await searchParams).topic;
  const topic = SUPPORT_TOPICS.find((t) => t === requested) as SupportTopic | undefined;

  return (
    <>
      <PageHeader
        title="Help and support"
        description="Ask QuickPro staff about your account, verification, jobs, projects, invoices or anything else. Staff reply here, and you get a notification in QuickPro."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-4">
          <div className="rounded-lg border border-bad/25 bg-bad-soft px-4 py-3 text-sm text-ink" role="note">
            <strong className="font-semibold text-bad">If someone is hurt or in danger, call 911 first.</strong> Then tell us here under
            &ldquo;Safety on a job&rdquo; so staff can follow up with the business.
          </div>
          <Card>
            <CardHeader title="New request" />
            <CardBody>
              <NewSupportRequestForm
                action={openSupportTicketAction}
                organizations={roles.organizations.map((o) => ({ id: o.id, name: o.name }))}
                defaultTopic={topic}
              />
            </CardBody>
          </Card>
        </div>
        <section aria-labelledby="my-requests" className="space-y-3">
          <h2 id="my-requests" className="text-[15px] font-semibold text-ink">
            Your requests
          </h2>
          <SupportList
            tickets={tickets}
            href={(t) => `/app/support/${t.id}`}
            viewer="requester"
            emptyTitle="No requests yet"
            emptyText="Anything you send to QuickPro support shows up here with staff replies."
          />
        </section>
      </div>
    </>
  );
}
