import { buildReaderSummary } from "../aggregates/reader-summary";
import { admitReaderPostPromotionEvidence } from
  "./reader-post-promotion-evidence-admission";
import { buildReaderPostPromotionProjection } from
  "./reader-post-promotion-projection";
import type { SummaryEvidenceItem, SummaryEvidenceSelection } from
  "../value-objects/summary-evidence-item";

describe("admitReaderPostPromotionEvidence supplemental appendix", () => {
  it("preserves GitHub Trending after promotion selection without counting it", () => {
    const selection = fixtureSelection();
    const admitted = admitReaderPostPromotionEvidence(selection);

    expect(admitted.promotionCounts).toEqual({ top: 1, additional: 0 });
    expect(admitted.selectedEvidence.map((item) => item.feedItemId)).toEqual([
      "hn:top",
      "github:trending",
    ]);
    expect(admitted.sourceWindow.selectedFeedItemIds).toEqual([
      "hn:top",
      "github:trending",
    ]);

    const summary = buildReaderSummary({
      headline: "Agent release reaches developers",
      executiveSummary: "The release reached the exact HN Top floor.",
      topStories: [{
        storyClusterId: "cluster:hn:top",
        title: "Agent release reaches developers",
        summary: "The release reached the exact HN Top floor.",
        interestIds: ["agents"],
        providerKeys: ["hacker-news"],
        citationIds: ["citation:hn"],
      }],
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: admitted.selectedEvidence.map((item) => ({
        citationId: item.feedItemId === "hn:top"
          ? "citation:hn"
          : "citation:github",
        feedItemId: item.feedItemId,
        sourceItemId: item.sourceItemId,
        providerKey: item.providerKey,
        field: "canonicalUrl" as const,
        canonicalUrl: item.canonicalUrl,
      })),
      storyClusters: admitted.clusters,
      sourceWindow: admitted.sourceWindow,
      selectedEvidence: admitted.selectedEvidence,
      qualityFlags: [],
    });

    expect(summary.topReads).toHaveLength(1);
    expect(summary.selectedPosts).toEqual([]);
    expect(summary.narrativeSections).toEqual([
      expect.objectContaining({
        id: "github-trending",
        citationIds: ["citation:github"],
      }),
    ]);
  });

  it("publishes a reader-facing title instead of provider boilerplate", () => {
    const fixture = fixtureSelection();
    const evidence = fixture.selectedEvidence.map((item) =>
      item.feedItemId === "hn:top"
        ? { ...item, title: "X post by @builder: Agent release reaches developers" }
        : item,
    );
    const projection = buildReaderPostPromotionProjection({
      evidence,
      clusters: fixture.clusters,
      sourceWindow: fixture.sourceWindow,
      citations: evidence.map((item) => ({
        citationId: `citation:${item.feedItemId}`,
        feedItemId: item.feedItemId,
        sourceItemId: item.sourceItemId,
        providerKey: item.providerKey,
        field: "canonicalUrl" as const,
        canonicalUrl: item.canonicalUrl,
      })),
    });

    expect(projection.topReads[0]?.title)
      .toBe("Agent release reaches developers");
  });
});

const fixtureSelection = (): SummaryEvidenceSelection => {
  const publishedAt = new Date("2026-08-14T10:00:00.000Z");
  const observedAt = new Date("2026-08-14T11:00:00.000Z");
  const cutoff = new Date("2026-08-14T12:00:00.000Z");
  const primary: SummaryEvidenceItem = {
    feedItemId: "hn:top",
    sourceItemId: "hn:top",
    sourceBindingId: "binding:hn",
    interestId: "agents",
    providerKey: "hacker-news",
    canonicalUrl: "https://news.ycombinator.com/item?id=50",
    title: "Agent release reaches developers",
    publishedAt,
    observedAt,
    score: 1,
    whyImportant: ["Exact HN Top floor."],
    contentQuality: quality,
    promotionFacts: {
      contentKind: "story",
      canonicalIdentity: "story:agent-release",
      safetyValid: true,
      freshnessValid: true,
      freshnessProvenance: {
        status: "observed",
        publishedAt,
        observedAt,
        ingestionCutoff: cutoff,
      },
      metricsState: "observed",
      metrics: { provider: "hacker_news", points: 50 },
    },
  };
  const supplemental: SummaryEvidenceItem = {
    feedItemId: "github:trending",
    sourceItemId: "github:trending",
    sourceBindingId: "binding:github",
    interestId: "agents",
    providerKey: "github-trending-page",
    canonicalUrl: "https://github.com/example/trending-agent",
    title: "example/trending-agent",
    publishedAt,
    observedAt,
    score: 0.5,
    whyImportant: ["Supplemental GitHub trend."],
    providerMetricLabels: [{
      label: "GitHub Trending today",
      value: "#1, +1,500 stars today",
    }],
  };
  const selectedEvidence = [primary, supplemental];
  return {
    rankingPolicyVersion: "story-ranking.v1",
    selectedEvidence,
    clusters: selectedEvidence.map((item) => ({
      id: `cluster:${item.feedItemId}`,
      storyKey: item.feedItemId,
      representativeFeedItemId: item.feedItemId,
      duplicateFeedItemIds: [],
      interestIds: [item.interestId],
      providerKeys: [item.providerKey],
      score: item.score,
      observedAtRange: { startedAt: observedAt, endedAt: observedAt },
      whyImportant: item.whyImportant,
    })),
    sourceWindow: {
      windowId: "window:appendix",
      startedAt: new Date("2026-08-14T00:00:00.000Z"),
      endedAt: cutoff,
      periodStartedAt: new Date("2026-08-14T00:00:00.000Z"),
      periodEndedAt: new Date("2026-08-15T00:00:00.000Z"),
      ingestionCutoff: cutoff,
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      storyClusterIds: selectedEvidence.map((item) =>
        `cluster:${item.feedItemId}`),
    },
  };
};

const quality = {
  qualityScore: 0.9,
  interestRelevanceScore: 0.9,
  engagementIntegrityScore: 0.9,
  eligibleForSummary: true,
  eligibleForTopRead: true,
  needsLlmReview: false,
  decision: "promote",
  flags: [],
  reason: "eligible",
} as const;
