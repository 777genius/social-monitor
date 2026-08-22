import type { JsonObject, JsonValue } from "@social-monitor/shared-kernel";

import { classifyFeedPromotionEligibility } from "./feed-promotion-eligibility";

describe("classifyFeedPromotionEligibility", () => {
  it.each([
    ["  X-Twitter  ", {
      kind: "x_post", contentKind: "original_post", likes: 1, reposts: 0,
    }, "x", "original_post"],
    ["TWITTER", {
      kind: "twitter_post", contentKind: "original_post", likes: 0, reposts: 0,
    }, "x", "original_post"],
    [" Reddit ", {
      kind: "reddit_post", score: 0, comments: 2,
    }, "reddit", "original_post"],
    ["HN", {
      kind: "hacker_news_story", points: 0, comments: 1,
    }, "hacker_news", "story"],
    [" github_radar ", {
      kind: "github_repository_trend",
      repository: { forksCount: 4 },
      trend: {
        primaryWindow: "24h",
        checkedAt: "2026-08-18T12:00:00.000Z",
        stars24h: 3,
        forks24h: 2,
      },
    }, "github", "repository"],
    ["GITHUB-REPO-RADAR", {
      kind: "github_repository_trend",
      repository: { forksCount: 4 },
      trend: {
        primaryWindow: "24h",
        checkedAt: "2026-08-18T12:00:00.000Z",
        stars24h: 3,
        forks24h: 2,
      },
    }, "github", "repository"],
  ] as const)(
    "normalizes and accepts validated %s originals",
    (providerKey, providerMetadata, providerFamily, contentKind) => {
      expect(classifyFeedPromotionEligibility({
        providerKey,
        providerMetadata,
      })).toMatchObject({
        eligible: true,
        providerFamily,
        contentKind,
      });
    },
  );

  it.each([
    ["x-twitter", undefined, "missing_metadata"],
    ["x-twitter", { kind: "x_post" }, "malformed_metadata"],
    ["x-twitter", {
      kind: "x_post", contentKind: "reply", likes: 10,
    }, "forbidden_content_kind"],
    ["x-twitter", {
      kind: "x_post", contentKind: "quote", likes: 10,
    }, "forbidden_content_kind"],
    ["reddit", {
      kind: "reddit_post", score: "10", comments: 2,
    }, "malformed_metadata"],
    ["reddit", {
      kind: "hacker_news_story", points: 10,
    }, "contradictory_kind"],
    ["hacker-news", {
      kind: "hacker_news_comment", points: 10,
    }, "forbidden_content_kind"],
    ["github-repo-radar", {
      kind: "github_repository_trend", repository: {}, trend: {},
    }, "malformed_metadata"],
    ["github-trending-page", {
      kind: "github_trending_page_repository",
    }, "appendix_only"],
    ["x-twitter", {
      kind: "x_post", contentKind: "original_post", bookmarks: 1_000,
    }, "malformed_metadata"],
  ] as const)(
    "fails closed for %s malformed or forbidden metadata",
    (providerKey, providerMetadata, reason) => {
      expect(classifyFeedPromotionEligibility({
        providerKey,
        providerMetadata,
      })).toMatchObject({ eligible: false, reason });
    },
  );

  it.each([
    "github",
    "github-repository",
    "github_repo_radar",
  ])("rejects undocumented GitHub alias %s", (providerKey) => {
    expect(classifyFeedPromotionEligibility({
      providerKey,
      providerMetadata: {
        kind: "github_repository_trend",
        repository: { forksCount: 1 },
        trend: {
          primaryWindow: "24h",
          checkedAt: "2026-08-18T12:00:00.000Z",
          stars24h: 1,
          forks24h: 1,
        },
      },
    })).toMatchObject({ eligible: false, reason: "unknown_provider" });
  });

  it.each(["x", "x-twitter", "twitter"])(
    "accepts documented X alias %s",
    (providerKey) => expect(classifyFeedPromotionEligibility({
      providerKey,
      providerMetadata: {
        kind: "x_post", contentKind: "original_post", likes: 1, reposts: 1,
      },
    }).eligible).toBe(true),
  );

  it.each(["hacker_news", "hacker-news", "hn"])(
    "accepts documented Hacker News alias %s",
    (providerKey) => expect(classifyFeedPromotionEligibility({
      providerKey,
      providerMetadata: { kind: "hacker_news_story", points: 1 },
    }).eligible).toBe(true),
  );

  it("rejects a contradictory secondary content kind", () => {
    expect(classifyFeedPromotionEligibility({
      providerKey: "reddit",
      providerMetadata: {
        kind: "reddit_post",
        contentType: "comment",
        score: 10,
        comments: 1,
      },
    })).toMatchObject({
      eligible: false,
      reason: "contradictory_kind",
      metricsState: "malformed",
    });
  });

  it("constructs canonical metrics directly from nested X aliases", () => {
    const result = classifyFeedPromotionEligibility({
      providerKey: "twitter",
      providerMetadata: {
        kind: "twitter_post",
        contentKind: "original_post",
        metrics: {
          likes: 11,
          retweets: 7,
          replies: 5,
          quotes: 3,
          bookmarks: 2,
          impressions: 101,
        },
      },
    });
    expect(result).toMatchObject({
      eligible: true,
      metrics: {
        kind: "x_post",
        likes: 11,
        reposts: 7,
      },
    });
  });

  it("preserves providerScore-only Reddit metrics and rejects negatives", () => {
    expect(classifyFeedPromotionEligibility({
      providerKey: "reddit",
      providerMetadata: {
        kind: "reddit_post",
        providerScore: 42,
        comments: 3,
      },
    })).toMatchObject({
      eligible: true,
      metrics: { kind: "reddit_post", score: 42 },
    });
    for (const field of ["score", "providerScore"] as const) {
      expect(classifyFeedPromotionEligibility({
        providerKey: "reddit",
        providerMetadata: { kind: "reddit_post", [field]: -1 },
      })).toMatchObject({
        eligible: false,
        metricsState: "malformed",
      });
    }
  });

  it("preserves the validated GitHub 48-hour star and fork window", () => {
    const result = classifyFeedPromotionEligibility({
      providerKey: "github-repo-radar",
      providerMetadata: {
        kind: "github_repository_trend",
        repository: { forksCount: 77 },
        trend: {
          primaryWindow: "48h",
          checkedAt: "2026-08-18T12:00:00.000Z",
          totalStars: 900,
          stars48h: 63,
          forks48h: 14,
        },
      },
    });
    expect(result).toMatchObject({
      eligible: true,
      metrics: {
        kind: "github_repository",
        stars: 900,
        forks: 77,
        trendingDelta: { window: "48h", value: 63 },
        forkTrendDeltas: [{ window: "48h", value: 14 }],
      },
    });
  });

  it.each(secondaryKindConflicts())(
    "rejects contradictory $providerKey $field metadata",
    ({ providerKey, providerMetadata }) => {
      expect(classifyFeedPromotionEligibility({
        providerKey,
        providerMetadata,
      })).toMatchObject({
        eligible: false,
        reason: "contradictory_kind",
      });
    },
  );

  it.each(xAliasConflicts())(
    "rejects conflicting X aliases $left/$right",
    ({ providerMetadata }) => {
      expect(classifyFeedPromotionEligibility({
        providerKey: "x-twitter",
        providerMetadata,
      })).toMatchObject({ eligible: false, metricsState: "conflict" });
    },
  );

  it.each(forbiddenEngagementCases())(
    "keeps $providerKey promotion exactly unchanged for arbitrary forbidden engagement",
    ({ providerKey, baseline, mutated }) => {
      const expected = classifyFeedPromotionEligibility({
        providerKey,
        providerMetadata: baseline,
      });
      expect(classifyFeedPromotionEligibility({
        providerKey,
        providerMetadata: mutated,
      })).toEqual(expected);
    },
  );

  it.each(["missing", "malformed", "conflict"] as const)(
    "derives canonical state independently of legacy aggregate state %s",
    (promotionMetricsState) => {
      expect(classifyFeedPromotionEligibility({
        providerKey: "hacker-news",
        providerMetadata: {
          kind: "hacker_news_story",
          points: 10,
          promotionMetricsState,
        },
      })).toMatchObject({ eligible: true, metricsState: "observed" });
    },
  );
});

function secondaryKindConflicts() { return [
  ...secondaryCases("x-twitter", {
    kind: "x_post", contentKind: "original_post", likes: 1, reposts: 1,
  }, "comment", ["contentType", "type", "postType"]),
  ...secondaryCases("reddit", {
    kind: "reddit_post", score: 1,
  }, "comment", ["contentKind", "contentType", "type", "postType"]),
  ...secondaryCases("hacker-news", {
    kind: "hacker_news_story", points: 1,
  }, "comment", ["contentKind", "contentType", "type", "postType"]),
  ...secondaryCases("github-repo-radar", {
    kind: "github_repository_trend",
    repository: {},
    trend: {
      primaryWindow: "24h",
      checkedAt: "2026-08-18T12:00:00.000Z",
      stars24h: 1,
      forks24h: 1,
    },
  }, "issue", ["contentKind", "contentType", "type", "postType"]),
]; }

function secondaryCases(
  providerKey: string,
  base: JsonObject,
  contradictory: string,
  fields: readonly string[],
) { return fields.map((field) => ({
  providerKey,
  field,
  providerMetadata: { ...base, [field]: contradictory },
})); }

function xAliasConflicts() { return [
  ...aliasConflictCases("likes", [
    "likes", "public_metrics.like_count", "public_metrics.likeCount",
    "publicMetrics.like_count", "publicMetrics.likeCount", "metrics.likes",
  ], { reposts: 1 }),
  ...aliasConflictCases("reposts", [
    "reposts", "retweets", "public_metrics.retweet_count",
    "public_metrics.retweetCount", "publicMetrics.retweet_count",
    "publicMetrics.retweetCount", "metrics.reposts", "metrics.retweets",
  ], { likes: 1 }),
]; }

function forbiddenEngagementCases() {
  const x = {
    kind: "x_post", contentKind: "original_post", likes: 20, reposts: 4,
  } as const;
  const reddit = { kind: "reddit_post", score: 42, upvoteRatio: 0.91 } as const;
  const hackerNews = { kind: "hacker_news_story", points: 81 } as const;
  return [
    { providerKey: "x-twitter", baseline: x, mutated: {
      ...x, replies: -1, quotes: "malformed", bookmarks: Number.MAX_VALUE,
      impressions: null, promotionMetricsState: "conflict",
      public_metrics: { reply_count: 1, replyCount: 999_999_999 },
      publicMetrics: { quote_count: {}, quoteCount: -500 },
      metrics: { replies: [], quotes: 8, bookmarks: "many", impressions: -1 },
    } },
    { providerKey: "reddit", baseline: reddit, mutated: {
      ...reddit, comments: -1, numComments: Number.MAX_VALUE,
      promotionMetricsState: "malformed",
    } },
    { providerKey: "hacker-news", baseline: hackerNews, mutated: {
      ...hackerNews, comments: { malformed: true },
      promotionMetricsState: "missing",
    } },
  ] satisfies readonly {
    readonly providerKey: string;
    readonly baseline: JsonObject;
    readonly mutated: JsonObject;
  }[];
}

function aliasConflictCases(
  metric: string,
  aliases: readonly string[],
  required: JsonObject,
) { return aliases.flatMap((left, leftIndex) => aliases.slice(leftIndex + 1)
  .map((right) => ({
    left: `${metric}:${left}`,
    right,
    providerMetadata: setAliases({
      kind: "x_post",
      contentKind: "original_post",
      ...required,
    }, [[left, 1], [right, 2]]),
  }))); }

function setAliases(
  base: JsonObject,
  values: readonly (readonly [string, number])[],
): JsonObject {
  const result = structuredClone(base) as MutableJsonObject;
  for (const [path, value] of values) {
    const parts = path.split(".");
    let target = result;
    for (const part of parts.slice(0, -1)) {
      target[part] ??= {};
      target = target[part] as MutableJsonObject;
    }
    target[parts.at(-1) as string] = value;
  }
  return result as JsonObject;
}

type MutableJsonObject = { [key: string]: JsonValue };
