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
    readonly scanJobId: string;
    readonly fetchStartedAt: Date;
    readonly checkedAt: Date;
    readonly snapshotContentHash: string;
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
    readonly scanJobId: string;
    readonly fetchStartedAt: string;
    readonly checkedAt: string;
    readonly snapshotContentHash: string;
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
      scanJobId: input.trending.scanJobId,
      fetchStartedAt: input.trending.fetchStartedAt.toISOString(),
      checkedAt: input.trending.checkedAt.toISOString(),
      snapshotContentHash: input.trending.snapshotContentHash,
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
  const scanJobId = readString(trending.scanJobId);
  const fetchStartedAt = readExactIsoDateString(trending.fetchStartedAt);
  const checkedAt = readExactIsoDateString(trending.checkedAt);
  const snapshotContentHash = readSha256(trending.snapshotContentHash);
  const window = readWindow(trending.window);
  const totalStars = readNonNegativeInteger(repository.totalStars);
  const forksCount = readNonNegativeInteger(repository.forksCount);
  const rank = readPositiveInteger(trending.rank);
  const starsGained = readNonNegativeInteger(trending.starsGained);

  if (
    fullName === undefined ||
    url === undefined ||
    scanJobId === undefined ||
    fetchStartedAt === undefined ||
    checkedAt === undefined ||
    snapshotContentHash === undefined ||
    window === undefined ||
    totalStars === undefined ||
    forksCount === undefined ||
    rank === undefined ||
    starsGained === undefined ||
    new Date(fetchStartedAt).getTime() > new Date(checkedAt).getTime()
  ) {
    return null;
  }

  return {
    kind: GITHUB_TRENDING_PAGE_REPOSITORY_METADATA_KIND,
    repository: {
      fullName,
      url,
      description: readString(repository.description),
      language: readString(repository.language),
      totalStars,
      forksCount,
    },
    trending: {
      rank,
      starsGained,
      window,
      scanJobId,
      fetchStartedAt,
      checkedAt,
      snapshotContentHash,
      source: readString(trending.source) ?? 'unknown',
    },
  };
};

type GitHubSnapshotCandidate = {
  readonly externalId: string;
  readonly canonicalUrl: string;
  readonly publishedAt: Date;
  readonly ingestedAt: Date;
  readonly metadata?: JsonObject;
};

type GitHubSnapshotEnvelope = {
  readonly scanJobId: string;
  readonly repositoryIdentity: string;
  readonly rank: number;
  readonly fetchStartedAt: string;
  readonly checkedAt: string;
  readonly publishedAt: string;
  readonly observedAt: string;
  readonly snapshotContentHash: string;
};

export const assertGitHubTrendingSnapshotBatchIntegrity = (params: {
  readonly providerKey: string;
  readonly items: readonly GitHubSnapshotCandidate[];
}): void => {
  const hasGitHubMetadata = params.items.some(
    (item) =>
      item.metadata?.kind === GITHUB_TRENDING_PAGE_REPOSITORY_METADATA_KIND,
  );
  if (
    params.providerKey !== GITHUB_TRENDING_PAGE_PROVIDER_KEY &&
    !hasGitHubMetadata
  ) {
    return;
  }
  if (params.providerKey !== GITHUB_TRENDING_PAGE_PROVIDER_KEY) {
    throw new Error(
      'GitHub Trending snapshot metadata requires the GitHub Trending provider',
    );
  }
  if (params.items.length === 0) {
    return;
  }
  if (params.items.length > 10) {
    throw new Error(
      'GitHub Trending snapshot cannot admit repositories beyond the canonical Top 10',
    );
  }

  const envelopes = params.items.map(assertGitHubTrendingSnapshotIntegrity);
  const first = envelopes[0]!;
  const ranks = envelopes.map((envelope) => envelope.rank);
  const repositories = envelopes.map(
    (envelope) => envelope.repositoryIdentity,
  );
  if (
    envelopes.some(
      (envelope) =>
        envelope.scanJobId !== first.scanJobId ||
        envelope.fetchStartedAt !== first.fetchStartedAt ||
        envelope.checkedAt !== first.checkedAt ||
        envelope.publishedAt !== first.publishedAt ||
        envelope.observedAt !== first.observedAt ||
        envelope.snapshotContentHash !== first.snapshotContentHash,
    ) ||
    ranks.some((rank, index) => rank !== index + 1) ||
    new Set(ranks).size !== ranks.length ||
    new Set(repositories).size !== repositories.length
  ) {
    throw new Error(
      'GitHub Trending snapshot batch must preserve one coherent scan identity, timestamp envelope, and ascending unique Top 10 rank order',
    );
  }
};

export const githubTrendingSnapshotBatchObservedAt = (params: {
  readonly providerKey: string;
  readonly items: readonly GitHubSnapshotCandidate[];
}): Date | undefined => {
  assertGitHubTrendingSnapshotBatchIntegrity(params);
  if (
    params.providerKey !== GITHUB_TRENDING_PAGE_PROVIDER_KEY ||
    params.items.length === 0
  ) {
    return undefined;
  }
  return new Date(params.items[0]!.ingestedAt);
};

export const assertGitHubTrendingDurableObservationCoherence = (params: {
  readonly providerKey: string;
  readonly incomingObservedAt: Date;
  readonly persistedObservedAt: Date;
}): void => {
  if (
    params.providerKey === GITHUB_TRENDING_PAGE_PROVIDER_KEY &&
    params.incomingObservedAt.getTime() !== params.persistedObservedAt.getTime()
  ) {
    throw new Error(
      'GitHub Trending snapshot conflicts with a durable row from a different observation envelope',
    );
  }
};

const assertGitHubTrendingSnapshotIntegrity = (
  item: GitHubSnapshotCandidate,
): GitHubSnapshotEnvelope => {
  const metadata = parseGitHubTrendingPageRepositoryMetadata(item.metadata);
  if (metadata === null) {
    throw new Error(
      'GitHub Trending snapshot requires canonical metadata with valid scan and source timestamps',
    );
  }
  const fetchStartedAt = new Date(metadata.trending.fetchStartedAt);
  const checkedAt = new Date(metadata.trending.checkedAt);
  const publishedAt = item.publishedAt;
  const observedAt = item.ingestedAt;
  const timestamps = [
    fetchStartedAt,
    checkedAt,
    publishedAt,
    observedAt,
  ].map((value) => value.getTime());
  if (
    timestamps.some((value) => !Number.isFinite(value)) ||
    metadata.trending.rank < 1 ||
    metadata.trending.rank > 10 ||
    metadata.trending.starsGained <= 0 ||
    metadata.repository.totalStars <= 0 ||
    fetchStartedAt.getTime() > checkedAt.getTime() ||
    publishedAt.getTime() !== checkedAt.getTime() ||
    observedAt.getTime() < checkedAt.getTime() ||
    utcDay(fetchStartedAt) !== utcDay(checkedAt) ||
    utcDay(checkedAt) !== utcDay(publishedAt)
  ) {
    throw new Error(
      'GitHub Trending snapshot fetchStartedAt and checkedAt must belong to one UTC day, publishedAt must equal checkedAt, and observedAt cannot precede them',
    );
  }
  const expectedExternalId = [
    GITHUB_TRENDING_PAGE_PROVIDER_KEY,
    metadata.trending.window,
    metadata.trending.scanJobId,
    metadata.repository.fullName,
  ].join(':');
  const canonicalRepositoryUrl =
    `https://github.com/${metadata.repository.fullName}`.toLocaleLowerCase(
      'en-US',
    );
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(
      metadata.repository.fullName,
    ) ||
    item.externalId !== expectedExternalId ||
    item.canonicalUrl !== metadata.repository.url ||
    metadata.repository.url.toLocaleLowerCase('en-US') !==
      canonicalRepositoryUrl
  ) {
    throw new Error(
      'GitHub Trending snapshot source and repository identities must match its immutable scan metadata',
    );
  }

  return {
    scanJobId: metadata.trending.scanJobId,
    repositoryIdentity: metadata.repository.fullName
      .trim()
      .toLocaleLowerCase('en-US'),
    rank: metadata.trending.rank,
    fetchStartedAt: metadata.trending.fetchStartedAt,
    checkedAt: metadata.trending.checkedAt,
    publishedAt: publishedAt.toISOString(),
    observedAt: observedAt.toISOString(),
    snapshotContentHash: metadata.trending.snapshotContentHash,
  };
};

const utcDay = (value: Date): string => value.toISOString().slice(0, 10);

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

const readSha256 = (value: unknown): string | undefined => {
  const text = readString(value);
  return text !== undefined && /^[a-f0-9]{64}$/u.test(text)
    ? text
    : undefined;
};

const readExactIsoDateString = (value: unknown): string | undefined => {
  const text = readString(value);
  if (text === undefined) {
    return undefined;
  }
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === text
    ? text
    : undefined;
};

const readWindow = (value: unknown): GitHubTrendingPageWindow | undefined =>
  githubTrendingPageWindows.includes(value as GitHubTrendingPageWindow)
    ? (value as GitHubTrendingPageWindow)
    : undefined;

const readNonNegativeInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;

const readPositiveInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined;
