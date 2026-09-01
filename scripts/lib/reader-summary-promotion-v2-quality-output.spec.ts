import { historicalPromotionQualityOutput } from
  "./reader-summary-promotion-v2-quality-output";

describe("historical Promotion V2 date quality output", () => {
  it("isolates every update artifact by production date", () => {
    const first = historicalPromotionQualityOutput({
      enabled: true,
      reportDirectory: "/artifacts/2026-08-01/production-day",
    });
    const second = historicalPromotionQualityOutput({
      enabled: true,
      reportDirectory: "/artifacts/2026-08-02/production-day",
    });
    expect(first.args("quality.json")).toEqual([
      "--output-path",
      "/artifacts/2026-08-01/production-day/quality-artifacts/quality.json",
    ]);
    expect(second.path("quality.json")).not.toBe(first.path("quality.json"));
    expect(first.cleanDayArgs).toContain(
      "/artifacts/2026-08-01/production-day/quality-artifacts/yesterday-social-collection-quality-report.v1.json",
    );
  });

  it("keeps ordinary production quality artifacts on canonical defaults", () => {
    const output = historicalPromotionQualityOutput({
      enabled: false,
      reportDirectory: "/ignored",
    });
    expect(output.args("quality.json")).toEqual([]);
    expect(output.cleanDayArgs).toEqual([]);
  });
});
