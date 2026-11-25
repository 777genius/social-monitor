import { assessedSource, headlineScope } from "./reader-headline.spec-support";
import { displayReadyPromotionCandidates } from
  "./reader-summary-display-ready-candidates";

const unusableSource = {
  title: "Cited story",
  bodyPreview: "Cited story",
  sourceText: "Cited story",
};

describe("display-ready reader promotion candidates", () => {
  it("keeps an accepted headline over an unusable source without a headline", () => {
    const ready = assessedSource();
    const unavailable = {
      ...ready,
      feedItemId: "higher-ranked-unavailable",
      ...unusableSource,
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

  it("keeps a reader-facing source title when the display headline is unavailable", () => {
    const ready = assessedSource();
    const unavailable = {
      ...ready,
      feedItemId: "source-title-ready",
      readerHeadline: {
        status: "unavailable" as const,
        reasonCode: "not_assessed" as const,
      },
    };

    expect(displayReadyPromotionCandidates(
      [unavailable, ready],
      headlineScope,
    )).toEqual([unavailable, ready]);
  });

  it.each(["invalid_assessment", "unresolved_qualifications", "unsafe_text"] as const)(
    "keeps a useful source title after %s instead of failing the whole slate",
    (reasonCode) => {
      const ready = assessedSource();
      const failed = {
        ...ready,
        feedItemId: "attempted-unavailable",
        readerHeadline: { status: "unavailable" as const, reasonCode },
      };

      expect(displayReadyPromotionCandidates(
        [failed, ready],
        headlineScope,
      )).toEqual([failed, ready]);
    },
  );

  it("drops a copied accepted headline instead of publishing a source-title fallback", () => {
    const ready = assessedSource();
    if (ready.readerHeadline?.status !== "accepted") throw new Error("fixture");
    const stale = {
      ...ready,
      feedItemId: "stale-accepted",
      readerHeadline: {
        ...ready.readerHeadline,
        binding: { ...ready.readerHeadline.binding, candidateId: "wrong" },
      },
    };

    expect(displayReadyPromotionCandidates(
      [stale, ready],
      headlineScope,
    )).toEqual([ready]);
  });

  it("rejects a wholly unusable selected batch before generation", () => {
    const unavailable = [{
      ...assessedSource(),
      ...unusableSource,
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
