import { normalizeXPost } from
  "@social-monitor/ingestion/adapters/source/x-twitter-experimental-daily/x-twitter-experimental-daily-item";
import { StaticXPromotionAuthorityRegistry } from
  "@social-monitor/ingestion/adapters/source/x-twitter-experimental-daily/static-x-promotion-authority-registry";
import { readerPostPromotionFacts } from
  "@social-monitor/summary/adapters/evidence/reader-post-promotion-facts";
import { buildReaderPostPromotionProjection } from
  "@social-monitor/summary/domain/services/reader-post-promotion-projection";
import { attestedStoryRelationFixture } from
  "@social-monitor/summary/domain/services/story-relation-provenance-test-fixtures";

describe("X authority promotion integration", () => {
  it("carries a catalog-authenticated normalized record through facts into same-story support", () => {
    const publishedAt = new Date("2026-08-14T12:00:00.000Z");
    const observedAt = new Date("2026-08-14T12:05:00.000Z");
    const cutoff = new Date("2026-08-15T00:00:00.000Z");
    const quality = {
      qualityScore: 0.9,
      interestRelevanceScore: 0.8,
      engagementIntegrityScore: 0.7,
      eligibleForSummary: true,
      eligibleForTopRead: true,
      needsLlmReview: false,
      decision: "promote",
      flags: [],
      reason: "typed integration fixture",
    } as const;
    const normalized = normalizeXPost({
      tweetId: "1956000000000000000",
      canonicalUrl: "https://x.com/cursor_ai/status/1956000000000000000",
      text: "Cursor ships a material agent update.",
      authorHandle: "cursor_ai",
      publishedAt,
      metrics: { likes: 15, retweets: 10, replies: 0,
        eligibilityState: "observed" },
      mediaUrls: [],
      sourceProduct: "latest",
      trendScore: 0,
      contentKind: "original_post",
    }, "Cursor", 10, new StaticXPromotionAuthorityRegistry(["cursor_ai"])
      .resolveVerifiedIdentity("cursor_ai") ?? undefined);
    const officialFacts = readerPostPromotionFacts({
      providerKey: "x-twitter",
      canonicalUrl: normalized.canonicalUrl,
      providerMetadata: normalized.metadata,
      contentQuality: quality,
      safetyStatus: "allowed",
      publishedAt,
      observedAt,
      ingestionCutoff: cutoff,
    });
    const shared = {
      sourceBindingId: "binding:cursor",
      interestId: "interest:agents",
      publishedAt,
      observedAt,
      score: 1,
      whyImportant: ["Material agent release."],
      contentQuality: quality,
    } as const;
    const evidence = [{
      ...shared,
      feedItemId: "cursor-hn",
      sourceItemId: "cursor-hn",
      providerKey: "hacker-news",
      canonicalUrl: "https://news.ycombinator.com/item?id=cursor",
      title: "Cursor release reaches HN",
      bodyPreview: "Cursor release reaches HN",
      promotionFacts: {
        contentKind: "story" as const,
        canonicalIdentity: "story:cursor-release",
        safetyValid: true,
        freshnessValid: true,
        freshnessProvenance: { status: "observed" as const,
          publishedAt, observedAt, ingestionCutoff: cutoff },
        metricsState: "observed" as const,
        metrics: { provider: "hacker_news" as const, points: 50 },
      },
    }, {
      ...shared,
      feedItemId: normalized.externalId,
      sourceItemId: normalized.externalId,
      providerKey: "x-twitter",
      canonicalUrl: normalized.canonicalUrl,
      title: normalized.title,
      bodyPreview: normalized.body,
      promotionFacts: officialFacts,
    }];
    const projection = buildReaderPostPromotionProjection({
      evidence,
      clusters: evidence.map((item) => ({
        id: `cluster:${item.feedItemId}`,
        storyKey: item.feedItemId,
        rankingPolicyVersion: "story-ranking.v1",
        representativeFeedItemId: item.feedItemId,
        duplicateFeedItemIds: [],
        interestIds: [item.interestId],
        providerKeys: [item.providerKey],
        score: 1,
        observedAtRange: { startedAt: observedAt, endedAt: observedAt },
        whyImportant: item.whyImportant,
      })),
      citations: evidence.map((item) => ({
        citationId: `citation:${item.feedItemId}`,
        feedItemId: item.feedItemId,
        sourceItemId: item.sourceItemId,
        providerKey: item.providerKey,
        field: "canonicalUrl" as const,
        canonicalUrl: item.canonicalUrl,
      })),
      sourceWindow: {
        windowId: "window:cursor",
        startedAt: publishedAt,
        endedAt: cutoff,
        periodStartedAt: publishedAt,
        periodEndedAt: cutoff,
        ingestionCutoff: cutoff,
        selectedFeedItemIds: evidence.map((item) => item.feedItemId),
        storyClusterIds: evidence.map((item) => `cluster:${item.feedItemId}`),
      },
      approvedSameStoryRelations: [attestedStoryRelationFixture({
        leftFeedItemId: "cursor-hn",
        rightFeedItemId: normalized.externalId,
        confidence: 0.95,
      })],
    });

    expect(officialFacts.authorityAttestation).toMatchObject({
      official: true,
      trusted: true,
      attestedBy: "source_catalog",
    });
    expect(projection.topReads).toEqual([expect.objectContaining({
      promotionCandidateId: "cursor-hn",
      confirmedProviderKeys: ["hacker-news", "x"],
      citationIds: [
        "citation:cursor-hn",
        `citation:${normalized.externalId}`,
      ],
    })]);
    expect(projection.admittedEvidence.find((item) =>
      item.feedItemId === normalized.externalId,
    )?.promotionFacts?.authorityAttestation).toMatchObject({
      official: true,
      attestedBy: "source_catalog",
    });
    expect(projection.admittedClusters[0]?.providerKeys).toEqual([
      "hacker-news",
      "x-twitter",
    ]);
    expect(projection.admittedCitations.map((citation) => citation.providerKey))
      .toEqual(["hacker-news", "x-twitter"]);
  });
});
