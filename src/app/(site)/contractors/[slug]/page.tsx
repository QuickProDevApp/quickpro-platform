import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContractorProfile } from "@/components/marketing/contractor-profile";
import { publicSlug } from "@/lib/schemas";
import { getPublicContractor, listPublicContractorReviews } from "@/server/data/public-profiles";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!publicSlug.safeParse(slug).success) return null;
  return getPublicContractor(slug);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = await load((await params).slug);
  if (!c) return { title: "Contractor not found" };
  return {
    title: c.name,
    description: `${c.name}: ${c.services.join(", ")} in ${c.areas.slice(0, 5).join(", ") || c.market_name}. Approved by QuickPro staff.`,
  };
}

export default async function PublicContractorPage({ params }: Params) {
  const c = await load((await params).slug);
  if (!c) notFound();
  const reviews = await listPublicContractorReviews(c.slug);
  return <ContractorProfile c={c} reviews={reviews} />;
}
