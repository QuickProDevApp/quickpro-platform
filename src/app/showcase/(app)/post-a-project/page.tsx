import type { Metadata } from "next";
import { PostRequestForm } from "@/components/app/post-request-form";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { SERVICES, TOWNS } from "@/lib/catalog";
import { previewPostAction } from "./actions";

export const metadata: Metadata = { title: "Post a project" };
export const dynamic = "force-dynamic";

// Placeholder identifiers so the form validates like the app; nothing is stored.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const categories = SERVICES.map((s, i) => ({ id: id(i + 1), name: s.name }));
const areas = TOWNS.map((t, i) => ({ id: id(100 + i), name: t.name }));

/** The customer's posting form with a sample business's details (D-047). */
export default function ShowcasePostProject() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  return (
    <>
      <PageHeader
        title="Harbor Point Properties"
        meta={<Badge dot tone="ok">Sample customer</Badge>}
        description="Customer · Suffolk County, NY · Viewing as Dana, the owner"
      />
      <PostRequestForm
        action={previewPostAction}
        categories={categories}
        areas={areas}
        matchingArea={areas.find((a) => a.name === "Islip")?.id}
        today={today}
        defaults={{
          addressLine1: "120 Harbor Point Blvd",
          city: "Islip",
          postalCode: "11751",
          contactName: "Dana Whitfield",
          contactPhone: "631-555-0142",
        }}
      />
    </>
  );
}
