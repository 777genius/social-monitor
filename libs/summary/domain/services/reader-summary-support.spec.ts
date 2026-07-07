import { readerItemConfidence } from "./reader-summary-support";

describe("readerItemConfidence", () => {
  it("keeps single-source evidence low and capped", () => {
    expect(
      readerItemConfidence({
        cluster: undefined,
        evidenceCount: 1,
        confirmedProviderCount: 1,
        signalScore: 4,
      }),
    ).toEqual({
      level: "low",
      score: 0.42,
      rationale:
        "This story has not been independently confirmed across monitored source groups yet.",
    });
  });

  it("treats multi-source citations without a linked story group as medium support", () => {
    expect(
      readerItemConfidence({
        cluster: undefined,
        evidenceCount: 2,
        confirmedProviderCount: 2,
        signalScore: 1,
      }),
    ).toEqual({
      level: "medium",
      score: 0.67,
      rationale:
        "2 cited source groups support this story, but the key claim has not been fully cross-verified yet.",
    });
  });
});
