import type { TopRead } from "@social-monitor/summary/domain";

import {
  primarySummaryProviderBreadthEnough,
  primarySummaryRepresentationBreadthEnough,
  primarySummaryRepresentationEnough,
  readerFacingPrimaryCandidateCount,
  summaryEvidenceCoverageEnough,
} from "./reader-summary-primary-source-quality";

describe("reader summary primary source quality", () => {
  it("accepts one strong primary provider without forcing a weak second provider", () => {
    expect(
      primarySummaryProviderBreadthEnough({
        primarySources: ["reddit", "x-twitter"],
        providerCounts: { reddit: 6, "x-twitter": 0 },
      }),
    ).toBe(true);
  });

  it("still requires at least one primary provider", () => {
    expect(
      primarySummaryProviderBreadthEnough({
        primarySources: ["reddit", "x-twitter"],
        providerCounts: { "hacker-news": 8 },
      }),
    ).toBe(false);
  });

  it("accepts one strongly represented primary provider", () => {
    expect(
      primarySummaryRepresentationBreadthEnough([
        {
          selectedCount: 10,
          topReadCount: 4,
          readerFacingTopReadCandidateCount: 20,
        },
        {
          selectedCount: 2,
          topReadCount: 1,
          readerFacingTopReadCandidateCount: 20,
        },
      ]),
    ).toBe(true);
    expect(
      primarySummaryRepresentationBreadthEnough([
        {
          selectedCount: 2,
          topReadCount: 1,
          readerFacingTopReadCandidateCount: 20,
        },
      ]),
    ).toBe(false);
  });

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

  it("requires evidence for every story plus breadth beyond top reads", () => {
    expect(
      summaryEvidenceCoverageEnough({
        selectedEvidenceCount: 16,
        storyClusterCount: 16,
        topReadCount: 8,
      }),
    ).toBe(true);
    expect(
      summaryEvidenceCoverageEnough({
        selectedEvidenceCount: 15,
        storyClusterCount: 16,
        topReadCount: 8,
      }),
    ).toBe(false);
    expect(
      summaryEvidenceCoverageEnough({
        selectedEvidenceCount: 8,
        storyClusterCount: 8,
        topReadCount: 8,
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
