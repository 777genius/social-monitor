import { allQualityGatesPassed } from "./quality-gates";

describe("allQualityGatesPassed", () => {
  it("passes only when every quality gate passes", () => {
    expect(
      allQualityGatesPassed({
        providerCoverage: true,
        sourceWindow: true,
      }),
    ).toBe(true);

    expect(
      allQualityGatesPassed({
        providerCoverage: true,
        sourceWindow: false,
      }),
    ).toBe(false);
  });
});
