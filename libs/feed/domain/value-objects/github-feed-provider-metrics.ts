import type { JsonObject, JsonValue } from '@social-monitor/shared-kernel';

import {
  githubRepositoryProviderSourceKey,
  githubTrendingPageProviderSourceKey,
  type GitHubTrendingPageWindow,
} from './feed-provider-source-keys';

export type FeedMetricDelta = {
  readonly window: string;
  readonly value: number;
};

export type GitHubRepositoryMetrics = {
  readonly kind: 'github_repository';
  readonly providerKey: 'github-repo-radar';
  readonly sourceKey: string;
  readonly contentType: 'repository';
  readonly evidenceSource: 'gh_archive_watch_event';
  readonly evidenceLabel: string;
  readonly stars: number;
  readonly forks: number;
  readonly checkedAt?: string;
  readonly source?: string;
  readonly trendingDelta: FeedMetricDelta;
  readonly trendDeltas: readonly FeedMetricDelta[];
};

export type GitHubTrendingRepositoryScope = {
  readonly programmingLanguage?: string;
  readonly spokenLanguage?: string;
};

export type GitHubTrendingRepositoryAppearanceMetrics = {
  readonly rank: number;
  readonly starsGained: number;
  readonly window: GitHubTrendingPageWindow;
  readonly capturedAt?: string;
  readonly scope: GitHubTrendingRepositoryScope;
};

export type GitHubTrendingRepositoryMetrics = {
  readonly kind: 'github_trending_repository';
  readonly providerKey: 'github-trending-page';
  readonly sourceKey: string;
  readonly contentType: 'repository';
  readonly stars: number;
  readonly forks: number;
  readonly rank: number;
  readonly starsGained: number;
  readonly window: GitHubTrendingPageWindow;
  readonly capturedAt?: string;
  readonly scope: GitHubTrendingRepositoryScope;
  readonly appearances: readonly GitHubTrendingRepositoryAppearanceMetrics[];
};

export const githubRepositoryMetricsFromMetadata = (
  metadata: JsonObject | undefined,
): GitHubRepositoryMetrics | undefined => {
  if (metadata?.kind !== 'github_repository_trend') return undefined;
  const repository = readObject(metadata.repository);
  const trend = readObject(metadata.trend);
  const sourceCohort = readObject(metadata.sourceCohort);
  if (repository === undefined || trend === undefined) return undefined;
  const primaryWindow = readString(trend.primaryWindow) ?? '48h';

  return {
    kind: 'github_repository',
    providerKey: 'github-repo-radar',
    sourceKey: githubRepositoryProviderSourceKey({
      primaryWindow,
      query: readString(sourceCohort?.query),
      languages: readStringArray(sourceCohort?.languages),
      fallbackLanguage: readString(repository.language),
      topics: readStringArray(sourceCohort?.topics),
      fallbackTopics: readStringArray(repository.topics),
    }),
    contentType: 'repository',
    evidenceSource: 'gh_archive_watch_event',
    evidenceLabel: 'GH Archive WatchEvent - hourly updated',
    stars: readNonNegativeInteger(trend.totalStars) ?? 0,
    forks: readNonNegativeInteger(repository.forksCount) ?? 0,
    checkedAt: readString(trend.checkedAt),
    source: readString(trend.source),
    trendingDelta: {
      window: primaryWindow,
      value: githubTrendDelta(trend, primaryWindow),
    },
    trendDeltas: githubTrendDeltas(trend),
  };
};

export const githubTrendingRepositoryMetricsFromMetadata = (
  metadata: JsonObject | undefined,
): GitHubTrendingRepositoryMetrics | undefined => {
  if (metadata?.kind !== 'github_trending_page_repository') return undefined;
  const repository = readObject(metadata.repository);
  const trending = readObject(metadata.trending);
  if (repository === undefined || trending === undefined) return undefined;
  const window = readTrendingPageWindow(trending.window);
  const capturedAt = readString(trending.capturedAt ?? trending.checkedAt);
  const scope = readTrendingScope(
    trending.scope,
    readString(repository.language),
  );
  const rank = readPositiveInteger(trending.rank) ?? 1;
  const starsGained = readNonNegativeInteger(trending.starsGained) ?? 0;
  const appearances = readAppearances(trending.appearances);

  return {
    kind: 'github_trending_repository',
    providerKey: 'github-trending-page',
    sourceKey: githubTrendingPageProviderSourceKey({
      window,
      programmingLanguage: scope.programmingLanguage,
      spokenLanguage: scope.spokenLanguage,
    }),
    contentType: 'repository',
    stars: readNonNegativeInteger(repository.totalStars) ?? 0,
    forks: readNonNegativeInteger(repository.forksCount) ?? 0,
    rank,
    starsGained,
    window,
    capturedAt,
    scope,
    appearances:
      appearances.length === 0
        ? [{ rank, starsGained, window, capturedAt, scope }]
        : appearances,
  };
};

const readAppearances = (
  value: JsonValue | undefined,
): readonly GitHubTrendingRepositoryAppearanceMetrics[] =>
  Array.isArray(value)
    ? value.flatMap((candidate) => {
        const appearance = readObject(candidate);
        return appearance === undefined
          ? []
          : [
              {
                rank: readPositiveInteger(appearance.rank) ?? 1,
                starsGained:
                  readNonNegativeInteger(appearance.starsGained) ?? 0,
                window: readTrendingPageWindow(appearance.window),
                capturedAt: readString(appearance.capturedAt),
                scope: readTrendingScope(appearance.scope),
              },
            ];
      })
    : [];

const readTrendingScope = (
  value: JsonValue | undefined,
  fallbackProgrammingLanguage?: string,
): GitHubTrendingRepositoryScope => {
  const scope = readObject(value);
  const programmingLanguage =
    readString(scope?.programmingLanguage) ??
    (scope === undefined ? fallbackProgrammingLanguage : undefined);
  const spokenLanguage = readString(scope?.spokenLanguage);
  return {
    ...(programmingLanguage === undefined ? {} : { programmingLanguage }),
    ...(spokenLanguage === undefined ? {} : { spokenLanguage }),
  };
};

const githubTrendDeltas = (trend: JsonObject): readonly FeedMetricDelta[] =>
  (
    [
      ['24h', 'stars24h'],
      ['48h', 'stars48h'],
      ['7d', 'stars7d'],
      ['30d', 'stars30d'],
      ['90d', 'stars90d'],
    ] as const
  ).map(([window, field]) => ({
    window,
    value: readNonNegativeInteger(trend[field]) ?? 0,
  }));

const githubTrendDelta = (trend: JsonObject, primaryWindow: string): number => {
  const fields: Readonly<Record<string, string>> = {
    '24h': 'stars24h',
    '48h': 'stars48h',
    '7d': 'stars7d',
    '30d': 'stars30d',
    '90d': 'stars90d',
  };
  const field = fields[primaryWindow] ?? 'stars48h';
  return readNonNegativeInteger(trend[field]) ?? 0;
};

const readTrendingPageWindow = (
  value: JsonValue | undefined,
): GitHubTrendingPageWindow =>
  value === 'weekly' || value === 'monthly' ? value : 'daily';

const readStringArray = (value: JsonValue | undefined): readonly string[] =>
  Array.isArray(value)
    ? value.map(readString).filter((item): item is string => item !== undefined)
    : [];
const readObject = (value: JsonValue | undefined): JsonObject | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
const readString = (value: JsonValue | undefined): string | undefined =>
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
const readNonNegativeInteger = (
  value: JsonValue | undefined,
): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
const readPositiveInteger = (
  value: JsonValue | undefined,
): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined;
