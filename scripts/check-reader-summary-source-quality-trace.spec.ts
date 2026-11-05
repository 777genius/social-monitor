import {
  sourceQualityBodyPreview,
  topReadPromotionCandidateFeedItemIds,
} from "./check-reader-summary-source-quality-trace";

describe("reader summary source quality trace", () => {
  it("treats only the attested candidate as the promoted top read", () => {
    const result = topReadPromotionCandidateFeedItemIds([
      {
        promotionAttestation: { candidateId: "promoted-reddit-post" },
        citationIds: [
          "citation-for-promoted-post",
          "citation-for-downranked-supporting-post",
        ],
      },
    ]);

    expect([...result]).toEqual(["promoted-reddit-post"]);
  });

  it("does not invent a promoted candidate for an unattested legacy card", () => {
    const result = topReadPromotionCandidateFeedItemIds([
      { citationIds: ["supporting-citation"] },
    ]);

    expect([...result]).toEqual([]);
  });

  it("evaluates the canonical source body used by artifact quality", () => {
    expect(
      sourceQualityBodyPreview({
        bodyPreview: "short preview without the topic context",
        sourceBody: "full source body with the complete topic context",
      }),
    ).toBe("full source body with the complete topic context");
  });

  it("falls back to the feed preview when source text is empty", () => {
    expect(
      sourceQualityBodyPreview({
        bodyPreview: "feed preview",
        sourceBody: "  ",
      }),
    ).toBe("feed preview");
  });
});
