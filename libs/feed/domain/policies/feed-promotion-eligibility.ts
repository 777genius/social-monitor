import {
  readerPromotionProviderFamily,
  type JsonObject,
  type JsonValue,
} from "@social-monitor/shared-kernel";

import {
  feedProviderMetricStrength,
  type GitHubRepositoryMetrics,
  type HackerNewsStoryMetrics,
  type RedditPostMetrics,
  type XPostMetrics,
} from "../value-objects/feed-provider-metrics";
import {
  githubRepositoryProviderSourceKey,
  hackerNewsProviderSourceKey,
  redditProviderSourceKey,
  xProviderSourceKey,
} from "../value-objects/feed-provider-source-keys";

export type FeedPromotionProviderFamily = "x" | "reddit" |
  "hacker_news" | "github";
export type FeedPromotionMetricsState =
  "observed" | "missing" | "malformed" | "conflict";
export type FeedPromotionCanonicalMetrics =
  | Omit<XPostMetrics, "replies" | "quotes" | "bookmarks" | "impressions">
  | Omit<RedditPostMetrics, "comments">
  | Omit<HackerNewsStoryMetrics, "comments">
  | GitHubRepositoryMetrics;

type EligiblePromotion = {
  readonly eligible: true;
  readonly providerFamily: FeedPromotionProviderFamily;
  readonly canonicalProviderKey:
    "x-twitter" | "reddit" | "hacker-news" | "github-repo-radar";
  readonly contentKind: "original_post" | "story" | "repository";
  readonly metricsState: "observed";
  readonly metrics: FeedPromotionCanonicalMetrics;
  readonly authorityAttestation?: {
    readonly status: "attested";
    readonly official: boolean;
    readonly trusted: boolean;
    readonly attestedBy: "producer" | "source_catalog";
  };
};

export type FeedPromotionEligibility = EligiblePromotion | {
  readonly eligible: false;
  readonly reason: "appendix_only" | "unknown_provider" |
    "missing_metadata" | "contradictory_kind" |
    "forbidden_content_kind" | "malformed_metadata";
  readonly metricsState: FeedPromotionMetricsState;
};

export const classifyFeedPromotionEligibility = (params: {
  readonly providerKey: string;
  readonly providerMetadata?: JsonObject;
}): FeedPromotionEligibility => {
  const normalizedKey = params.providerKey.trim().toLocaleLowerCase("en-US");
  if (normalizedKey === "github-trending-page") {
    return rejected("appendix_only", "missing");
  }
  const family = readerPromotionProviderFamily(normalizedKey);
  if (family === undefined) return rejected("unknown_provider", "missing");
  if (params.providerMetadata === undefined) {
    return rejected("missing_metadata", "missing");
  }
  switch (family) {
    case "x": return classifyX(params.providerMetadata);
    case "reddit": return classifyReddit(params.providerMetadata);
    case "hacker_news": return classifyHackerNews(params.providerMetadata);
    case "github_radar": return classifyGitHub(params.providerMetadata);
  }
};

export const isFeedPromotionEligible = (
  params: Parameters<typeof classifyFeedPromotionEligibility>[0],
): boolean => classifyFeedPromotionEligibility(params).eligible;

const classifyX = (metadata: JsonObject): FeedPromotionEligibility => {
  if (metadata.kind !== "x_post" && metadata.kind !== "twitter_post") {
    return badKind(metadata.kind);
  }
  if (metadata.contentKind !== "original_post") {
    return rejected(
      metadata.contentKind === "reply" || metadata.contentKind === "quote"
        ? "forbidden_content_kind"
        : "malformed_metadata",
      "malformed",
    );
  }
  if (hasContradictorySecondaryKind(metadata, [
    "original_post", "post", "x_post", "twitter_post",
  ])) return rejected("contradictory_kind", "malformed");
  const publicSnake = object(metadata.public_metrics);
  const publicCamel = object(metadata.publicMetrics);
  const nested = object(metadata.metrics);
  if (invalidObject(metadata.public_metrics, publicSnake) ||
      invalidObject(metadata.publicMetrics, publicCamel) ||
      invalidObject(metadata.metrics, nested)) {
    return rejected("malformed_metadata", "malformed");
  }
  const likes = countAliases([
    metadata.likes, publicSnake?.like_count, publicSnake?.likeCount,
    publicCamel?.like_count, publicCamel?.likeCount, nested?.likes,
  ]);
  const reposts = countAliases([
    metadata.reposts, metadata.retweets,
    publicSnake?.retweet_count, publicSnake?.retweetCount,
    publicCamel?.retweet_count, publicCamel?.retweetCount,
    nested?.reposts, nested?.retweets,
  ]);
  const authorityAttestation = promotionAuthority(metadata.promotionAuthority);
  const state = combineAll([
    likes, reposts, authorityAttestation,
  ]);
  if (state !== "observed" || likes.value === undefined ||
      reposts.value === undefined) return rejected("malformed_metadata", state);
  return eligible("x", "x-twitter", "original_post", {
    kind: "x_post",
    providerKey: "x-twitter",
    sourceKey: xProviderSourceKey({
      account: stringValue(metadata.accountHandle ?? metadata.authorHandle),
      topic: stringValue(metadata.topic),
      searchQuery: stringValue(metadata.searchQuery),
    }),
    contentType: "post",
    likes: likes.value,
    reposts: reposts.value,
  }, authorityAttestation.value);
};

const classifyReddit = (metadata: JsonObject): FeedPromotionEligibility => {
  if (metadata.kind !== "reddit_post") {
    return metadata.kind === "reddit_comment"
      ? rejected("forbidden_content_kind", "malformed")
      : badKind(metadata.kind);
  }
  if (hasContradictorySecondaryKind(metadata, ["original_post", "post"])) {
    return rejected("contradictory_kind", "malformed");
  }
  const score = countAliases([metadata.score, metadata.providerScore]);
  const ratio = optionalRatio(metadata.upvoteRatio);
  const authorityAttestation = promotionAuthority(metadata.promotionAuthority);
  const state = combineAll([score, ratio, authorityAttestation]);
  if (state !== "observed" || score.value === undefined) {
    return rejected("malformed_metadata", state);
  }
  return eligible("reddit", "reddit", "original_post", {
    kind: "reddit_post",
    providerKey: "reddit",
    sourceKey: redditProviderSourceKey(stringValue(metadata.subreddit)),
    contentType: "post",
    score: score.value,
    ...(ratio.value === undefined ? {} : { upvoteRatio: ratio.value }),
  }, authorityAttestation.value);
};

const classifyHackerNews = (
  metadata: JsonObject,
): FeedPromotionEligibility => {
  if (metadata.kind !== "hacker_news_story") {
    return metadata.kind === "hacker_news_comment"
      ? rejected("forbidden_content_kind", "malformed")
      : badKind(metadata.kind);
  }
  if (hasContradictorySecondaryKind(metadata, ["story"])) {
    return rejected("contradictory_kind", "malformed");
  }
  const points = countAliases([metadata.points]);
  const authorityAttestation = promotionAuthority(metadata.promotionAuthority);
  const state = combineAll([points, authorityAttestation]);
  if (state !== "observed" || points.value === undefined) {
    return rejected("malformed_metadata", state);
  }
  return eligible("hacker_news", "hacker-news", "story", {
    kind: "hacker_news_story",
    providerKey: "hacker-news",
    sourceKey: hackerNewsProviderSourceKey(stringValue(metadata.source)),
    contentType: "story",
    points: points.value,
  }, authorityAttestation.value);
};

const classifyGitHub = (metadata: JsonObject): FeedPromotionEligibility => {
  if (metadata.kind === "github_trending_page_repository") {
    return rejected("appendix_only", "missing");
  }
  if (metadata.kind !== "github_repository_trend") return badKind(metadata.kind);
  if (hasContradictorySecondaryKind(metadata, ["repository"])) {
    return rejected("contradictory_kind", "malformed");
  }
  const repository = object(metadata.repository);
  const trend = object(metadata.trend);
  if (repository === undefined || trend === undefined) {
    return rejected("malformed_metadata", "missing");
  }
  const window = trend.primaryWindow;
  if ((window !== "24h" && window !== "48h") ||
      typeof trend.checkedAt !== "string" || !validIsoDate(trend.checkedAt)) {
    return rejected("malformed_metadata", "malformed");
  }
  const stars = countAliases([
    trend[window === "24h" ? "stars24h" : "stars48h"],
  ]);
  const forks = countAliases([
    trend[window === "24h" ? "forks24h" : "forks48h"],
  ]);
  const totalStars = optionalCountAliases([trend.totalStars]);
  const totalForks = optionalCountAliases([repository.forksCount]);
  const authorityAttestation = promotionAuthority(metadata.promotionAuthority);
  const state = combineAll([
    stars, forks, totalStars, totalForks, authorityAttestation,
  ]);
  if (state !== "observed" || stars.value === undefined ||
      forks.value === undefined) return rejected("malformed_metadata", state);
  const delta = { window, value: stars.value, observation: "observed" as const };
  const forkDelta = {
    window,
    value: forks.value,
    observation: "observed" as const,
  };
  const sourceCohort = object(metadata.sourceCohort);
  return eligible("github", "github-repo-radar", "repository", {
    kind: "github_repository",
    providerKey: "github-repo-radar",
    sourceKey: githubRepositoryProviderSourceKey({
      primaryWindow: window,
      languages: stringArray(sourceCohort?.languages),
      fallbackLanguage: stringValue(repository.language),
      topics: stringArray(sourceCohort?.topics),
      fallbackTopics: stringArray(repository.topics),
      query: stringValue(sourceCohort?.query),
    }),
    contentType: "repository",
    evidenceSource: "gh_archive_watch_event",
    evidenceLabel: "GH Archive WatchEvent - hourly updated",
    stars: totalStars.value ?? 0,
    forks: totalForks.value ?? 0,
    checkedAt: trend.checkedAt,
    source: stringValue(trend.source),
    trendingDelta: delta,
    trendDeltas: [delta],
    forkTrendDeltas: [forkDelta],
  }, authorityAttestation.value);
};

const eligible = (
  providerFamily: FeedPromotionProviderFamily,
  canonicalProviderKey: EligiblePromotion["canonicalProviderKey"],
  contentKind: EligiblePromotion["contentKind"],
  metrics: FeedPromotionCanonicalMetrics,
  authorityAttestation?: EligiblePromotion["authorityAttestation"],
): FeedPromotionEligibility => ({
  eligible: true,
  providerFamily,
  canonicalProviderKey,
  contentKind,
  metricsState: "observed",
  metrics,
  ...(authorityAttestation === undefined ? {} : { authorityAttestation }),
});

export const feedPromotionMetricStrength = (
  metrics: FeedPromotionCanonicalMetrics,
): number => {
  switch (metrics.kind) {
    case "x_post":
      return Math.log1p((metrics.likes ?? 0) + (metrics.reposts ?? 0) * 2);
    case "reddit_post": {
      const ratioBoost = metrics.upvoteRatio === undefined
        ? 0
        : Math.max(-0.4, Math.min(0.4, metrics.upvoteRatio - 0.5));
      return Math.max(
        0,
        Math.log1p(Math.max(0, metrics.score)) * 0.65 + ratioBoost,
      );
    }
    case "hacker_news_story":
      return Math.log1p(metrics.points);
    case "github_repository":
      return feedProviderMetricStrength(metrics);
  }
};

const promotionAuthority = (
  value: JsonValue | undefined,
): ParsedMetric<EligiblePromotion["authorityAttestation"] | undefined> => {
  if (value === undefined) return { state: "observed", value: undefined };
  const authority = object(value);
  if (authority === undefined ||
      (authority.attestedBy !== "producer" &&
        authority.attestedBy !== "source_catalog") ||
      typeof authority.official !== "boolean" ||
      typeof authority.trusted !== "boolean") {
    return { state: "malformed" };
  }
  return {
    state: "observed",
    value: {
      status: "attested",
      official: authority.official,
      trusted: authority.trusted,
      attestedBy: authority.attestedBy,
    },
  };
};

const hasContradictorySecondaryKind = (
  metadata: JsonObject,
  allowed: readonly string[],
): boolean => [metadata.contentKind, metadata.contentType, metadata.type,
  metadata.postType]
  .filter((value) => value !== undefined)
  .some((value) => typeof value !== "string" || !allowed.includes(value));

type ParsedMetric<T> = {
  readonly state: FeedPromotionMetricsState;
  readonly value?: T;
};

const countAliases = (
  values: readonly (JsonValue | undefined)[],
): ParsedMetric<number> => {
  const present = values.filter((value) => value !== undefined);
  if (present.length === 0) return { state: "missing" };
  if (present.some((value) => typeof value !== "number" ||
      !Number.isSafeInteger(value) || value < 0)) {
    return { state: "malformed" };
  }
  const numbers = present as number[];
  if (new Set(numbers).size !== 1) return { state: "conflict" };
  return { state: "observed", value: numbers[0] };
};
const optionalCountAliases = (
  values: readonly (JsonValue | undefined)[],
): ParsedMetric<number | undefined> => values.every((value) => value === undefined)
  ? { state: "observed", value: undefined }
  : countAliases(values);
const optionalRatio = (value: JsonValue | undefined): ParsedMetric<number> =>
  value === undefined
    ? { state: "observed" }
    : typeof value === "number" && Number.isFinite(value) &&
        value >= 0 && value <= 1
      ? { state: "observed", value }
      : { state: "malformed" };
const combine = (
  left: ParsedMetric<unknown> | FeedPromotionMetricsState,
  right: ParsedMetric<unknown> | FeedPromotionMetricsState,
): FeedPromotionMetricsState => {
  const leftState = typeof left === "string" ? left : left.state;
  const rightState = typeof right === "string" ? right : right.state;
  if (leftState === "conflict" || rightState === "conflict") return "conflict";
  if (leftState === "malformed" || rightState === "malformed") return "malformed";
  if (leftState === "missing" || rightState === "missing") return "missing";
  return "observed";
};
const combineAll = (
  values: readonly ParsedMetric<unknown>[],
): FeedPromotionMetricsState => values.reduce<FeedPromotionMetricsState>(
  (state, value) => combine(state, value),
  "observed",
);

const rejected = (
  reason: Extract<FeedPromotionEligibility, { eligible: false }>["reason"],
  metricsState: FeedPromotionMetricsState,
): FeedPromotionEligibility => ({ eligible: false, reason, metricsState });
const badKind = (kind: JsonValue | undefined): FeedPromotionEligibility =>
  rejected(kind === undefined || typeof kind !== "string"
    ? "malformed_metadata" : "contradictory_kind", "malformed");
const object = (value: JsonValue | undefined): JsonObject | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject : undefined;
const invalidObject = (
  raw: JsonValue | undefined,
  parsed: JsonObject | undefined,
): boolean => raw !== undefined && parsed === undefined;
const stringValue = (value: JsonValue | undefined): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
const stringArray = (value: JsonValue | undefined): readonly string[] =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        const parsed = stringValue(item);
        return parsed === undefined ? [] : [parsed];
      })
    : [];
const validIsoDate = (value: string): boolean => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};
