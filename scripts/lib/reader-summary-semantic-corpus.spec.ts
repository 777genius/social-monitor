import {
  assertReaderSummarySemanticCorpusMatches,
  buildReaderSummarySemanticCorpusContract,
} from "./reader-summary-semantic-corpus";

describe("reader summary semantic corpus contract", () => {
  it("is stable across source-window ordering", () => {
    expect(
      buildReaderSummarySemanticCorpusContract(["feed:b", "feed:a"]),
    ).toEqual(buildReaderSummarySemanticCorpusContract(["feed:a", "feed:b"]));
  });

  it("rejects a corpus changed under the same collection date", () => {
    expect(() =>
      assertReaderSummarySemanticCorpusMatches({
        expected: buildReaderSummarySemanticCorpusContract(["feed:a"]),
        actual: buildReaderSummarySemanticCorpusContract(["feed:a", "feed:b"]),
      }),
    ).toThrow("Semantic gold corpus does not match");
  });
});
