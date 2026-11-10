import { normalizeStringArrayLike } from "./openai-responses-reader-summary-json";

describe("reader-summary raw string array policy", () => {
  it("preserves strict array validation for both story and draft normalizers", () => {
    expect(normalizeStringArrayLike([" one ", "two"], "synthetic labels"))
      .toEqual(["one", "two"]);
    expect(() => normalizeStringArrayLike(["one", null], "synthetic labels"))
      .toThrow("synthetic labels must be a non-empty string");
  });

  it("normalizes comma-separated scalars and empty values identically", () => {
    expect(normalizeStringArrayLike("c1, c2, c1, ", "synthetic citations"))
      .toEqual(["c1", "c2"]);
    expect(normalizeStringArrayLike(undefined, "synthetic citations")).toEqual([]);
    expect(normalizeStringArrayLike(42, "synthetic citations")).toEqual([]);
  });
});
