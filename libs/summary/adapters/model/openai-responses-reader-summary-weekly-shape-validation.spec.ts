import {
  assertFiniteDenseJson,
  exactStringArray,
  hasExactKeys,
} from "./openai-responses-reader-summary-weekly-shape-validation";
import {
  normalizeExpandedLegacySectionKind,
  normalizeExpandedLegacyStoryStatus,
  normalizeLegacySectionKind,
  normalizeLegacyStoryStatus,
} from "./openai-responses-reader-summary-weekly-legacy-compatibility";
import {
  assertFiniteDenseJson as legacyAssertFiniteDenseJson,
  exactStringArray as legacyExactStringArray,
  hasExactKeys as legacyHasExactKeys,
} from "./openai-responses-reader-summary-weekly-response-shapes";

describe("weekly strict wire admission and legacy normalization owners", () => {
  it("preserves the legacy export identities", () => {
    expect(legacyAssertFiniteDenseJson).toBe(assertFiniteDenseJson);
    expect(legacyExactStringArray).toBe(exactStringArray);
    expect(legacyHasExactKeys).toBe(hasExactKeys);
  });

  it("enforces exact own-key JSON objects and unique string arrays", () => {
    expect(hasExactKeys({ sealId: "s" }, ["sealId"] as const)).toBe(true);
    expect(hasExactKeys({ sealId: "s", injected: true }, ["sealId"] as const)).toBe(false);
    expect(hasExactKeys(["s"], ["0"] as const)).toBe(false);
    expect(exactStringArray(["c1", "c2"], "citations")).toEqual(["c1", "c2"]);
    expect(() => exactStringArray(["c1", "c1"], "citations"))
      .toThrow("citations must be non-empty and unique");
    expect(() => exactStringArray(["c1", 2], "citations"))
      .toThrow("citations must contain only strings");
  });

  it("fails closed on non-finite numbers, cycles, sparse arrays and non-JSON values", () => {
    expect(() => assertFiniteDenseJson({ usage: Number.POSITIVE_INFINITY }, "output", new Set()))
      .toThrow("output.usage contains a non-finite number");
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => assertFiniteDenseJson(cyclic, "output", new Set()))
      .toThrow("output.self contains a circular reference");
    const sparse: unknown[] = new Array(2);
    sparse[0] = "value";
    expect(() => assertFiniteDenseJson(sparse, "output", new Set()))
      .toThrow("output contains a non-dense array");
    expect(() => assertFiniteDenseJson({ fn: () => true }, "output", new Set()))
      .toThrow("output.fn contains a non-JSON value");
    expect(() => assertFiniteDenseJson({ shared: ["ok"] }, "output", new Set()))
      .not.toThrow();
  });

  it("maintains legacy discriminant aliases without coercing other values", () => {
    expect(normalizeExpandedLegacyStoryStatus("snapshot")).toBe("new");
    expect(normalizeExpandedLegacySectionKind("story")).toBe("development");
    expect(normalizeLegacySectionKind("supporting")).toBe("development");
    expect(normalizeLegacySectionKind("context")).toBe("development");
    expect(normalizeLegacySectionKind("risk")).toBe("watch");
    expect(normalizeLegacyStoryStatus("open")).toBe("watch");
    expect(normalizeLegacySectionKind("unexpected")).toBe("unexpected");
  });
});
