import { normalizeJsonObject, type JsonObject } from '@social-monitor/shared-kernel';

export const GITHUB_REPO_RADAR_PROVIDER_KEY = 'github-repo-radar';
export const GITHUB_REPOSITORY_TREND_METADATA_KIND = 'github_repository_trend';

export const githubRepositoryTrendWindows = ['24h', '7d', '30d', '90d'] as const;

export type GitHubRepositoryTrendWindow = (typeof githubRepositoryTrendWindows)[number];

export type GitHubRepositoryTrendMetadataInput = {
  readonly repository: {
    readonly fullName: string;
    readonly url: string;
    readonly description?: string;
    readonly language?: string;
    readonly topics: readonly string[];
    readonly license?: string;
  };
  readonly trend: {
    readonly totalStars: number;
    readonly stars24h: number;
    readonly stars7d: number;
    readonly stars30d: number;
    readonly stars90d: number;
    readonly rank: number;
    readonly primaryWindow: GitHubRepositoryTrendWindow;
    readonly checkedAt: Date;
    readonly source: 'gh_archive_bigquery_plus_github_live' | 'fixture_gh_archive_plus_github_live';
  };
};

export type GitHubRepositoryTrendMetadata = {
  readonly kind: typeof GITHUB_REPOSITORY_TREND_METADATA_KIND;
  readonly repository: {
    readonly fullName: string;
    readonly url: string;
    readonly description?: string;
    readonly language?: string;
    readonly topics: readonly string[];
    readonly license?: string;
  };
  readonly trend: {
    readonly totalStars: number;
    readonly stars24h: number;
    readonly stars7d: number;
    readonly stars30d: number;
    readonly stars90d: number;
    readonly rank: number;
    readonly primaryWindow: GitHubRepositoryTrendWindow;
    readonly checkedAt: string;
    readonly source: string;
  };
};

export const githubRepositoryTrendMetadata = (
  input: GitHubRepositoryTrendMetadataInput,
): JsonObject => normalizeJsonObject({
  kind: GITHUB_REPOSITORY_TREND_METADATA_KIND,
  repository: {
    fullName: input.repository.fullName,
    url: input.repository.url,
    description: input.repository.description,
    language: input.repository.language,
    topics: [...input.repository.topics],
    license: input.repository.license,
  },
  trend: {
    totalStars: input.trend.totalStars,
    stars24h: input.trend.stars24h,
    stars7d: input.trend.stars7d,
    stars30d: input.trend.stars30d,
    stars90d: input.trend.stars90d,
    rank: input.trend.rank,
    primaryWindow: input.trend.primaryWindow,
    checkedAt: input.trend.checkedAt.toISOString(),
    source: input.trend.source,
  },
});

export const parseGitHubRepositoryTrendMetadata = (
  value: JsonObject | undefined,
): GitHubRepositoryTrendMetadata | null => {
  if (value?.kind !== GITHUB_REPOSITORY_TREND_METADATA_KIND) {
    return null;
  }

  const repository = readRecord(value.repository);
  const trend = readRecord(value.trend);

  if (repository === null || trend === null) {
    return null;
  }

  const fullName = readString(repository.fullName);
  const url = readString(repository.url);
  const checkedAt = readString(trend.checkedAt);
  const primaryWindow = readTrendWindow(trend.primaryWindow);

  if (fullName === undefined || url === undefined || checkedAt === undefined || primaryWindow === undefined) {
    return null;
  }

  return {
    kind: GITHUB_REPOSITORY_TREND_METADATA_KIND,
    repository: {
      fullName,
      url,
      description: readString(repository.description),
      language: readString(repository.language),
      topics: readStringArray(repository.topics),
      license: readString(repository.license),
    },
    trend: {
      totalStars: readNonNegativeInteger(trend.totalStars),
      stars24h: readNonNegativeInteger(trend.stars24h),
      stars7d: readNonNegativeInteger(trend.stars7d),
      stars30d: readNonNegativeInteger(trend.stars30d),
      stars90d: readNonNegativeInteger(trend.stars90d),
      rank: readPositiveInteger(trend.rank),
      primaryWindow,
      checkedAt,
      source: readString(trend.source) ?? 'unknown',
    },
  };
};

const readRecord = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const readStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

const readTrendWindow = (value: unknown): GitHubRepositoryTrendWindow | undefined =>
  githubRepositoryTrendWindows.includes(value as GitHubRepositoryTrendWindow)
    ? value as GitHubRepositoryTrendWindow
    : undefined;

const readNonNegativeInteger = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;

const readPositiveInteger = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1;
