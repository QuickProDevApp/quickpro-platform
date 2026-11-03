import { describe, expect, it } from "vitest";
import { buildCalendar, escapeText, foldLine } from "./ics";

describe("calendar file", () => {
  it("writes events in UTC with escaped text", () => {
    const ics = buildCalendar(
      "QuickPro shifts",
      [
        {
          uid: "abc@quickpro",
          start: new Date("2026-11-04T12:00:00Z"),
          end: new Date("2026-11-04T20:00:00Z"),
          summary: "Lobby floors, strip; wax",
          location: "200 Carleton Ave, Central Islip 11722",
          description: "Harborline Facility\nIslip",
        },
      ],
      new Date("2026-11-03T01:00:00Z"),
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261104T120000Z\r\nDTEND:20261104T200000Z\r\n");
    expect(ics).toContain("DTSTAMP:20261103T010000Z");
    expect(ics).toContain("SUMMARY:Lobby floors\\, strip\; wax");
    expect(ics).toContain("DESCRIPTION:Harborline Facility\\nIslip");
    expect(ics.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes backslashes first", () => {
    expect(escapeText("a\\b,c")).toBe("a\\\\b\\,c");
  });

  it("folds long lines at 75 octets without splitting characters", () => {
    const folded = foldLine(`SUMMARY:${"é".repeat(60)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(lines.slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(lines.map((l, i) => (i ? l.slice(1) : l)).join("")).toBe(`SUMMARY:${"é".repeat(60)}`);
  });
});
