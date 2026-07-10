import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { isReaderSummaryEvidenceEligible } from "./reader-summary-evidence-eligibility-policy";

describe("isReaderSummaryEvidenceEligible", () => {
  it("rejects engagement bait even when it is technically summary eligible", () => {
    expect(
      isReaderSummaryEvidenceEligible(evidence({ flags: ["engagement_bait"] })),
    ).toBe(false);
  });

  it("keeps an explicit dissent signal for low-confidence context", () => {
    expect(
      isReaderSummaryEvidenceEligible(
        evidence({ decision: "downrank", flags: ["dissent"] }),
      ),
    ).toBe(true);
  });

  it("rejects explicit summary ineligibility and keeps legacy evidence", () => {
    expect(
      isReaderSummaryEvidenceEligible(
        evidence({ eligibleForSummary: false, flags: [] }),
      ),
    ).toBe(false);
    expect(isReaderSummaryEvidenceEligible(evidence())).toBe(true);
  });
});

function evidence(
  quality?: Partial<NonNullable<SummaryEvidenceItem["contentQuality"]>>,
): SummaryEvidenceItem {
  return {
    feedItemId: "feed-1",
    sourceItemId: "source-1",
    sourceBindingId: "binding-1",
    interestId: "interest-1",
    providerKey: "x-twitter",
    canonicalUrl: "https://example.test/post/1",
    title: "Relevant AI engineering signal",
    publishedAt: new Date("2026-07-09T10:00:00.000Z"),
    observedAt: new Date("2026-07-09T10:01:00.000Z"),
    score: 1,
    whyImportant: ["Relevant to the configured interest"],
    ...(quality === undefined
      ? {}
      : {
          contentQuality: {
            qualityScore: 0.8,
            interestRelevanceScore: 0.8,
            engagementIntegrityScore: 0.8,
            eligibleForSummary: true,
            eligibleForTopRead: false,
            needsLlmReview: false,
            decision: "keep",
            flags: [],
            reason: "Eligible evidence",
            ...quality,
          },
        }),
  };
}
