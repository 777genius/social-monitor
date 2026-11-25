import {
  productionDayQualityDateArgs,
  resolveBoundedHistoricalRecovery,
  shouldRunCleanDayE2e,
} from "./reader-summary-production-day-quality-date";

describe("production-day quality date arguments", () => {
  it("allows only quality checkers to inspect a bounded historical regeneration date", () => {
    expect(
      productionDayQualityDateArgs({
        executionMode: "historical-regeneration",
        allowHistorical: false,
      }),
    ).toEqual(["--allow-historical"]);
  });

  it("keeps normal live production date checks strict", () => {
    expect(
      productionDayQualityDateArgs({
        executionMode: "live-production",
        allowHistorical: false,
      }),
    ).toEqual([]);
  });

  it("preserves the explicit historical-reuse inspection contract", () => {
    expect(
      productionDayQualityDateArgs({
        executionMode: "historical-reuse",
        allowHistorical: true,
      }),
    ).toEqual(["--allow-historical"]);
  });
});

describe("bounded historical recovery", () => {
  it("accepts only the exact closed date selected by daily-run", () => {
    expect(resolveBoundedHistoricalRecovery({
      requested: true,
      executionMode: "live-production",
      allowHistorical: true,
      update: true,
      collectionDate: "2026-09-13",
      expectedDate: "2026-09-13",
      today: "2026-09-14",
    })).toBe(true);
  });

  it.each([
    { allowHistorical: false, update: true, expectedDate: "2026-09-13" },
    { allowHistorical: true, update: false, expectedDate: "2026-09-13" },
    { allowHistorical: true, update: true, expectedDate: "2026-09-12" },
  ])("rejects an incomplete maintenance authority: %p", (override) => {
    expect(() => resolveBoundedHistoricalRecovery({
      requested: true,
      executionMode: "live-production",
      collectionDate: "2026-09-13",
      today: "2026-09-14",
      ...override,
    })).toThrow("Bounded historical recovery requires");
  });

  it("runs clean-day E2E for an admitted historical recovery", () => {
    expect(shouldRunCleanDayE2e({
      reuseExistingArtifacts: false,
      executionMode: "live-production",
      skipLiveCollection: false,
      allowHistorical: true,
      boundedHistoricalRecovery: true,
      collectionDate: "2026-09-13",
      today: "2026-09-14",
    })).toBe(true);
  });
});
