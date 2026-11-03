import { describe, expect, it } from "vitest";
import { formatHours, grossCents, localInputValue, minutesBetween } from "./timesheets";

describe("timesheet helpers", () => {
  it("formats New York wall-clock values for the form, across daylight saving", () => {
    expect(localInputValue(new Date("2026-07-04T11:05:00Z"))).toBe("2026-07-04T07:05");
    expect(localInputValue(new Date("2026-12-05T12:00:00Z"))).toBe("2026-12-05T07:00");
    expect(localInputValue(new Date("2026-12-06T04:30:00Z"))).toBe("2026-12-05T23:30");
  });

  it("counts minutes, hours and gross pay", () => {
    expect(minutesBetween(new Date("2026-12-05T12:00:00Z"), new Date("2026-12-05T20:05:00Z"))).toBe(485);
    expect(formatHours(450)).toBe("7.5 h");
    expect(formatHours(480)).toBe("8 h");
    expect(formatHours(485)).toBe("8.08 h");
    expect(grossCents(450, 2400)).toBe(18000);
    expect(grossCents(485, 2450)).toBe(19804);
  });
});
