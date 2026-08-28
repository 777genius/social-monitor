import { topReadPromotionCandidateFeedItemIds } from "./check-reader-summary-source-quality-trace";

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
});
