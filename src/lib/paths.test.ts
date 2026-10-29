import { describe, expect, it } from "vitest";
import { safeNextPath } from "./paths";

describe("safeNextPath", () => {
  it("keeps in-app paths and rejects other origins", () => {
    expect(safeNextPath("/app/worker")).toBe("/app/worker");
    expect(safeNextPath("https://evil.example")).toBe("/app");
    expect(safeNextPath("//evil.example")).toBe("/app");
    expect(safeNextPath("/\\evil.example")).toBe("/app");
    expect(safeNextPath(null)).toBe("/app");
  });

  it("rejects paths that browsers turn into another origin", () => {
    expect(safeNextPath("/\t/evil.example")).toBe("/app");
    expect(safeNextPath("/\n/evil.example")).toBe("/app");
    expect(safeNextPath("/\r/evil.example")).toBe("/app");
    expect(safeNextPath(" //evil.example")).toBe("/app");
    expect(safeNextPath("/app/worker?tab=skills")).toBe("/app/worker?tab=skills");
  });
});
