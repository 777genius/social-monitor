import { publicReaderSummaryMatchedRules } from "./reader-summary-artifact-presenter";

describe("reader summary artifact presentation", () => {
  it("keeps editorial provenance internal while preserving public rules", () => {
    expect(
      publicReaderSummaryMatchedRules([
        "interest:ai-agents",
        "rule:reader-summary-model-curated",
        "reader-visible-rule",
      ]),
    ).toEqual(["reader-visible-rule"]);
  });
});
