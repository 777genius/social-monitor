import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";

import { mapRankedItem } from "./relevance-reader-summary-evidence-support";

describe("reader summary source origin mapping", () => {
  it("carries the external publication URL for Hacker News stories", () => {
    const evidence = mapRankedItem({
      ...rankedItem(),
      providerMetadata: {
        kind: "hacker_news_story",
        externalUrl: "https://ant.example/",
        points: 155,
        comments: 67,
      },
    });

    expect(evidence.sourceOriginUrl).toBe("https://ant.example/");
  });

  it("ignores externalUrl metadata for providers without that lineage contract", () => {
    const evidence = mapRankedItem({
      ...rankedItem(),
      providerKey: "reddit",
      canonicalUrl: "https://reddit.com/r/programming/comments/123/story",
      providerMetadata: {
        externalUrl: "https://untrusted.example/redirect",
      },
    });

    expect(evidence.sourceOriginUrl).toBeUndefined();
  });
});

const rankedItem = (): RankedFeedItemView => ({
  feedItemId: "feed-hn",
  sourceItemId: "source-hn",
  sourceBindingId: "binding-hn",
  interestId: "ai-developer-tools",
  providerKey: "hacker-news",
  canonicalUrl: "https://news.ycombinator.com/item?id=123",
  title: "Show HN: Ant JavaScript ecosystem",
  bodyPreview: "A new JavaScript runtime and package ecosystem.",
  publishedAt: "2026-07-11T12:00:00.000Z",
  observedAt: "2026-07-11T12:05:00.000Z",
  score: 2.023,
  rank: 1,
  clusterId: "story:ant",
  clusterSize: 1,
  duplicateFeedItemIds: [],
  whyImportant: ["Relevant technical launch"],
  safety: {
    status: "allowed",
    categories: ["raw_payload_retention_disabled"],
    rawPayloadRetained: false,
    retentionPolicy: "normalized_preview_only",
  },
  contentQuality: {
    qualityScore: 0.8,
    interestRelevanceScore: 0.8,
    engagementIntegrityScore: 0.8,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "promote",
    flags: [],
    reason: "Relevant technical launch",
  },
});
