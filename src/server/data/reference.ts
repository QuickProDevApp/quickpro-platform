import "server-only";
import { withUser } from "@/server/db/client";

export type Market = { id: string; slug: string; name: string; state_code: string; is_active: boolean };
export type ServiceArea = { id: string; market_id: string; slug: string; name: string; kind: string };
export type ServiceCategory = { id: string; slug: string; name: string; description: string };
export type Skill = { id: string; slug: string; name: string; category_id: string | null };

export function listActiveMarkets(userId: string) {
  return withUser(userId, (tx) => tx<Market[]>`
    select id, slug, name, state_code, is_active from public.markets where is_active order by name
  `);
}

export function listServiceAreas(userId: string, marketId: string) {
  return withUser(userId, (tx) => tx<ServiceArea[]>`
    select id, market_id, slug, name, kind from public.service_areas where market_id = ${marketId} order by name
  `);
}

/** Service areas in every open market, for workers who are not tied to one organization's market. */
export function listOpenServiceAreas(userId: string) {
  return withUser(userId, (tx) => tx<(ServiceArea & { market_name: string })[]>`
    select a.id, a.market_id, a.slug, a.name, a.kind, m.name as market_name
    from public.service_areas a join public.markets m on m.id = a.market_id
    where m.is_active
    order by m.name, a.name
  `);
}

export function listCategories(userId: string) {
  return withUser(userId, (tx) => tx<ServiceCategory[]>`
    select id, slug, name, description from public.service_categories where is_active order by sort_order, name
  `);
}

export function listSkills(userId: string) {
  return withUser(userId, (tx) => tx<(Skill & { category_name: string | null })[]>`
    select s.id, s.slug, s.name, s.category_id, c.name as category_name
    from public.skills s left join public.service_categories c on c.id = s.category_id
    order by coalesce(c.sort_order, 99), s.sort_order, s.name
  `);
}
