import type { ServiceSlug } from "@/lib/catalog";

/** Line icons for the service categories, drawn on a 24px grid in the current color. */
const paths: Record<ServiceSlug, React.ReactNode> = {
  // A hard hat.
  "general-construction": (
    <>
      <path d="M4 16.5h16M5 16.5a7 7 0 0 1 14 0" />
      <path d="M10 9.8V7.5h4v2.3M3.5 19h17" />
    </>
  ),
  // A hammer.
  carpentry: (
    <>
      <path d="m13.5 9.5-8 8a1.6 1.6 0 0 0 2.3 2.3l8-8" />
      <path d="m11.5 7.5 3.7-3.2a2 2 0 0 1 2.6 0l2.4 2.1-1.8 1.8-1.4-.9-2.7 2.9" />
    </>
  ),
  // A paint roller.
  "painting-drywall": (
    <>
      <rect x="4" y="4" width="13" height="5" rx="1.5" />
      <path d="M17 6.5h2.5v4.5H12v2.5" />
      <rect x="10.5" y="13.5" width="3" height="6.5" rx="1" />
    </>
  ),
  // Floor tiles.
  flooring: (
    <>
      <path d="M3.5 9h17M3.5 15h17M9 9v6M15 3.5V9M12 15v5.5" />
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
    </>
  ),
  // Bricks.
  "masonry-concrete": (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <path d="M3.5 9.7h17M3.5 14.3h17M9 5v4.7M15 5v4.7M12 9.7v4.6M9 14.3V19M15 14.3V19" />
    </>
  ),
  // A spray bottle.
  "commercial-cleaning": (
    <>
      <path d="M9 8h5l1.5 3v8.5a1 1 0 0 1-1 1H8.5a1 1 0 0 1-1-1V11L9 8Z" />
      <path d="M10 8V5.5h5.5L17 7M18.5 4.5l1.5-1M19 7h1.5" />
    </>
  ),
  // A spray of water from a wand.
  "pressure-washing": (
    <>
      <path d="M3.5 17.5 11 10M9.5 8.5l3 3" />
      <path d="M15 7.5l3.5-3M16 10.5l4-1.5M13 5.5l1.5-2.5" />
    </>
  ),
  // A leaf.
  landscaping: (
    <>
      <path d="M5 19c0-8 5-13.5 14-14 0 9-5.5 14-14 14Z" />
      <path d="M5 19 13 11" />
    </>
  ),
  // A wrench.
  "facility-services": (
    <path d="M14.5 4.2a4.5 4.5 0 0 0-4.6 6l-5.6 5.6a1.8 1.8 0 0 0 2.5 2.5l5.6-5.6a4.5 4.5 0 0 0 6-4.6l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z" />
  ),
};

export function ServiceIcon({ slug, className = "" }: { slug: ServiceSlug; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {paths[slug]}
    </svg>
  );
}
