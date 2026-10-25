import { describe, expect, it } from "vitest";
import {
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
