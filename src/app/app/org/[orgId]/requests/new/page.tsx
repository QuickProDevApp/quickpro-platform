import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostRequestForm } from "@/components/app/post-request-form";
import { FormMessage } from "@/components/ui/form";
import { requireMembership } from "@/server/actions/guards";
import { canDispatch } from "@/server/data/organizations";
import { listCategories, listServiceAreas } from "@/server/data/reference";
import { createRequestAction } from "../actions";

export const metadata: Metadata = { title: "Request service" };

export default async function NewRequestPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, org } = await requireMembership(orgId);
  if (org.kind !== "customer" || !canDispatch(org.my_role)) notFound();
  if (org.status !== "approved") {
    return (
      <FormMessage tone="info">You can request service once QuickPro staff approve your organization.</FormMessage>
    );
  }
  const [categories, areas] = await Promise.all([listCategories(user.id), listServiceAreas(user.id, org.market_id)]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const matchingArea = areas.find((a) => a.name === org.city)?.id;

  return (
    <PostRequestForm
      action={createRequestAction.bind(null, org.id)}
      categories={categories}
      areas={areas}
      matchingArea={matchingArea}
      today={today}
      defaults={{
        addressLine1: org.address_line1 ?? "",
        city: org.city ?? "",
        postalCode: org.postal_code ?? "",
        contactName: user.fullName ?? "",
        contactPhone: org.phone ?? "",
      }}
    />
  );
}
