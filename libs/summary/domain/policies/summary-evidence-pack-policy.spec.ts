import { providerMetric } from "../value-objects/provider-metric-label";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { buildSummaryEvidencePack } from "./summary-evidence-pack-policy";

describe("buildSummaryEvidencePack", () => {
  it("groups selected evidence into structured summary buckets", () => {
    const pack = buildSummaryEvidencePack({
      rankingPolicyVersion: "story-ranking.v1",
      sourceWindow: {
        windowId: "window-1",
        startedAt: new Date("2026-07-04T00:00:00.000Z"),
        endedAt: new Date("2026-07-04T01:00:00.000Z"),
        selectedFeedItemIds: ["feed-github", "feed-reddit", "feed-x"],
        storyClusterIds: ["cluster-1"],
      },
      clusters: [
        {
          id: "cluster-1",
          storyKey: "release",
          representativeFeedItemId: "feed-github",
          duplicateFeedItemIds: ["feed-x"],
          interestIds: ["interest-1"],
          providerKeys: ["github", "x-twitter"],
          score: 10,
          observedAtRange: {
            startedAt: new Date("2026-07-04T00:10:00.000Z"),
            endedAt: new Date("2026-07-04T00:20:00.000Z"),
          },
          whyImportant: ["Cross-provider release signal."],
        },
      ],
      selectedEvidence: [
        evidenceItem({
          feedItemId: "feed-github",
          providerKey: "github",
          title: "Repository maintainers publish release notes",
          score: 0.9,
          matchedRules: ["official-release"],
        }),
        evidenceItem({
          feedItemId: "feed-reddit",
          providerKey: "reddit",
          title: "Users disagree with the release claim",
          score: 0.7,
          contentQuality: {
            qualityScore: 0.4,
            interestRelevanceScore: 0.4,
            engagementIntegrityScore: 0.8,
            eligibleForSummary: true,
            eligibleForTopRead: false,
            needsLlmReview: true,
            decision: "downrank",
            flags: ["dissent"],
            reason: "Needs corroboration.",
          },
          providerMetricLabels: [providerMetric("score", 120)].flatMap(
            (metric) => metric ?? [],
          ),
        }),
        evidenceItem({
          feedItemId: "feed-x",
          providerKey: "x-twitter",
          title: "X thread repeats the release notes",
          score: 0.8,
          observedAt: new Date("2026-07-04T00:20:00.000Z"),
        }),
      ],
    });

    expect(pack.officialSignals.map((signal) => signal.feedItemId)).toEqual([
      "feed-github",
    ]);
    expect(pack.topCommunitySignals.map((signal) => signal.feedItemId)).toEqual([
      "feed-x",
      "feed-reddit",
    ]);
    expect(pack.emergingSignals[0]?.feedItemId).toBe("feed-x");
    expect(pack.dissentingViews.map((signal) => signal.feedItemId)).toEqual([
      "feed-reddit",
    ]);
    expect(
      pack.highEngagementLowConfidence.map((signal) => signal.feedItemId),
    ).toEqual(["feed-reddit"]);
    expect(pack.duplicatesCollapsed).toEqual([
      {
        clusterId: "cluster-1",
        representativeFeedItemId: "feed-github",
        duplicateFeedItemIds: ["feed-x"],
        providerKeys: ["github", "x-twitter"],
      },
    ]);
    expect(pack.sourceCoverage).toMatchObject({
      selectedEvidenceCount: 3,
      providerCount: 3,
      crossProviderClusterCount: 1,
    });
    expect(pack.confidence).toMatchObject({
      level: "high",
      score: 0.85,
    });
  });
});

const evidenceItem = (
  overrides: Partial<SummaryEvidenceItem>,
): SummaryEvidenceItem => ({
  feedItemId: overrides.feedItemId ?? "feed-1",
  sourceItemId: overrides.sourceItemId ?? `${overrides.feedItemId ?? "feed-1"}-source`,
  sourceBindingId: "binding-1",
  interestId: "interest-1",
  providerKey: overrides.providerKey ?? "reddit",
  canonicalUrl: `https://example.test/${overrides.feedItemId ?? "feed-1"}`,
  title: overrides.title ?? "Evidence title",
  bodyPreview: overrides.bodyPreview,
  authorHandle: overrides.authorHandle,
  publishedAt:
    overrides.publishedAt ?? new Date("2026-07-04T00:05:00.000Z"),
  observedAt:
    overrides.observedAt ?? new Date("2026-07-04T00:10:00.000Z"),
  score: overrides.score ?? 0.5,
  whyImportant: overrides.whyImportant ?? ["Relevant signal."],
  providerMetricLabels: overrides.providerMetricLabels,
  contentQuality: overrides.contentQuality,
  matchedRules: overrides.matchedRules,
  conversationContext: overrides.conversationContext,
});
