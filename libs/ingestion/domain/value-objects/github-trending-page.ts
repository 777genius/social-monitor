import {
  normalizeJsonObject,
  type JsonObject,
} from '@social-monitor/shared-kernel';

export const GITHUB_TRENDING_PAGE_PROVIDER_KEY = 'github-trending-page';
export const GITHUB_TRENDING_PAGE_REPOSITORY_METADATA_KIND =
  'github_trending_page_repository';

export const githubTrendingPageWindows = [
  'daily',
  'weekly',
  'monthly',
] as const;

export type GitHubTrendingPageWindow =
  (typeof githubTrendingPageWindows)[number];

export type GitHubTrendingPageScope = {
  readonly programmingLanguage?: string;
  readonly spokenLanguage?: string;
};

export type GitHubTrendingPageAppearanceInput = {
  readonly rank: number;
  readonly starsGained: number;
  readonly window: GitHubTrendingPageWindow;
  readonly capturedAt: Date;
  readonly scope: GitHubTrendingPageScope;
};

export type GitHubTrendingPageAppearance = {
  readonly rank: number;
  readonly starsGained: number;
  readonly window: GitHubTrendingPageWindow;
  readonly capturedAt: string;
  readonly scope: GitHubTrendingPageScope;
};

export type GitHubTrendingPageRepositoryMetadataInput = {
  readonly repository: {
    readonly fullName: string;
    readonly url: string;
    readonly description?: string;
    readonly language?: string;
    readonly totalStars: number;
    readonly forksCount?: number;
  };
  readonly trending: {
    readonly rank: number;
    readonly starsGained: number;
    readonly window: GitHubTrendingPageWindow;
    readonly checkedAt: Date;
    readonly capturedAt?: Date;
    readonly scope?: GitHubTrendingPageScope;
    readonly appearances?: readonly GitHubTrendingPageAppearanceInput[];
    readonly source: 'github_trending_html' | 'fixture_github_trending_html';
  };
};

export type GitHubTrendingPageRepositoryMetadata = {
  readonly kind: typeof GITHUB_TRENDING_PAGE_REPOSITORY_METADATA_KIND;
  readonly repository: {
    readonly fullName: string;
    readonly url: string;
    readonly description?: string;
    readonly language?: string;
    readonly totalStars: number;
    readonly forksCount: number;
  };
  readonly trending: {
    readonly rank: number;
    readonly starsGained: number;
    readonly window: GitHubTrendingPageWindow;
    readonly checkedAt: string;
    readonly capturedAt: string;
    readonly scope: GitHubTrendingPageScope;
    readonly appearances: readonly GitHubTrendingPageAppearance[];
    readonly source: string;
  };
};

export const githubTrendingPageRepositoryMetadata = (
  input: GitHubTrendingPageRepositoryMetadataInput,
): JsonObject =>
  normalizeJsonObject({
    kind: GITHUB_TRENDING_PAGE_REPOSITORY_METADATA_KIND,
    repository: {
      fullName: input.repository.fullName,
      url: input.repository.url,
      ...(input.repository.description === undefined
        ? {}
        : { description: input.repository.description }),
      ...(input.repository.language === undefined
        ? {}
        : { language: input.repository.language }),
      totalStars: input.repository.totalStars,
      forksCount: input.repository.forksCount ?? 0,
    },
    trending: {
      rank: input.trending.rank,
      starsGained: input.trending.starsGained,
      window: input.trending.window,
      checkedAt: input.trending.checkedAt.toISOString(),
      capturedAt: (
        input.trending.capturedAt ?? input.trending.checkedAt
      ).toISOString(),
      scope: input.trending.scope ?? {},
      appearances: (
        input.trending.appearances ?? [primaryAppearance(input.trending)]
      ).map((appearance) => ({
        rank: appearance.rank,
        starsGained: appearance.starsGained,
        window: appearance.window,
        capturedAt: appearance.capturedAt.toISOString(),
        scope: appearance.scope,
      })),
      source: input.trending.source,
    },
  });

export const parseGitHubTrendingPageRepositoryMetadata = (
  value: JsonObject | undefined,
): GitHubTrendingPageRepositoryMetadata | null => {
  if (value?.kind !== GITHUB_TRENDING_PAGE_REPOSITORY_METADATA_KIND) {
    return null;
  }

  const repository = readRecord(value.repository);
  const trending = readRecord(value.trending);

  if (repository === null || trending === null) {
    return null;
  }

  const fullName = readString(repository.fullName);
  const url = readString(repository.url);
  const capturedAt =
    readString(trending.capturedAt) ?? readString(trending.checkedAt);
  const window = readWindow(trending.window);

  if (
    fullName === undefined ||
    url === undefined ||
    capturedAt === undefined ||
    window === undefined
  ) {
    return null;
  }

  const scope = readScope(trending.scope);
  const rank = readPositiveInteger(trending.rank);
  const starsGained = readNonNegativeInteger(trending.starsGained);
  const appearances = readAppearances(trending.appearances);

  return {
    kind: GITHUB_TRENDING_PAGE_REPOSITORY_METADATA_KIND,
    repository: {
      fullName,
      url,
      description: readString(repository.description),
      language: readString(repository.language),
      totalStars: readNonNegativeInteger(repository.totalStars),
      forksCount: readNonNegativeInteger(repository.forksCount),
    },
    trending: {
      rank,
      starsGained,
      window,
      checkedAt: readString(trending.checkedAt) ?? capturedAt,
      capturedAt,
      scope,
      appearances:
        appearances.length === 0
          ? [{ rank, starsGained, window, capturedAt, scope }]
          : appearances,
      source: readString(trending.source) ?? 'unknown',
    },
  };
};

const primaryAppearance = (
  trending: GitHubTrendingPageRepositoryMetadataInput['trending'],
): GitHubTrendingPageAppearanceInput => ({
  rank: trending.rank,
  starsGained: trending.starsGained,
  window: trending.window,
  capturedAt: trending.capturedAt ?? trending.checkedAt,
  scope: trending.scope ?? {},
});

const readAppearances = (
  value: unknown,
): readonly GitHubTrendingPageAppearance[] =>
  Array.isArray(value)
    ? value.flatMap((candidate) => {
        const appearance = readRecord(candidate);
        const window = readWindow(appearance?.window);
        const capturedAt = readString(appearance?.capturedAt);

        return appearance === null ||
          window === undefined ||
          capturedAt === undefined
          ? []
          : [
              {
                rank: readPositiveInteger(appearance.rank),
                starsGained: readNonNegativeInteger(appearance.starsGained),
                window,
                capturedAt,
                scope: readScope(appearance.scope),
              },
            ];
      })
    : [];

const readScope = (value: unknown): GitHubTrendingPageScope => {
  const scope = readRecord(value);
  const programmingLanguage = readString(scope?.programmingLanguage);
  const spokenLanguage = readString(scope?.spokenLanguage);

  return {
    ...(programmingLanguage === undefined ? {} : { programmingLanguage }),
    ...(spokenLanguage === undefined ? {} : { spokenLanguage }),
  };
};

const readRecord = (
  value: unknown,
): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;

const readWindow = (value: unknown): GitHubTrendingPageWindow | undefined =>
  githubTrendingPageWindows.includes(value as GitHubTrendingPageWindow)
    ? (value as GitHubTrendingPageWindow)
    : undefined;

const readNonNegativeInteger = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : 0;

const readPositiveInteger = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1;
