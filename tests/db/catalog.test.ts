import { afterAll, describe, expect, it } from "vitest";
import { SERVICES, TOWNS } from "@/lib/catalog";
import { sql } from "./helpers";

// The homepage's service and town lists (src/lib/catalog.ts) must match the
// reference data, or its search and service links would lead nowhere.
afterAll(() => sql.end());

describe("homepage catalog", () => {
  it("lists exactly the active services, by slug and name", async () => {
    const rows = await sql<{ slug: string; name: string }[]>`
      select slug, name from public.service_categories where is_active order by slug
    `;
    expect([...SERVICES].map((s) => ({ slug: s.slug, name: s.name })).sort((a, b) => a.slug.localeCompare(b.slug))).toEqual(rows);
  });

  it("lists exactly the towns of the active market", async () => {
    const rows = await sql<{ slug: string; name: string }[]>`
      select a.slug, a.name from public.service_areas a join public.markets m on m.id = a.market_id
      where m.is_active order by a.slug
    `;
    expect([...TOWNS].sort((a, b) => a.slug.localeCompare(b.slug))).toEqual(rows.map((r) => ({ ...r })));
  });
});
