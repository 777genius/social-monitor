import type { JsonObject, JsonValue } from "@social-monitor/shared-kernel";
import {
  githubRepositoryProviderSourceKey,
  githubTrendingPageProviderSourceKey,
  type GitHubTrendingPageWindow,
} from "./feed-provider-source-keys";
import type {
  FeedMetricDelta,
  GitHubRepositoryMetrics,
  GitHubTrendingRepositoryMetrics,
} from "./feed-provider-metrics";

export const githubRepositoryMetrics = (
  metadata: JsonObject | undefined,
): GitHubRepositoryMetrics | undefined => {
  if (metadata?.kind !== "github_repository_trend") {
    return undefined;
  }

  const repository = readObject(metadata.repository);
  const trend = readObject(metadata.trend);
  const sourceCohort = readObject(metadata.sourceCohort);

  if (repository === undefined || trend === undefined) {
    return undefined;
  }

  const primaryWindow = readString(trend.primaryWindow) ?? "48h";
  const delta = githubTrendDelta(trend, primaryWindow);

  return {
    kind: "github_repository",
    providerKey: "github-repo-radar",
    sourceKey: githubRepositoryProviderSourceKey({
      primaryWindow,
      query: readString(sourceCohort?.query),
      languages: readStringArray(sourceCohort?.languages),
      fallbackLanguage: readString(repository.language),
      topics: readStringArray(sourceCohort?.topics),
      fallbackTopics: readStringArray(repository.topics),
    }),
    contentType: "repository",
    evidenceSource: "gh_archive_watch_event",
    evidenceLabel: "GH Archive WatchEvent - hourly updated",
    stars: readNonNegativeInteger(trend.totalStars) ?? 0,
    forks: readNonNegativeInteger(repository.forksCount) ?? 0,
    checkedAt: readString(trend.checkedAt),
    source: readString(trend.source),
    trendingDelta: {
      window: primaryWindow,
      ...(delta.value === undefined ? {} : { value: delta.value }),
      observation: delta.observation,
    },
    trendDeltas: githubTrendDeltas(trend),
    forkTrendDeltas: githubForkTrendDeltas(trend),
  };
};

export const githubTrendingRepositoryMetrics = (
  metadata: JsonObject | undefined,
): GitHubTrendingRepositoryMetrics | undefined => {
  if (metadata?.kind !== "github_trending_page_repository") {
    return undefined;
  }

  const repository = readObject(metadata.repository);
  const trending = readObject(metadata.trending);

  if (repository === undefined || trending === undefined) {
    return undefined;
  }

  const window = readTrendingPageWindow(trending.window);

  return {
    kind: "github_trending_repository",
    providerKey: "github-trending-page",
    sourceKey: githubTrendingPageProviderSourceKey({
      window,
      language: readString(repository.language),
    }),
    contentType: "repository",
    stars: readNonNegativeInteger(repository.totalStars) ?? 0,
    forks: readNonNegativeInteger(repository.forksCount) ?? 0,
    rank: readPositiveInteger(trending.rank) ?? 1,
    starsGained: readNonNegativeInteger(trending.starsGained) ?? 0,
    window,
  };
};

const githubTrendDeltas = (trend: JsonObject): readonly FeedMetricDelta[] =>
  (
    [
      ["24h", "stars24h"],
      ["48h", "stars48h"],
      ["7d", "stars7d"],
      ["30d", "stars30d"],
      ["90d", "stars90d"],
    ] as const
  ).map(([window, field]) => {
    const value = readNonNegativeInteger(trend[field]);
    return {
      window,
      ...(value === undefined ? {} : { value }),
      observation: trend[field] === undefined
        ? "missing" as const
        : value === undefined
          ? "malformed" as const
          : "observed" as const,
    };
  });

const githubForkTrendDeltas = (trend: JsonObject): readonly FeedMetricDelta[] =>
  ([
    ["24h", "forks24h"],
    ["48h", "forks48h"],
    ["7d", "forks7d"],
    ["30d", "forks30d"],
    ["90d", "forks90d"],
  ] as const).map(([window, field]) => {
    const value = readNonNegativeInteger(trend[field]);
    return {
      window,
      ...(value === undefined ? {} : { value }),
      observation: trend[field] === undefined
        ? "missing" as const
        : value === undefined ? "malformed" as const : "observed" as const,
    };
  });

const readTrendingPageWindow = (
  value: JsonValue | undefined,
): GitHubTrendingPageWindow =>
  value === "weekly" || value === "monthly" ? value : "daily";

const githubTrendDelta = (
  trend: JsonObject,
  primaryWindow: string,
): { readonly value?: number; readonly observation: "observed" | "missing" | "malformed" } => {
  const trendField =
    {
      "24h": "stars24h",
      "48h": "stars48h",
      "7d": "stars7d",
      "30d": "stars30d",
      "90d": "stars90d",
    }[primaryWindow] ?? "stars48h";

  const raw = trend[trendField];
  const value = readNonNegativeInteger(raw);
  return {
    ...(value === undefined ? {} : { value }),
    observation: raw === undefined ? "missing" : value === undefined ? "malformed" : "observed",
  };
};

const readStringArray = (value: JsonValue | undefined): readonly string[] =>
  Array.isArray(value)
    ? value
        .map((item) => readString(item))
        .filter((item): item is string => item !== undefined)
    : [];

const readObject = (value: JsonValue | undefined): JsonObject | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;

const readString = (value: JsonValue | undefined): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const readNonNegativeInteger = (
  value: JsonValue | undefined,
): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;

const readPositiveInteger = (
  value: JsonValue | undefined,
): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
