import { selectReaderPostPromotions } from
  "../../domain/policies/reader-post-promotion-selection";
import { readerPostPromotionFacts } from "./reader-post-promotion-facts";

describe("readerPostPromotionFacts", () => {
  const quality = {
    qualityScore: 0.9,
    interestRelevanceScore: 0.8,
    engagementIntegrityScore: 0.7,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "promote",
    flags: ["official_account", "trusted_author"],
    reason: "typed boundary fixture",
  } as const;

  it("preserves only authoritative Reddit promotion metrics", () => {
    expect(readerPostPromotionFacts({
      providerKey: "reddit",
      canonicalUrl: "https://reddit.com/r/ai/comments/example/story/",
      providerMetadata: {
        kind: "reddit_post",
        score: 25,
        comments: 9,
        upvoteRatio: 0.55,
      },
      contentQuality: quality,
      safetyStatus: "allowed",
    })).toMatchObject({
      contentKind: "original_post",
      canonicalIdentity: "url:https://reddit.com/r/ai/comments/example/story",
      metricsState: "observed",
      metrics: {
        provider: "reddit",
        score: 25,
        upvoteRatio: 0.55,
      },
    });
  });

  it.each([
    [{ kind: "x_post", contentKind: "original_post" }, "missing"],
    [{ kind: "x_post", contentKind: "original_post", likes: "many", retweets: 10 }, "malformed"],
    [{
      kind: "x_post",
      contentKind: "original_post",
      likes: 50,
      retweets: 10,
      publicMetrics: { like_count: 51, retweet_count: 10 },
    }, "conflict"],
  ] as const)("preserves X metric state as %s", (providerMetadata, state) => {
    expect(readerPostPromotionFacts({
      providerKey: "x-twitter",
      canonicalUrl: "https://x.com/example/status/metric-state",
      providerMetadata,
      contentQuality: quality,
      safetyStatus: "allowed",
    })).toMatchObject({ metricsState: state });
  });

  it("requires producer or catalog authority attestation and ignores LLM flags", () => {
    const base = {
      providerKey: "x-twitter",
      canonicalUrl: "https://x.com/example/status/authority",
      contentQuality: quality,
      safetyStatus: "allowed" as const,
    };
    expect(readerPostPromotionFacts({
      ...base,
      providerMetadata: {
        kind: "x_post", contentKind: "original_post", likes: 50, retweets: 10,
      },
    }).authorityAttestation).toBeUndefined();
    expect(readerPostPromotionFacts({
      ...base,
      providerMetadata: {
        kind: "x_post", contentKind: "original_post", likes: 50, retweets: 10,
        promotionAuthority: {
          official: true, trusted: true, attestedBy: "source_catalog",
        },
      },
    }).authorityAttestation).toEqual({
      status: "attested",
      official: true,
      trusted: true,
      attestedBy: "source_catalog",
    });
  });

  it("carries catalog authority as provenance without bypassing rating", () => {
    const publishedAt = new Date("2026-08-14T12:00:00.000Z");
    const observedAt = new Date("2026-08-14T12:05:00.000Z");
    const ingestionCutoff = new Date("2026-08-15T00:00:00.000Z");
    const collected = {
      externalId: "x:tweet:1956000000000000001",
      canonicalUrl: "https://x.com/AnthropicAI/status/1956000000000000001",
      metadata: {
        kind: "x_post",
        contentKind: "original_post",
        likes: 0,
        reposts: 0,
        replies: 19,
        promotionMetricsState: "observed",
        promotionAuthority: {
          official: true,
          trusted: true,
          attestedBy: "source_catalog",
        },
      },
    } as const;
    const facts = readerPostPromotionFacts({
      providerKey: "x-twitter",
      canonicalUrl: collected.canonicalUrl,
      providerMetadata: collected.metadata,
      contentQuality: quality,
      safetyStatus: "allowed",
      publishedAt,
      observedAt,
      ingestionCutoff,
    });

    const promotion = selectReaderPostPromotions([{
      candidateId: collected.externalId,
      provider: "x-twitter",
      citationId: "citation:anthropic-official",
      publishedAt,
      observedAt,
      periodStart: new Date("2026-08-14T00:00:00.000Z"),
      periodEnd: ingestionCutoff,
      ingestionCutoff,
      qualityScore: quality.qualityScore,
      relevanceScore: quality.interestRelevanceScore,
      integrityScore: quality.engagementIntegrityScore,
      qualityValid: quality.eligibleForTopRead,
      citationValid: true,
      ...facts,
    }]);

    expect(facts.authorityAttestation).toMatchObject({
      status: "attested",
      official: true,
      trusted: true,
      attestedBy: "source_catalog",
    });
    expect(promotion.top).toEqual([]);
    expect(promotion.additional).toEqual([]);
  });

  it("does not let explicit observed state bypass conflicting X aliases", () => {
    const facts = readerPostPromotionFacts({
      providerKey: "x-twitter",
      canonicalUrl: "https://x.com/example/status/conflicting-observed",
      providerMetadata: {
        kind: "x_post",
        contentKind: "original_post",
        promotionMetricsState: "observed",
        likes: 50,
        reposts: 10,
        publicMetrics: { like_count: 51, retweet_count: 10 },
      },
      contentQuality: quality,
      safetyStatus: "allowed",
    });
    expect(facts.metricsState).toBe("conflict");
    expect(facts.metrics).toBeUndefined();
  });

  it("fails X content provenance closed when the source contract omits it", () => {
    const unknown = readerPostPromotionFacts({
      providerKey: "x-twitter",
      canonicalUrl: "https://x.com/example/status/1",
      providerMetadata: { kind: "x_post", likes: 100, reposts: 20 },
      contentQuality: quality,
      safetyStatus: "allowed",
    });
    const original = readerPostPromotionFacts({
      providerKey: "x-twitter",
      canonicalUrl: "https://x.com/example/status/1",
      providerMetadata: {
        kind: "x_post",
        contentKind: "original_post",
        likes: 100,
        reposts: 20,
      },
      contentQuality: quality,
      safetyStatus: "allowed",
    });

    expect(unknown.contentKind).toBe("unknown");
    expect(original.contentKind).toBe("original_post");
  });

  it("binds exactly the primary GitHub delta duration to checkedAt", () => {
    const facts = readerPostPromotionFacts({
      providerKey: "github-repo-radar",
      canonicalUrl: "https://github.com/example/repository",
      providerMetadata: {
        kind: "github_repository_trend",
        repository: { forksCount: 10 },
        trend: {
          primaryWindow: "24h",
          checkedAt: "2026-08-15T00:00:00.000Z",
          totalStars: 100,
          stars24h: 50,
          stars48h: 200,
          forks24h: 10,
          forks48h: 40,
        },
      },
      contentQuality: quality,
      safetyStatus: "allowed",
    });

    expect(facts.checkedAt).toEqual(new Date("2026-08-15T00:00:00.000Z"));
    expect(facts.metrics).toEqual({
      provider: "github_radar",
      snapshotKind: "repository_growth",
      windowStartedAt: new Date("2026-08-14T00:00:00.000Z"),
      windowEndedAt: new Date("2026-08-15T00:00:00.000Z"),
      starsDelta: 50,
      forksDelta: 10,
    });
  });

  it("fails freshness closed when typed provenance is absent", () => {
    expect(readerPostPromotionFacts({
      providerKey: "x-twitter",
      canonicalUrl: "https://x.com/example/status/unknown-freshness",
      providerMetadata: {
        kind: "x_post",
        contentKind: "original_post",
        likes: 100,
        reposts: 20,
      },
      contentQuality: quality,
      safetyStatus: "allowed",
    })).toMatchObject({
      freshnessValid: false,
      freshnessProvenance: { status: "unknown" },
    });
  });

  it("fails freshness closed when observation crosses the ingestion cutoff", () => {
    expect(readerPostPromotionFacts({
      providerKey: "x-twitter",
      canonicalUrl: "https://x.com/example/status/stale-freshness",
      providerMetadata: {
        kind: "x_post",
        contentKind: "original_post",
        likes: 100,
        reposts: 20,
      },
      contentQuality: quality,
      safetyStatus: "allowed",
      publishedAt: new Date("2026-08-14T00:00:00.000Z"),
      observedAt: new Date("2026-08-15T00:00:01.000Z"),
      ingestionCutoff: new Date("2026-08-15T00:00:00.000Z"),
    })).toMatchObject({
      freshnessValid: false,
      freshnessProvenance: { status: "observed" },
    });
  });
});
