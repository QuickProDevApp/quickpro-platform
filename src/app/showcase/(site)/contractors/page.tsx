import type { Metadata } from "next";
import { ContractorDirectory } from "@/components/marketing/contractor-directory";
import { sampleContractors, sampleFilters } from "@/showcase/data";

export const metadata: Metadata = { title: "Find contractors" };

/** The public directory with sample businesses (D-047). Served at /contractors in the preview. */
export default async function ShowcaseContractorsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; town?: string }>;
}) {
  const q = await searchParams;
  const categoryName = sampleFilters.categories.find((c) => c.slug === q.category)?.name;
  const townName = sampleFilters.areas.find((a) => a.slug === q.town)?.name;
  const category = categoryName ? q.category : undefined;
  const town = townName ? q.town : undefined;
  return (
    <ContractorDirectory
      filters={sampleFilters}
      contractors={sampleContractors({ category, town })}
      category={category}
      town={town}
      categoryName={categoryName}
      townName={townName}
    />
  );
}
