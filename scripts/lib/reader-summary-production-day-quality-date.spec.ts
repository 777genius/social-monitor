import { productionDayQualityDateArgs } from "./reader-summary-production-day-quality-date";

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
