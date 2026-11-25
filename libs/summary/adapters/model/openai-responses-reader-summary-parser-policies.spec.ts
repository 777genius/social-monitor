import {
  requiredString as legacyRequiredString,
  optionalStringArray as legacyOptionalStringArray,
  normalizeSetValue as legacyNormalizeSetValue,
} from "./openai-responses-reader-summary-parsers";
import {
  requiredArray,
  requiredNumber,
  requiredRecord,
  requiredString,
  requiredStringArray,
  normalizeSetValue,
} from "./openai-responses-reader-summary-required-values";
import {
  nonNegativeNumberOrFallback,
  optionalArray,
  optionalString,
  optionalStringArray,
} from "./openai-responses-reader-summary-optional-values";

describe("OpenAI reader summary required vs optional provider value boundaries", () => {
  it("keeps the legacy export identities for direct callers", () => {
    expect(legacyRequiredString).toBe(requiredString);
    expect(legacyOptionalStringArray).toBe(optionalStringArray);
    expect(legacyNormalizeSetValue).toBe(normalizeSetValue);
  });

  it("rejects malformed required provider values rather than applying display fallbacks", () => {
    expect(requiredString("  news  ", "title")).toBe("news");
    expect(() => requiredString("  ", "title")).toThrow("title must be a non-empty string");
    expect(() => requiredString(12, "title")).toThrow("title must be a non-empty string");
    expect(() => requiredNumber(Number.NaN, "score")).toThrow("score must be a finite number");
    expect(() => requiredArray("not array", "claims")).toThrow("claims must be an array");
    expect(() => requiredRecord(null, "body")).toThrow("body must be an object");
    expect(() => requiredRecord([], "body")).toThrow("body must be an object");
    expect(() => requiredStringArray(["ok", ""], "claims")).toThrow("claims must be a non-empty string");
  });

  it("preserves strict enum admission while allowing an explicitly absent optional enum", () => {
    const allowed = new Set(["known", "other"] as const);
    expect(normalizeSetValue("known", allowed, "category")).toBe("known");
    expect(normalizeSetValue(undefined, allowed, "category")).toBeUndefined();
    expect(normalizeSetValue("", allowed, "category")).toBeUndefined();
    expect(() => normalizeSetValue("unknown", allowed, "category")).toThrow("Unsupported category");
    expect(() => normalizeSetValue(1, allowed, "category")).toThrow("Unsupported category");
  });

  it("keeps optional presentation normalization intentionally lossy", () => {
    expect(optionalString("  display  ")).toBe("display");
    expect(optionalString(123)).toBeUndefined();
    expect(optionalArray("missing")).toEqual([]);
    expect(optionalStringArray(["  one  ", null, 3, "", "two"])).toEqual(["one", "two"]);
    expect(nonNegativeNumberOrFallback(Number.NaN, 7)).toBe(7);
    expect(nonNegativeNumberOrFallback(-1, 7)).toBe(7);
    expect(nonNegativeNumberOrFallback(0, 7)).toBe(0);
  });
});
