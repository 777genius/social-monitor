import {
  compareReaderPromotionScoreDesc,
  readerPromotionScore,
} from "./reader-promotion-score";

describe("reader promotion hybrid score", () => {
  it("produces the exact fractions a Dart verifier must reproduce", () => {
    // These literals are the cross-platform contract, not derived values.
    expect(readerPromotionScore({ usefulness: "important",
      popularity: { cohortSize: 10, below: 0, equal: 1 } }))
      .toEqual({ numerator: 8_600_000n, denominator: 20_000_000n });
    expect(readerPromotionScore({ usefulness: "useful", popularity: null }))
      .toEqual({ numerator: 400_000n, denominator: 2_000_000n });
    expect(readerPromotionScore({ usefulness: "useful",
      popularity: { cohortSize: 3, below: 0, equal: 2 } }))
      .toEqual({ numerator: 2_400_000n, denominator: 6_000_000n });
  });

  it("compares equal fractions from different cohort sizes as equal", () => {
    const important = readerPromotionScore({ usefulness: "important", popularity: null });
    const useful = readerPromotionScore({ usefulness: "useful",
      popularity: { cohortSize: 3, below: 0, equal: 2 } });

    expect(compareReaderPromotionScoreDesc(important, useful)).toBe(0);
    expect(compareReaderPromotionScoreDesc(useful, readerPromotionScore({
      usefulness: "useful", popularity: { cohortSize: 3, below: 2, equal: 1 } }))).toBe(1);
  });

  it("stays exact for cohorts far beyond float-safe products", () => {
    const left = readerPromotionScore({ usefulness: "useful",
      popularity: { cohortSize: 900_000, below: 450_000, equal: 1 } });
    const right = readerPromotionScore({ usefulness: "useful",
      popularity: { cohortSize: 900_001, below: 450_000, equal: 1 } });

    expect(compareReaderPromotionScoreDesc(left, right)).toBe(-1);
  });

  it("fails closed on a gate-rejected usefulness or impossible counts", () => {
    expect(() => readerPromotionScore({ usefulness: "context", popularity: null }))
      .toThrow("Reader promotion score needs an admitted usefulness");
    expect(() => readerPromotionScore({ usefulness: "useful",
      popularity: { cohortSize: 2, below: 2, equal: 1 } }))
      .toThrow("Reader promotion popularity is invalid");
  });
});
