import { describe, expect, it } from "vitest";
import { diffIds } from "./sets";

describe("diffIds", () => {
  it("returns additions and removals, ignoring duplicates", () => {
    expect(diffIds(["a", "b"], ["b", "c", "c"])).toEqual({ add: ["c"], remove: ["a"] });
    expect(diffIds([], [])).toEqual({ add: [], remove: [] });
  });
});
