import {
  buildReaderSummaryReliabilityReport,
  STORY_RANKING_POLICY_V1,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
} from "../../domain";

describe("buildReaderSummaryReliabilityReport", () => {
  it("reports duplicate, stale, single-source, weak-source and diversity risks in shadow mode", () => {
    const report = buildReaderSummaryReliabilityReport(selection());

    expect(report.mode).toBe("shadow");
    expect(report.policyVersion).toBe("reader_summary_reliability_shadow_v1");
    expect(report.riskLevel).toBe("high");
    expect(report.riskScore).toBeGreaterThan(0);
    expect(new Set(report.risks.map((risk) => risk.kind))).toEqual(
      new Set([
        "duplicate_risk",
        "stale_evidence",
        "single_source",
        "weak_source",
        "low_evidence_diversity",
      ]),
    );
  });

  it("stays quiet for diverse fresh cross-provider evidence", () => {
    const report = buildReaderSummaryReliabilityReport({
      ...selection(),
      sourceWindow: {
        ...selection().sourceWindow,
        endedAt: new Date("2026-06-23T08:20:00.000Z"),
      },
      clusters: [
        {
          ...selection().clusters[0]!,
          duplicateFeedItemIds: [],
          providerKeys: ["reddit", "hacker-news"],
        },
        {
          ...selection().clusters[0]!,
          id: "story:x",
          representativeFeedItemId: "feed-x",
          duplicateFeedItemIds: [],
          interestIds: ["interest-tools"],
          providerKeys: ["x-twitter", "rss"],
        },
        {
          ...selection().clusters[0]!,
          id: "story:github",
          representativeFeedItemId: "feed-github",
          duplicateFeedItemIds: [],
          interestIds: ["interest-infra"],
          providerKeys: ["github-repo-radar", "rss"],
        },
      ],
      selectedEvidence: [
        evidence("feed-reddit", "reddit", "interest-ai"),
        evidence("feed-hn", "hacker-news", "interest-ai"),
        evidence("feed-x", "x-twitter", "interest-tools"),
        evidence("feed-rss", "rss", "interest-tools"),
        evidence("feed-github", "github-repo-radar", "interest-infra"),
      ],
    });

    expect(report.riskLevel).toBe("low");
    expect(report.riskScore).toBe(0);
    expect(report.risks).toEqual([]);
  });
});

const selection = (): SummaryEvidenceSelection => ({
  rankingPolicyVersion: STORY_RANKING_POLICY_V1.version,
  sourceWindow: {
    windowId: "window-1",
    startedAt: new Date("2026-06-23T08:00:00.000Z"),
    endedAt: new Date("2026-06-26T08:00:00.000Z"),
    selectedFeedItemIds: ["feed-reddit-1", "feed-reddit-2"],
    storyClusterIds: ["story:reddit"],
  },
  clusters: [
    {
      id: "story:reddit",
      storyKey: "title:browser-agent-rumor",
      rankingPolicyVersion: STORY_RANKING_POLICY_V1.version,
      representativeFeedItemId: "feed-reddit-1",
      duplicateFeedItemIds: ["feed-reddit-2"],
      interestIds: ["interest-ai"],
      providerKeys: ["reddit"],
      score: 2,
      observedAtRange: {
        startedAt: new Date("2026-06-23T08:00:00.000Z"),
        endedAt: new Date("2026-06-23T08:30:00.000Z"),
      },
      whyImportant: ["Clustered related source items"],
    },
  ],
  selectedEvidence: [
    evidence("feed-reddit-1", "reddit", "interest-ai"),
    {
      ...evidence("feed-reddit-2", "reddit", "interest-ai"),
      contentQuality: {
        qualityScore: 0.3,
        interestRelevanceScore: 0.4,
        engagementIntegrityScore: 0.5,
        eligibleForSummary: true,
        eligibleForTopRead: false,
        needsLlmReview: true,
        decision: "downrank",
        flags: ["weak_interest_match"],
        reason: "Weak duplicate evidence",
      },
    },
  ],
});

const evidence = (
  feedItemId: string,
  providerKey: string,
  interestId: string,
): SummaryEvidenceItem => ({
  feedItemId,
  sourceItemId: `${feedItemId}-source`,
  sourceBindingId: `binding-${providerKey}`,
  interestId,
  providerKey,
  canonicalUrl: `https://example.com/${feedItemId}`,
  title: feedItemId,
  publishedAt: new Date("2026-06-23T07:00:00.000Z"),
  observedAt: new Date("2026-06-23T08:00:00.000Z"),
  score: 2,
  whyImportant: ["Selected evidence"],
  contentQuality: {
    qualityScore: 0.9,
    interestRelevanceScore: 0.9,
    engagementIntegrityScore: 0.9,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "promote",
    flags: [],
    reason: "Strong evidence",
  },
});
