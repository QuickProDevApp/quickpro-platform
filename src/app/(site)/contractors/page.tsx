import type { Metadata } from "next";
import { ContractorDirectory } from "@/components/marketing/contractor-directory";
import { listPublicContractors, listPublicFilters } from "@/server/data/public-profiles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Find contractors",
  description:
    "Construction, skilled-trade and commercial service businesses in Suffolk County, approved by QuickPro staff.",
};

export default async function PublicContractorsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; town?: string }>;
}) {
  const q = await searchParams;
  const filters = await listPublicFilters();
  // Only filter by a service or town that's in the lists; anything else in
  // the address is ignored, so the form always matches what's shown.
  const categoryName = filters.categories.find((c) => c.slug === q.category)?.name;
  const townName = filters.areas.find((a) => a.slug === q.town)?.name;
  const category = categoryName ? q.category : undefined;
  const town = townName ? q.town : undefined;
  const contractors = await listPublicContractors({ category, area: town });

  return (
    <ContractorDirectory
      filters={filters}
      contractors={contractors}
      category={category}
      town={town}
      categoryName={categoryName}
      townName={townName}
    />
  );
}
