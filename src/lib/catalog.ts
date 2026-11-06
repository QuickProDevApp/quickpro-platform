/**
 * The services and towns QuickPro offers, for the public homepage, which is
 * static and doesn't read the database. They mirror the reference data in
 * supabase/migrations (service_categories, service_areas);
 * tests/db/catalog.test.ts fails if the two drift apart.
 */
export type ServiceSlug =
  | "general-construction"
  | "carpentry"
  | "painting-drywall"
  | "flooring"
  | "masonry-concrete"
  | "commercial-cleaning"
  | "pressure-washing"
  | "landscaping"
  | "facility-services";

export const SERVICES: { slug: ServiceSlug; name: string; blurb: string }[] = [
  { slug: "general-construction", name: "General construction and labor", blurb: "Site labor, selective demolition, material handling and site cleanup." },
  { slug: "carpentry", name: "Carpentry", blurb: "Framing, interior trim, doors and hardware, millwork and fixtures." },
  { slug: "painting-drywall", name: "Painting and drywall", blurb: "Hanging, taping and finishing, interior and exterior painting." },
  { slug: "flooring", name: "Flooring installation", blurb: "Floor prep and leveling, tile, LVT, carpet tile and resilient floors." },
  { slug: "masonry-concrete", name: "Masonry and concrete", blurb: "Flatwork and finishing, curbs and sidewalks, block and brick repair." },
  { slug: "commercial-cleaning", name: "Commercial cleaning", blurb: "Janitorial, office and retail, post-construction and event cleaning." },
  { slug: "pressure-washing", name: "Pressure washing", blurb: "Building exteriors, sidewalks, parking structures and dumpster pads." },
  { slug: "landscaping", name: "Landscaping", blurb: "Grounds maintenance, planting, seasonal cleanups and snow removal." },
  { slug: "facility-services", name: "Facility services", blurb: "General maintenance, porter services, light repairs and set-up." },
];

/** Suffolk County towns QuickPro serves (the active market). */
export const TOWNS: { slug: string; name: string }[] = [
  { slug: "babylon", name: "Babylon" },
  { slug: "brookhaven", name: "Brookhaven" },
  { slug: "east-hampton", name: "East Hampton" },
  { slug: "huntington", name: "Huntington" },
  { slug: "islip", name: "Islip" },
  { slug: "riverhead", name: "Riverhead" },
  { slug: "shelter-island", name: "Shelter Island" },
  { slug: "smithtown", name: "Smithtown" },
  { slug: "southampton", name: "Southampton" },
  { slug: "southold", name: "Southold" },
];
