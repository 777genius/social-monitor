import { historicalMutationNeedsQualityReconciliation } from
  "./reader-summary-promotion-v2-historical-subprocess";

describe("Promotion V2 historical production-day boundary", () => {
  it("does not accept an active pointer after the child quality gates fail", () => {
    expect(historicalMutationNeedsQualityReconciliation(
      1,
      "complete-active",
    )).toBe(true);
    expect(historicalMutationNeedsQualityReconciliation(
      0,
      "complete-active",
    )).toBe(false);
    expect(historicalMutationNeedsQualityReconciliation(1, "failed"))
      .toBe(false);
  });
});
