import { afterAll, describe, expect, it, vi } from "vitest";
import {
  approvedCustomer,
  areaId,
  asUser,
  categoryId,
  createAdmin,
  createApprovedContractor,
  createApprovedWorker,
  createUser,
  moveJob,
  nassauId,
  postJob,
  postRequest,
  sql,
  submitQuote,
  suffolkId,
} from "./helpers";

// The staff analytics data layer, run against the test database. Other test
// files leave rows behind, so these tests compare before and after.
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", async () => {
  const helpers = await import("./helpers");
  return { withUser: helpers.asUser };
});

const { getMarketAnalytics } = await import("@/server/data/analytics");

afterAll(() => sql.end());

const offerAndAccept = async (owner: string, worker: string, jobId: string) => {
  await asUser(worker, (tx) => tx`select public.apply_to_job(${jobId}, '')`);
  const [{ id }] = await asUser(owner, (tx) => tx<{ id: string }[]>`select public.offer_job(${jobId}, ${worker}) as id`);
  await asUser(worker, (tx) => tx`select public.respond_to_offer(${id}, true)`);
  return id;
};

describe("market analytics", () => {
  it("counts projects, shifts, invoices, disputes and coverage gaps from the live tables", async () => {
    const admin = await createAdmin();
    const suffolk = await suffolkId();
    const landscaping = await categoryId("landscaping");
    const shelterIsland = await areaId("shelter-island");
    const read = (o: { days?: 7 | 30 | 90 | 365; category?: string; market?: string } = {}) =>
      getMarketAnalytics(admin, { days: o.days ?? 30, marketId: o.market ?? suffolk, categoryId: o.category ?? null });

    const before = await read();
    const beforeLandscaping = await read({ category: landscaping });
    const beforeNassau = await read({ market: await nassauId() });

    // A project quoted, awarded and invoiced in Islip, where the contractor works.
    const customer = await approvedCustomer(admin);
    const owner = await createUser("Marcus Bell");
    const contractorId = await createApprovedContractor(owner, admin, "Harborline Facility Services");
    const awarded = await postRequest(customer.owner, customer.orgId);
    const quote = await submitQuote(owner, awarded, contractorId, 320000);
    await asUser(customer.owner, (tx) => tx`select public.accept_quote(${quote})`);
    const [{ id: invoiceId }] = await asUser(owner, (tx) => tx<{ id: string }[]>`select public.create_invoice('project', ${awarded}) as id`);
    await asUser(owner, (tx) => tx`select public.issue_invoice(${invoiceId})`);
    await asUser(customer.owner, (tx) => tx`
      select public.open_dispute('project', ${awarded}, 'quality', 'The third-floor carpets were missed two nights running.', 'A return visit.')
    `);

    // Landscaping on Shelter Island, which no approved contractor covers.
    await postRequest(customer.owner, customer.orgId, { category: "landscaping", area: "shelter-island" });

    // Two shifts on Shelter Island: one half staffed and under way, one fully staffed and over.
    const worker = await createUser("Wendy Worker");
    await createApprovedWorker(worker, admin);
    const halfStaffed = await postJob(owner, contractorId, { area: "shelter-island", headcount: 2, startsInHours: 48 });
    const booking = await offerAndAccept(owner, worker, halfStaffed);
    const fullyStaffed = await postJob(owner, contractorId, { area: "shelter-island", headcount: 1, startsInHours: 96 });
    await offerAndAccept(owner, worker, fullyStaffed);
    await moveJob(halfStaffed, -60);
    await asUser(worker, (tx) => tx`select public.check_in(${booking})`);
    await moveJob(fullyStaffed, -600);
    // A job that hasn't started yet doesn't count toward the fill rate.
    await postJob(owner, contractorId, { area: "shelter-island", headcount: 5, startsInHours: 200 });

    const after = await read();
    const delta = <T extends Record<string, unknown>>(a: T, b: T, keys: (keyof T)[]) =>
      Object.fromEntries(keys.map((k) => [k, Number(a[k]) - Number(b[k])]));

    expect(delta(after.projects, before.projects, ["posted", "quoted", "awarded", "awarded_cents", "awarded_of_posted"])).toEqual({
      posted: 2,
      quoted: 1,
      awarded: 1,
      awarded_cents: 320000,
      awarded_of_posted: 1,
    });
    expect(after.projects.median_hours_to_quote).not.toBeNull();
    expect(delta(after.shifts, before.shifts, ["jobs", "positions", "filled", "fully_staffed", "ended_bookings", "checked_in"])).toEqual({
      jobs: 2,
      positions: 3,
      filled: 2,
      fully_staffed: 1,
      ended_bookings: 1,
      checked_in: 0,
    });
    expect(after.shifts.median_hours_to_fill).not.toBeNull();
    expect(delta(after.money, before.money, ["invoiced_count", "invoiced_cents", "outstanding_cents", "paid_cents"])).toEqual({
      invoiced_count: 1,
      invoiced_cents: 320000,
      outstanding_cents: 320000,
      paid_cents: 0,
    });
    expect(delta(after.trust, before.trust, ["disputes_opened", "disputes_open_now"])).toEqual({ disputes_opened: 1, disputes_open_now: 1 });
    expect(after.supply.approved_contractors - before.supply.approved_contractors).toBe(1);
    expect(after.supply.approved_customers - before.supply.approved_customers).toBe(1);
    expect(after.supply.approved_workers - before.supply.approved_workers).toBe(1);

    // The town and category breakdowns.
    const town = (m: typeof after) => m.areas.find((a) => a.id === shelterIsland)!;
    expect(delta(town(after), town(before), ["requests", "positions", "filled", "contractors"])).toEqual({
      requests: 1,
      positions: 3,
      filled: 2,
      contractors: 0,
    });
    const category = (m: typeof after, slug: string) => m.categories.find((c) => c.slug === slug)!;
    expect(category(after, "commercial-cleaning").awarded_cents - category(before, "commercial-cleaning").awarded_cents).toBe(320000);
    expect(category(after, "landscaping").requests - category(before, "landscaping").requests).toBe(1);

    // The gap: customers asked for landscaping on Shelter Island and nobody covers it.
    const gap = (m: typeof after) => m.gaps.find((g) => g.area_id === shelterIsland && g.category_id === landscaping);
    expect(gap(after)!.requests - (gap(before)?.requests ?? 0)).toBe(1);
    expect(gap(after)!.unquoted).toBeGreaterThanOrEqual(1);

    // The trend adds up to the same activity.
    const total = (m: typeof after, k: "requests" | "positions" | "filled") => m.trend.reduce((s, b) => s + b[k], 0);
    expect(total(after, "requests") - total(before, "requests")).toBe(2);
    expect(total(after, "positions") - total(before, "positions")).toBe(3);
    expect(total(after, "filled") - total(before, "filled")).toBe(2);
    expect(after.bucket).toBe("week");
    expect(after.trend.at(-1)!.starts).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Narrowed to landscaping, only the Shelter Island request counts.
    const landscapingAfter = await read({ category: landscaping });
    expect(landscapingAfter.projects.posted - beforeLandscaping.projects.posted).toBe(1);
    expect(landscapingAfter.money.invoiced_cents - beforeLandscaping.money.invoiced_cents).toBe(0);

    // Nothing leaks into another market.
    const nassau = await read({ market: await nassauId() });
    expect(nassau.projects.posted).toBe(beforeNassau.projects.posted);
    expect(nassau.shifts.positions).toBe(beforeNassau.shifts.positions);
  });

  it("is for staff only and supports a year by month", async () => {
    const admin = await createAdmin();
    const suffolk = await suffolkId();
    const year = await getMarketAnalytics(admin, { days: 365, marketId: suffolk });
    expect(year.bucket).toBe("month");
    expect(year.trend.length).toBeGreaterThanOrEqual(12);

    const someone = await createUser("Not Staff");
    await expect(getMarketAnalytics(someone, { days: 30, marketId: suffolk })).rejects.toThrow(/Not found/);
    await expect(getMarketAnalytics(admin, { days: 31 as never, marketId: suffolk })).rejects.toThrow(/Unsupported period/);
  });
});
