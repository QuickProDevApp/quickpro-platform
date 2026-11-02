import { describe, expect, it } from "vitest";
import {
  quoteSchema,
  serviceRequestSchema,
  availabilitySchema,
  documentReviewSchema,
  organizationProfileSchema,
  reviewDecisionSchema,
  signUpSchema,
  workerProfileSchema,
} from "./schemas";
import { formatDate, formatTime } from "./labels";

describe("organizationProfileSchema", () => {
  it("normalizes blanks to null and websites to https", () => {
    const parsed = organizationProfileSchema.parse({
      name: "  Bayshore Clean Co ",
      legalName: "",
      description: "",
      phone: "(631) 555-0100",
      email: "OPS@Example.com",
      website: "bayshoreclean.com",
      addressLine1: "",
      city: "",
      postalCode: "11706",
      yearsInBusiness: "8",
      crewSize: "",
    });
    expect(parsed).toMatchObject({
      name: "Bayshore Clean Co",
      legalName: null,
      email: "ops@example.com",
      website: "https://bayshoreclean.com",
      postalCode: "11706",
      yearsInBusiness: 8,
      crewSize: null,
    });
  });

  it("reports invalid ZIP codes and counts", () => {
    const result = organizationProfileSchema.safeParse({ name: "Ok Co", postalCode: "1170", crewSize: "0" });
    expect(result.success).toBe(false);
    const fields = result.error!.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["postalCode", "crewSize"]));
  });
});

describe("workerProfileSchema", () => {
  it("converts dollars to cents", () => {
    const parsed = workerProfileSchema.parse({
      headline: "Pressure washing",
      homeServiceAreaId: "",
      maxTravelMiles: "25",
      hasVehicle: true,
      hasDriversLicense: false,
      yearsExperience: "",
      desiredHourlyRate: "$24.50",
    });
    expect(parsed.desiredHourlyRate).toBe(2450);
    expect(parsed.homeServiceAreaId).toBeNull();
    expect(parsed.maxTravelMiles).toBe(25);
  });
});

describe("availabilitySchema", () => {
  it("requires the end after the start", () => {
    expect(availabilitySchema.safeParse({ weekday: "1", startTime: "18:00", endTime: "23:00" }).success).toBe(true);
    expect(availabilitySchema.safeParse({ weekday: "1", startTime: "18:00", endTime: "09:00" }).success).toBe(false);
    expect(availabilitySchema.safeParse({ weekday: "7", startTime: "08:00", endTime: "09:00" }).success).toBe(false);
  });
});

describe("review decisions", () => {
  it("require notes unless approving", () => {
    expect(reviewDecisionSchema.safeParse({ decision: "approved" }).success).toBe(true);
    expect(reviewDecisionSchema.safeParse({ decision: "rejected", notes: " " }).success).toBe(false);
    expect(documentReviewSchema.safeParse({ decision: "rejected", notes: "Expired" }).success).toBe(true);
  });
});

describe("signUpSchema", () => {
  it("enforces a minimum password length", () => {
    expect(signUpSchema.safeParse({ fullName: "Ann Lee", email: "a@b.co", password: "short" }).success).toBe(false);
  });
});

describe("formatting", () => {
  it("formats times and calendar dates without shifting days", () => {
    expect(formatTime("18:30:00")).toBe("6:30 PM");
    expect(formatTime("00:15")).toBe("12:15 AM");
    expect(formatDate("2027-06-30")).toBe("Jun 30, 2027");
  });
});

describe("service request and quote forms", () => {
  const base = {
    title: "Nightly cleaning",
    description: "Three floors, five nights a week.",
    categoryId: "6f1c1d0e-8a37-4f43-9c4a-0f6a4e0b7c11",
    serviceAreaId: "6f1c1d0e-8a37-4f43-9c4a-0f6a4e0b7c12",
    preferredStart: "2026-12-01",
    preferredEnd: "",
    budgetMin: "",
    budgetMax: "$4,000",
    addressLine1: "200 Carleton Ave",
    city: "Central Islip",
    postalCode: "11722",
    contactName: "Pat Manager",
    contactPhone: "631-555-0199",
  };

  it("reads dollar amounts with symbols and commas, and blanks as not set", () => {
    const parsed = serviceRequestSchema.parse(base);
    expect(parsed).toMatchObject({ budgetMin: null, budgetMax: 400000, preferredEnd: null });
  });

  it("rejects an end before the start and a budget range that runs backwards", () => {
    const result = serviceRequestSchema.safeParse({ ...base, preferredEnd: "2026-11-30", budgetMin: "5000" });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["preferredEnd", "budgetMax"]));
  });

  it("requires a quote price", () => {
    expect(quoteSchema.safeParse({ amount: "", scope: "All three floors nightly.", validUntil: "2026-12-01" }).success).toBe(false);
    expect(quoteSchema.parse({ amount: "3,200.50", scope: "All three floors nightly.", validUntil: "2026-12-01" }).amount).toBe(320050);
  });
});
