import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContractorProfile } from "@/components/marketing/contractor-profile";
import { sampleContractor } from "@/showcase/data";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const found = sampleContractor((await params).slug);
  return { title: found ? found.contractor.name : "Contractor not found" };
}

/** A sample business's profile (D-047). Served at /contractors/<slug> in the preview. */
export default async function ShowcaseContractorPage({ params }: Params) {
  const found = sampleContractor((await params).slug);
  if (!found) notFound();
  return <ContractorProfile c={found.contractor} reviews={found.reviews} />;
}
