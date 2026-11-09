import {
  normalizeExpandedLegacyStoryStatus,
  normalizeExpandedLegacySectionKind,
  normalizeLegacySectionKind,
  normalizeLegacyStoryStatus,
} from "./openai-responses-reader-summary-weekly-legacy-compatibility";
import {
  hasExactKeys,
  exactStringArray,
  assertFiniteDenseJson,
} from "./openai-responses-reader-summary-weekly-shape-validation";
import {
  assertFiniteDenseJson as historicAssertFiniteDenseJson,
  hasExactKeys as historicHasExactKeys,
} from "./openai-responses-reader-summary-weekly-response-shapes";

describe("weekly response strict JSON validation boundary", () => {
  it("recognizes exact fields, but rejects extras, missing fields and non-records", () => {
    const expected = ["a", "b"] as const;
    expect(hasExactKeys({ a: 1, b: null }, expected)).toBe(true);
    expect(hasExactKeys({ a: 1, b: null, c: 2 }, expected)).toBe(false);
    expect(hasExactKeys({ a: 1 }, expected)).toBe(false);
    expect(hasExactKeys([1, 2], expected)).toBe(false);
    expect(hasExactKeys(null, expected)).toBe(false);
    expect(historicHasExactKeys({ a: 1, b: 2 }, expected)).toBe(true);
  });

  it("accepts only nonempty duplicate-free string arrays", () => {
    expect(exactStringArray(["one", "two"], "ids")).toEqual(["one", "two"]);
    expect(() => exactStringArray([], "ids")).toThrow("ids must be non-empty and unique");
    expect(() => exactStringArray(["x", "x"], "ids")).toThrow("ids must be non-empty and unique");
    expect(() => exactStringArray(["x", 42], "ids")).toThrow("ids must contain only strings");
  });

  it("accepts nested finite and dense JSON while releasing the ancestor stack", () => {
    const ancestors = new Set<object>();
    expect(() => assertFiniteDenseJson({ a: [1, null, { b: true }] }, "$", ancestors)).not.toThrow();
    expect(ancestors.size).toBe(0);
    expect(() => historicAssertFiniteDenseJson({ a: 0 }, "$", new Set<object>())).not.toThrow();
  });

  it.each([Number.NaN, Infinity, -Infinity])("rejects a non-finite nested number %s", (value) => {
    expect(() => assertFiniteDenseJson({ a: [value] }, "$", new Set<object>())).toThrow("$.a[0] contains a non-finite number");
  });

  it("rejects non-JSON values and sparse arrays without silently filling holes", () => {
    expect(() => assertFiniteDenseJson({ a: undefined }, "$", new Set<object>())).toThrow("$.a contains a non-JSON value");
    const sparse = new Array<string>(2);
    sparse[0] = "present";
    expect(() => assertFiniteDenseJson(sparse, "$", new Set<object>())).toThrow("$ contains a non-dense array");
  });

  it("rejects cyclic references at the original nested path", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(() => assertFiniteDenseJson(circular, "$", new Set<object>())).toThrow("$.self contains a circular reference");
  });
});

describe("weekly legacy response normalization boundary", () => {
  it("retains exact legacy aliases without changing unknown values", () => {
    expect(normalizeExpandedLegacyStoryStatus("snapshot")).toBe("new");
    expect(normalizeExpandedLegacyStoryStatus("open")).toBe("watch");
    expect(normalizeExpandedLegacyStoryStatus("stable")).toBe("stable");
    expect(normalizeExpandedLegacySectionKind("story")).toBe("development");
    expect(normalizeExpandedLegacySectionKind("risk")).toBe("watch");
    expect(normalizeLegacySectionKind("supporting")).toBe("development");
    expect(normalizeLegacySectionKind("context")).toBe("development");
    expect(normalizeLegacyStoryStatus("open")).toBe("watch");
    expect(normalizeLegacyStoryStatus("resolved")).toBe("resolved");
  });
});
