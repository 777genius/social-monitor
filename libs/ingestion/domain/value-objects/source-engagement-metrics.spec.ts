import {
  buildSourceEngagementMetrics,
  sourceMetadataWithoutEngagementAndVolatileProvenance,
} from "./source-engagement-metrics";

describe("source engagement metrics", () => {
  it("normalizes X aliases without inventing absent metrics", () => {
    const metadata = {
      kind: "x_post",
      searchQuery: "agents",
      trendScore: 42,
      likes: 0,
      retweets: 3,
      publicMetrics: {
        like_count: 0,
        retweet_count: 3,
        reply_count: 2,
        impression_count: 900,
      },
      metrics: { likes: 0, retweets: 3, replies: 2, views: 900 },
      mediaUrls: ["https://example.com/image.png"],
    };

    const result = buildSourceEngagementMetrics({
      providerKey: "x-twitter",
      metadata,
    });

    expect(result.metrics).toEqual({
      likes: 0,
      reposts: 3,
      replies: 2,
      impressions: 900,
      views: 900,
    });
    expect(result.metricsFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.providerMetadataPatch).toEqual({
      likes: 0,
      retweets: 3,
      publicMetrics: {
        like_count: 0,
        retweet_count: 3,
        reply_count: 2,
        impression_count: 900,
      },
      metrics: { likes: 0, retweets: 3, replies: 2, views: 900 },
    });
    expect(JSON.stringify(result.providerMetadataPatch)).not.toContain(
      "trendScore",
    );
    expect(
      sourceMetadataWithoutEngagementAndVolatileProvenance({
        providerKey: "x-twitter",
        metadata,
      }),
    ).toEqual({
      kind: "x_post",
      mediaUrls: ["https://example.com/image.png"],
    });
  });

  it("preserves signed Reddit score and converts ratio to basis points", () => {
    const result = buildSourceEngagementMetrics({
      providerKey: "reddit",
      metadata: {
        kind: "reddit_post",
        score: -3,
        numComments: 0,
        upvoteRatio: 0.875,
      },
    });

    expect(result.metrics).toEqual({
      score: -3,
      comments: 0,
      upvoteRatioBps: 8750,
    });
    expect(result.qualityFlags.invalidMetricValue).toBe(false);
  });

  it("flags conflicting aliases so callers can fail safe on content", () => {
    const result = buildSourceEngagementMetrics({
      providerKey: "x-twitter",
      metadata: {
        kind: "x_post",
        likes: 4,
        metrics: { likes: 8 },
      },
    });

    expect(result.metrics).toEqual({ likes: 4 });
    expect(result.qualityFlags.conflictingAliases).toBe(true);
  });

  it("treats unknown provider metadata as ambiguous content", () => {
    const metadata = { kind: "custom", score: 100, provenance: "live" };
    const result = buildSourceEngagementMetrics({
      providerKey: "custom-provider",
      metadata,
    });

    expect(result).toEqual({
      metrics: null,
      providerMetadataPatch: {},
      qualityFlags: {
        providerKnown: false,
        metadataKindKnown: false,
        invalidMetricValue: false,
        conflictingAliases: false,
      },
    });
    expect(
      sourceMetadataWithoutEngagementAndVolatileProvenance({
        providerKey: "custom-provider",
        metadata,
      }),
    ).toEqual(metadata);
  });

  it("supports official X metric aliases and rejects unsafe integers", () => {
    const aliases = buildSourceEngagementMetrics({
      providerKey: "x-twitter",
      metadata: {
        kind: "twitter_post",
        public_metrics: { like_count: 7, retweet_count: 2 },
      },
    });
    const unsafe = buildSourceEngagementMetrics({
      providerKey: "x-twitter",
      metadata: { kind: "x_post", likes: Number.MAX_SAFE_INTEGER + 1 },
    });

    expect(aliases.metrics).toEqual({ likes: 7, reposts: 2 });
    expect(unsafe.metrics).toBeNull();
    expect(unsafe.qualityFlags.invalidMetricValue).toBe(true);
  });
});
