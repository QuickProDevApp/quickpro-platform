import { describe, expect, it } from "vitest";
import { addDays, formatDayHeading, marketToday, resolveWeek, weekday } from "./schedule";

describe("schedule weeks", () => {
  it("runs Sunday to Saturday around today", () => {
    const week = resolveWeek(undefined, "2026-11-04"); // a Wednesday
    expect(week).toMatchObject({
      start: "2026-11-01",
      end: "2026-11-07",
      previous: "2026-10-25",
      next: "2026-11-08",
      isCurrent: true,
      label: "Nov 1 – 7, 2026",
    });
    expect(week.days).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
    ]);
  });

  it("snaps any requested day to its week", () => {
    expect(resolveWeek("2026-11-07", "2026-11-04").start).toBe("2026-11-01");
    expect(resolveWeek("2026-11-08", "2026-11-04")).toMatchObject({ start: "2026-11-08", isCurrent: false });
  });

  it("ignores dates that aren't real or are far away", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "next week", "2026-1-5", "2031-01-04"]) {
      expect(resolveWeek(bad, "2026-11-04").start).toBe("2026-11-01");
    }
  });

  it("labels weeks across months and years", () => {
    expect(resolveWeek("2026-12-01", "2026-11-04").label).toBe("Nov 29 – Dec 5, 2026");
    expect(resolveWeek("2026-12-28", "2026-11-04").label).toBe("Dec 27, 2026 – Jan 2, 2027");
  });

  it("does calendar arithmetic across daylight saving changes", () => {
    // Clocks went back on Nov 1, 2026 and go forward on Mar 14, 2027.
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2027-03-13", 2)).toBe("2027-03-15");
    expect(weekday("2026-11-01")).toBe(0);
    expect(formatDayHeading("2026-11-03")).toBe("Tuesday, Nov 3");
  });

  it("uses New York's date, not the server's", () => {
    // 01:30 UTC on Nov 3 is still the evening of Nov 2 in New York.
    expect(marketToday(new Date("2026-11-03T01:30:00Z"))).toBe("2026-11-02");
  });
});
