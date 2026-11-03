import "server-only";
import { withAnon, withUser } from "@/server/db/client";

// Public contractor profiles (D-032). Published by an approved contractor's
// owners or admins; read by anyone, signed in or not, through read-only
// database functions that return only what is safe to show publicly.

export type PublicContractor = {
  slug: string;
  name: string;
  description: string;
  city: string | null;
  market_name: string;
  years_in_business: number | null;
  crew_size: number | null;
  services: string[];
  areas: string[];
  rating_avg: string | null;
  rating_count: number;
  insurance_reviewed: boolean;
  on_quickpro_since: string;
};

export type PublicContractorDetail = PublicContractor & { completed_projects: number };

export type PublicReview = {
  rating: number;
  body: string;
  reply: string | null;
  reviewer: string;
  area_name: string | null;
  reviewed_on: string;
};

export type PublicProfileSettings = { slug: string; is_published: boolean; published_at: Date | null };

export function listPublicContractors(filter: { category?: string; area?: string }) {
  return withAnon(
    (tx) => tx<PublicContractor[]>`
    select slug, name, description, city, market_name, years_in_business, crew_size, services, areas,
           rating_avg::text, rating_count, insurance_reviewed, to_char(on_quickpro_since, 'YYYY-MM-DD') as on_quickpro_since
    from public.public_contractors(${filter.category ?? null}, ${filter.area ?? null})
  `,
  );
}

export async function getPublicContractor(slug: string): Promise<PublicContractorDetail | null> {
  const [row] = await withAnon(
    (tx) => tx<PublicContractorDetail[]>`
    select slug, name, description, city, market_name, years_in_business, crew_size, services, areas,
           rating_avg::text, rating_count, insurance_reviewed, to_char(on_quickpro_since, 'YYYY-MM-DD') as on_quickpro_since,
           completed_projects
    from public.public_contractor(${slug})
  `,
  );
  return row ?? null;
}

export function listPublicContractorReviews(slug: string) {
  return withAnon(
    (tx) => tx<PublicReview[]>`
    select rating, body, reply, reviewer, area_name, to_char(reviewed_on, 'YYYY-MM-DD') as reviewed_on
    from public.public_contractor_reviews(${slug})
  `,
  );
}

/** Categories and towns in open markets, for the directory filters. */
export function listPublicFilters() {
  return withAnon(async (tx) => ({
    categories: await tx<{ slug: string; name: string }[]>`
      select slug, name from public.service_categories where is_active order by sort_order, name
    `,
    areas: await tx<{ slug: string; name: string }[]>`
      select a.slug, a.name from public.service_areas a join public.markets m on m.id = a.market_id
      where m.is_active order by a.name
    `,
  }));
}

export async function getPublicProfileSettings(userId: string, orgId: string): Promise<PublicProfileSettings | null> {
  const [row] = await withUser(
    userId,
    (tx) => tx<PublicProfileSettings[]>`
    select slug, is_published, published_at from public.contractor_public_profiles where organization_id = ${orgId}
  `,
  );
  return row ?? null;
}

export async function setPublicProfile(userId: string, orgId: string, publish: boolean, slug: string) {
  const [{ slug: saved }] = await withUser(
    userId,
    (tx) => tx<{ slug: string }[]>`
    select public.set_public_profile(${orgId}, ${publish}, ${slug}) as slug
  `,
  );
  return saved;
}

/** A starting page address from the business name. */
export function suggestSlug(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
