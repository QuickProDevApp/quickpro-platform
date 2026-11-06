/**
 * Sample records for the presentation preview (D-047). None of this is real:
 * every business, person and project is invented, each description says so,
 * and the preview never reads or writes a database. Dates are relative to
 * the moment the page renders, so the screens always look current.
 */
import { SERVICES, TOWNS } from "@/lib/catalog";
import type { InvoiceRow } from "@/server/data/invoices";
import type { Job } from "@/server/data/jobs";
import type { PublicContractorDetail, PublicReview } from "@/server/data/public-profiles";
import type { ServiceRequest } from "@/server/data/requests";

export const SAMPLE_NOTE = "Sample business for the QuickPro presentation.";

const service = (slug: string) => SERVICES.find((s) => s.slug === slug)!.name;
const town = (slug: string) => TOWNS.find((t) => t.slug === slug)!.name;

type SampleContractor = Omit<PublicContractorDetail, "rating_avg" | "rating_count"> & {
  serviceSlugs: string[];
  townSlugs: string[];
  reviews: PublicReview[];
};

function contractor(c: {
  slug: string;
  name: string;
  about: string;
  city: string;
  years: number;
  crew: number;
  services: string[];
  towns: string[];
  projects: number;
  since: string;
  reviews?: (Omit<PublicReview, "reply"> & { reply?: string })[];
}): SampleContractor {
  return {
    slug: c.slug,
    name: c.name,
    description: `${c.about} ${SAMPLE_NOTE}`,
    city: c.city,
    market_name: "Suffolk County",
    years_in_business: c.years,
    crew_size: c.crew,
    services: c.services.map(service),
    areas: c.towns.map(town),
    serviceSlugs: c.services,
    townSlugs: c.towns,
    insurance_reviewed: true,
    on_quickpro_since: c.since,
    completed_projects: c.projects,
    reviews: (c.reviews ?? []).map((r) => ({ reply: null, ...r })),
  };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const CONTRACTORS: SampleContractor[] = [
  contractor({
    slug: "bayview-build-co",
    name: "Bayview Build Co.",
    about: "General contractor for commercial interiors, tenant fit-outs and building refreshes, with its own carpentry and paint crews.",
    city: "Bay Shore",
    years: 14,
    crew: 22,
    services: ["general-construction", "carpentry", "painting-drywall"],
    towns: ["babylon", "brookhaven", "islip"],
    projects: 3,
    since: "2026-09-01",
    reviews: [
      { rating: 5, reviewer: "Property manager", area_name: "Islip", reviewed_on: daysAgo(6), body: "Both stairwells done over one weekend with no disruption to tenants. Clean site every morning and the rails look great." },
      { rating: 5, reviewer: "Office manager", area_name: "Babylon", reviewed_on: daysAgo(24), body: "Suite fit-out finished on schedule. Daily photo updates meant we never had to chase anyone.", reply: "Thank you. It was a pleasure working with your team." },
      { rating: 4, reviewer: "Facilities lead", area_name: "Brookhaven", reviewed_on: daysAgo(41), body: "Good partition and paint work. One delivery slipped a day, but they called ahead and made it up." },
    ],
  }),
  contractor({
    slug: "north-shore-interiors",
    name: "North Shore Interiors",
    about: "Interior carpentry, millwork and finishes for offices, clinics and retail.",
    city: "Huntington",
    years: 9,
    crew: 11,
    services: ["carpentry", "painting-drywall"],
    towns: ["huntington", "smithtown", "islip"],
    projects: 2,
    since: "2026-09-01",
    reviews: [
      { rating: 5, reviewer: "Property manager", area_name: "Islip", reviewed_on: daysAgo(9), body: "Beautiful millwork, finished two days early, and the punch list was handled the same afternoon." },
      { rating: 5, reviewer: "Practice manager", area_name: "Huntington", reviewed_on: daysAgo(33), body: "Reception and two exam rooms trimmed out after hours so we never closed." },
    ],
  }),
  contractor({
    slug: "coastline-contracting",
    name: "Coastline Contracting",
    about: "Framing, selective demolition and general construction for small commercial jobs.",
    city: "Babylon",
    years: 6,
    crew: 8,
    services: ["general-construction", "carpentry"],
    towns: ["babylon", "islip"],
    projects: 1,
    since: "2026-10-01",
    reviews: [
      { rating: 4, reviewer: "Property manager", area_name: "Islip", reviewed_on: daysAgo(12), body: "Fast and careful demolition. One extra day for haul-away, but they told us early." },
    ],
  }),
  contractor({
    slug: "ridgeline-drywall-paint",
    name: "Ridgeline Drywall & Paint",
    about: "Drywall hanging, taping and finishing, and commercial painting.",
    city: "Patchogue",
    years: 11,
    crew: 15,
    services: ["painting-drywall"],
    towns: ["brookhaven", "islip"],
    projects: 0,
    since: "2026-10-01",
  }),
  contractor({
    slug: "great-south-bay-floors",
    name: "Great South Bay Floors",
    about: "Floor prep, LVT, carpet tile and polished concrete for offices and retail.",
    city: "Sayville",
    years: 12,
    crew: 9,
    services: ["flooring"],
    towns: ["islip", "brookhaven", "babylon"],
    projects: 2,
    since: "2026-09-01",
    reviews: [
      { rating: 5, reviewer: "Store manager", area_name: "Brookhaven", reviewed_on: daysAgo(15), body: "New LVT across the sales floor in two overnight shifts. Opened on time both mornings." },
      { rating: 5, reviewer: "Office manager", area_name: "Islip", reviewed_on: daysAgo(48), body: "Leveled a rough slab and laid carpet tile over a weekend. Very tidy crew." },
    ],
  }),
  contractor({
    slug: "harborlight-facility-services",
    name: "Harborlight Facility Services",
    about: "Nightly janitorial, post-construction cleaning and porter services for offices and medical buildings.",
    city: "Hauppauge",
    years: 8,
    crew: 34,
    services: ["commercial-cleaning", "facility-services", "pressure-washing"],
    towns: ["smithtown", "islip", "huntington", "brookhaven"],
    projects: 4,
    since: "2026-08-01",
    reviews: [
      { rating: 5, reviewer: "Facilities lead", area_name: "Smithtown", reviewed_on: daysAgo(4), body: "Post-construction clean of three floors, done overnight and inspection-ready by 7 AM." },
      { rating: 4, reviewer: "Property manager", area_name: "Islip", reviewed_on: daysAgo(27), body: "Reliable nightly crew. Took a week to settle the trash schedule, then flawless." },
    ],
  }),
  contractor({
    slug: "east-end-grounds",
    name: "East End Grounds",
    about: "Commercial grounds maintenance, seasonal cleanups and snow removal.",
    city: "Riverhead",
    years: 17,
    crew: 19,
    services: ["landscaping", "pressure-washing"],
    towns: ["riverhead", "southampton", "brookhaven"],
    projects: 1,
    since: "2026-10-01",
    reviews: [
      { rating: 5, reviewer: "Property manager", area_name: "Riverhead", reviewed_on: daysAgo(19), body: "Fall cleanup of the whole office park in two days, and the walkways were washed too." },
    ],
  }),
  contractor({
    slug: "suffolk-masonry-works",
    name: "Suffolk Masonry Works",
    about: "Concrete flatwork, curbs, sidewalks and block repair.",
    city: "Medford",
    years: 21,
    crew: 12,
    services: ["masonry-concrete"],
    towns: ["brookhaven", "islip", "smithtown"],
    projects: 0,
    since: "2026-10-01",
  }),
];

function withRating(c: SampleContractor): PublicContractorDetail {
  const count = c.reviews.length;
  const avg = count ? c.reviews.reduce((n, r) => n + r.rating, 0) / count : null;
  return { ...c, rating_avg: avg === null ? null : avg.toFixed(2), rating_count: count };
}

export const sampleFilters = {
  categories: SERVICES.map((s) => ({ slug: s.slug, name: s.name })),
  areas: TOWNS.map((t) => ({ slug: t.slug, name: t.name })),
};

export function sampleContractors(filter: { category?: string; town?: string }) {
  return CONTRACTORS.filter(
    (c) => (!filter.category || c.serviceSlugs.includes(filter.category)) && (!filter.town || c.townSlugs.includes(filter.town)),
  ).map(withRating);
}

export function sampleContractor(slug: string) {
  const c = CONTRACTORS.find((x) => x.slug === slug);
  return c ? { contractor: withRating(c), reviews: c.reviews } : null;
}

// Dashboard records. Only the fields the panels read matter; the rest are
// filled so the objects match the app's types.

const at = (days: number, hour: number, minutes = 0) => {
  const d = new Date();
  d.setUTCHours(hour + 5, minutes, 0, 0); // roughly New York time
  return new Date(d.getTime() + days * 86_400_000);
};

function job(j: Partial<Job> & Pick<Job, "id" | "title" | "starts_at" | "ends_at" | "headcount" | "accepted_count">): Job {
  return {
    organization_id: "sample-bayview",
    organization_name: "Bayview Build Co.",
    description: "",
    category_id: "",
    category_name: "",
    service_area_id: "",
    area_name: "Islip",
    pay_rate_cents: 3600,
    engagement_type_id: "",
    engagement_name: "Employee of the contractor",
    engagement_description: "",
    status: "open",
    cancel_reason: null,
    completed_at: null,
    created_at: new Date(),
    service_request_id: null,
    project_title: null,
    skill_ids: [],
    skill_names: [],
    offered_count: 0,
    applicant_count: 0,
    local_date: "",
    local_start: "",
    local_end: "",
    ...j,
  };
}

export function sampleJobs(): Job[] {
  return [
    job({ id: "j1", title: "Lobby demolition and floor protection", starts_at: at(1, 7), ends_at: at(1, 15, 30), headcount: 2, accepted_count: 2, status: "filled", pay_rate_cents: 3400 }),
    job({ id: "j2", title: "Trim and door hardware install", starts_at: at(2, 7), ends_at: at(2, 15), headcount: 2, accepted_count: 1, applicant_count: 2, pay_rate_cents: 3800 }),
    job({ id: "j3", title: "Suite 210 framing", starts_at: at(4, 7), ends_at: at(4, 15, 30), headcount: 3, accepted_count: 1, offered_count: 1, area_name: "Babylon", pay_rate_cents: 3600 }),
    job({ id: "j4", title: "Drywall hang, Suite 210", starts_at: at(6, 7), ends_at: at(6, 15, 30), headcount: 2, accepted_count: 0, area_name: "Babylon", pay_rate_cents: 3500 }),
  ];
}

function request(r: Partial<ServiceRequest> & Pick<ServiceRequest, "id" | "title" | "status">): ServiceRequest {
  return {
    organization_id: "sample-harbor-point",
    customer_name: "Harbor Point Properties",
    description: "",
    requirements: "",
    category_id: "",
    category_name: "",
    service_area_id: "",
    area_name: "Islip",
    preferred_start: daysAgo(-3),
    preferred_end: daysAgo(-10),
    budget_min_cents: null,
    budget_max_cents: null,
    awarded_quote_id: null,
    awarded_at: null,
    completed_at: null,
    cancelled_at: null,
    cancel_reason: null,
    created_at: new Date(),
    work_completed_at: null,
    completion_note: null,
    awarded_contractor_id: null,
    awarded_contractor_name: null,
    awarded_amount_cents: null,
    project_job_count: 0,
    quote_count: 0,
    lowest_quote_cents: null,
    ...r,
  };
}

/** Bayview's awarded projects. */
export function sampleContractorProjects(): ServiceRequest[] {
  return [
    request({ id: "r1", title: "Lobby refresh, Building A", status: "awarded", awarded_contractor_name: "Bayview Build Co.", awarded_amount_cents: 1_840_000, project_job_count: 3 }),
    request({ id: "r2", title: "Suite 210 tenant fit-out", status: "awarded", customer_name: "Meridian Office Partners", awarded_contractor_name: "Bayview Build Co.", awarded_amount_cents: 6_250_000, project_job_count: 2, area_name: "Babylon" }),
  ];
}

/** Harbor Point's active requests. */
export function sampleCustomerRequests(): ServiceRequest[] {
  return [
    request({ id: "c1", title: "Parking garage pressure wash", status: "open", quote_count: 3, lowest_quote_cents: 380_000, preferred_start: daysAgo(-5), preferred_end: daysAgo(-6) }),
    request({ id: "c2", title: "Nightly cleaning, Building C", status: "open", quote_count: 2, lowest_quote_cents: 920_000, preferred_start: daysAgo(-14), preferred_end: null }),
    request({ id: "c3", title: "Lobby refresh, Building A", status: "awarded", awarded_contractor_name: "Bayview Build Co.", project_job_count: 3 }),
    request({ id: "c4", title: "Conference room carpet tile", status: "open", quote_count: 0, preferred_start: daysAgo(-9), preferred_end: daysAgo(-10) }),
  ];
}

export function sampleInvoicesToPay(): InvoiceRow[] {
  return [
    {
      id: "i1",
      context: "project",
      request_id: "c5",
      subcontract_id: null,
      title: "Stairwell repaint, Building B",
      issuer_org_id: "sample-bayview",
      issuer_name: "Bayview Build Co.",
      recipient_org_id: "sample-harbor-point",
      recipient_name: "Harbor Point Properties",
      number: "INV-0001",
      status: "issued",
      overdue: false,
      issue_date: daysAgo(3),
      due_date: daysAgo(-27),
      subtotal_cents: "780000",
      tax_cents: "0",
      total_cents: "780000",
      paid_on: null,
      created_at: new Date(),
    },
  ];
}

/** A worker's next shifts (Ana, a finish carpenter). */
export function sampleWorkerShifts() {
  return [
    { id: "w1", title: "Trim and door hardware install", org: "Bayview Build Co.", area: "Islip", starts_at: at(2, 7), ends_at: at(2, 15), rate: 3800, offer: false },
    { id: "w2", title: "Reception desk install", org: "North Shore Interiors", area: "Huntington", starts_at: at(3, 8), ends_at: at(3, 16), rate: 4000, offer: true },
    { id: "w3", title: "Suite 210 framing", org: "Bayview Build Co.", area: "Babylon", starts_at: at(4, 7), ends_at: at(4, 15, 30), rate: 3600, offer: false },
  ];
}
