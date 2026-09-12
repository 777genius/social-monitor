import { assessedSource, headlineScope } from "./reader-headline.spec-support";
import { displayReadyPromotionCandidates } from
  "./reader-summary-display-ready-candidates";

describe("display-ready reader promotion candidates", () => {
  it("keeps only publishable candidates when the ranked batch is mixed", () => {
    const ready = assessedSource();
    const unavailable = {
      ...ready,
      feedItemId: "higher-ranked-unavailable",
      readerHeadline: {
        status: "unavailable" as const,
        reasonCode: "not_assessed" as const,
      },
    };

    expect(displayReadyPromotionCandidates(
      [unavailable, ready],
      headlineScope,
    )).toEqual([ready]);
  });

  it("rejects a wholly unavailable selected batch before generation", () => {
    const unavailable = [{
      ...assessedSource(),
      readerHeadline: {
        status: "unavailable" as const,
        reasonCode: "not_assessed" as const,
      },
    }];

    expect(() => displayReadyPromotionCandidates(unavailable, headlineScope))
      .toThrow("Reader summary selected headlines unavailable");
  });
  it("preserves genuine absence of selected signal", () => {
    expect(displayReadyPromotionCandidates([], headlineScope)).toEqual([]);
  });
});
