import {
  asRecord,
  normalizeSetValue,
  numberOrFallback,
  requiredArray,
  requiredOptionalStringArray,
  requiredRecord,
  requiredString,
} from "./openai-responses-reader-summary-raw-values";
import {
  firstNonEmptyString,
  knownStringSubset,
  normalizeStringArrayLike,
  uniqueNonEmptyStrings,
} from "./openai-responses-reader-summary-text-values";
import * as publicJson from "./openai-responses-reader-summary-json";

describe("reader summary raw-value and presentation boundaries", () => {
  it("rejects missing and malformed required provider values without coercion", () => {
    expect(asRecord([])).toBeNull();
    expect(asRecord(Object.create(null))).not.toBeNull();
    expect(() => requiredRecord([], "provider draft")).toThrow("provider draft must be an object");
    expect(() => requiredArray("not-array", "citations")).toThrow("citations must be an array");
    expect(() => requiredString({ toString: () => "fake" }, "headline"))
      .toThrow("headline must be a non-empty string");
    expect(() => requiredString("  ", "headline")).toThrow("headline must be a non-empty string");
  });

  it("keeps optional arrays and enumerated values fail closed", () => {
    expect(requiredOptionalStringArray(null, "citations")).toEqual([]);
    expect(() => requiredOptionalStringArray(["c1", null], "citations"))
      .toThrow("citations must be a non-empty string");
    expect(normalizeSetValue("valid", new Set(["valid"]), "kind")).toBe("valid");
    expect(() => normalizeSetValue("__proto__", new Set(["valid"]), "kind"))
      .toThrow("Unsupported kind");
    expect(numberOrFallback(Number.NaN, 42)).toBe(42);
    expect(numberOrFallback(-1, 42)).toBe(42);
    expect(numberOrFallback(0, 42)).toBe(0);
  });

  it("keeps stable, bounded presentation text without unknown citation IDs", () => {
    const original = [" c1 ", "bad", "c1", "", " c2 "];
    expect(uniqueNonEmptyStrings(original)).toEqual(["c1", "bad", "c2"]);
    expect(knownStringSubset(original, new Set(["c1", "c2"]))).toEqual(["c1", "c2"]);
    expect(original).toEqual([" c1 ", "bad", "c1", "", " c2 "]);
    expect(firstNonEmptyString(undefined, " ", " lead ")).toBe("lead");
    expect(firstNonEmptyString(undefined, " ")).toBe("Review cited source evidence.");
    expect(normalizeStringArrayLike("c1, c2, c1", "citations")).toEqual(["c1", "c2"]);
    expect(() => normalizeStringArrayLike(["c1", false], "citations"))
      .toThrow("citations must be a non-empty string");
  });

  it("preserves the old exported provider JSON contract", () => {
    expect(publicJson.requiredRecord).toBe(requiredRecord);
    expect(publicJson.requiredString).toBe(requiredString);
    expect(publicJson.normalizeSetValue).toBe(normalizeSetValue);
    expect(publicJson.knownStringSubset).toBe(knownStringSubset);
    expect(publicJson.firstNonEmptyString).toBe(firstNonEmptyString);
    expect(publicJson.normalizeStringArrayLike).toBe(normalizeStringArrayLike);
  });
});
