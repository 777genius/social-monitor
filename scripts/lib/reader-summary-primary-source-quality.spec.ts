import type { TopRead } from "@social-monitor/summary/domain";

import {
  primarySummaryRepresentationEnough,
  readerFacingPrimaryCandidateCount,
} from "./reader-summary-primary-source-quality";

describe("reader summary primary source quality", () => {
  it("does not require a garbage second read when only one is reader-facing", () => {
    const selectedPosts = [
      topRead("Useful Reddit analysis", "Concrete operational context."),
      topRead("Viral headline", "Viral headline"),
    ];
    const readerFacingCandidateCount = readerFacingPrimaryCandidateCount({
      providerKey: "reddit",
      selectedPosts,
    });

    expect(readerFacingCandidateCount).toBe(1);
    expect(
      primarySummaryRepresentationEnough({
        selectedCount: 30,
        topReadCount: 1,
        readerFacingTopReadCandidateCount: readerFacingCandidateCount,
      }),
    ).toBe(true);
  });

  it("requires two reads when two reader-facing candidates exist", () => {
    const readerFacingCandidateCount = readerFacingPrimaryCandidateCount({
      providerKey: "reddit",
      selectedPosts: [
        topRead("Useful Reddit analysis", "Concrete operational context."),
        topRead("Another Reddit signal", "A distinct practical impact."),
      ],
    });

    expect(readerFacingCandidateCount).toBe(2);
    expect(
      primarySummaryRepresentationEnough({
        selectedCount: 30,
        topReadCount: 1,
        readerFacingTopReadCandidateCount: readerFacingCandidateCount,
      }),
    ).toBe(false);
  });
});

const topRead = (title: string, reason: string): TopRead => ({
  title,
  providerKey: "reddit",
  providerName: "Reddit",
  primaryActionKind: "read_source",
  reason,
  matchedInterestIds: ["ai"],
  matchedRules: ["interest:ai"],
  signalScore: 2.2,
  confidence: { level: "medium", score: 0.7, rationale: "test" },
  confirmedProviderKeys: ["reddit"],
  providerMetrics: [],
  whyImportant: [reason],
  whyNow: "Current window",
  citationIds: [`citation:${title}`],
});
