import { normalizeJsonObject, type JsonObject } from '@social-monitor/shared-kernel';

/** An archived observation has publication custody, never a retrospective live fetch. */
export type GitHubTrendingArchiveProvenance = {
  readonly repository: string;
  readonly commit: string;
  readonly gitBlobSha1: string;
  readonly filePath: string;
  readonly fileSha256: string;
  readonly originalSourceUrl: string;
  readonly serializedAt: string;
  readonly committedAt: string;
  readonly acquiredAt: string;
};

export type GitHubTrendingArchiveMetadata = {
  readonly kind: 'github_trending_page_repository';
  readonly repository: {
    readonly fullName: string;
    readonly url: string;
    readonly description?: string;
    readonly language?: string;
    readonly totalStars: number;
    readonly forksCount: number;
  };
  readonly trending: {
    readonly observationKind: 'archived';
    readonly window: 'daily';
    readonly source: 'github_trending_archive';
    readonly rank: number;
    readonly originalArchiveRank: number;
    readonly starsGained: number;
    readonly snapshotContentHash: string;
    readonly scanJobId: null;
    readonly fetchStartedAt: null;
    readonly checkedAt: null;
  };
  readonly archive: GitHubTrendingArchiveProvenance;
};

type Candidate = {
  readonly externalId: string;
  readonly canonicalUrl: string;
  readonly publishedAt: Date;
  readonly ingestedAt: Date;
  readonly metadata?: JsonObject;
};

const repositoryName = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const sha1 = /^[a-f0-9]{40}$/u;
const sha256 = /^[a-f0-9]{64}$/u;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exactTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const count = (value: unknown, minimum = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;

export const isGitHubTrendingArchivedObservation = (metadata: JsonObject | undefined): boolean =>
  record(metadata?.trending) && metadata.trending.observationKind === 'archived';

export const githubTrendingArchiveExternalId = (
  archive: GitHubTrendingArchiveProvenance,
  fullName: string,
): string => [
  'github-trending-archive', 'daily', archive.repository.toLowerCase(),
  archive.commit, archive.filePath, archive.fileSha256, fullName.toLowerCase(),
].join(':');

export const parseGitHubTrendingArchiveMetadata = (
  metadata: JsonObject | undefined,
): GitHubTrendingArchiveMetadata | null => {
  if (metadata?.kind !== 'github_trending_page_repository' ||
      !record(metadata.repository) || !record(metadata.trending) || !record(metadata.archive)) return null;
  const r = metadata.repository, t = metadata.trending, a = metadata.archive;
  if (t.observationKind !== 'archived' || t.window !== 'daily' ||
      t.source !== 'github_trending_archive' || t.scanJobId !== null ||
      t.fetchStartedAt !== null || t.checkedAt !== null ||
      !count(t.rank, 1) || t.rank > 10 || !count(t.starsGained, 1) ||
      !count(t.originalArchiveRank, 1) || t.originalArchiveRank > 100 ||
      typeof t.snapshotContentHash !== 'string' || !sha256.test(t.snapshotContentHash) ||
      typeof r.fullName !== 'string' || !repositoryName.test(r.fullName) ||
      typeof r.url !== 'string' || r.url !== `https://github.com/${r.fullName}` ||
      !count(r.totalStars, 1) || !count(r.forksCount) ||
      (r.description !== undefined && typeof r.description !== 'string') ||
      (r.language !== undefined && typeof r.language !== 'string') ||
      typeof a.repository !== 'string' || !repositoryName.test(a.repository) ||
      typeof a.commit !== 'string' || !sha1.test(a.commit) ||
      typeof a.gitBlobSha1 !== 'string' || !sha1.test(a.gitBlobSha1) ||
      typeof a.fileSha256 !== 'string' || !sha256.test(a.fileSha256) ||
      typeof a.filePath !== 'string' || !/^api\/daily\/[a-z0-9-]+\.json$/u.test(a.filePath) ||
      typeof a.originalSourceUrl !== 'string' ||
      !/^https:\/\/github\.com\/trending(?:\/[a-z0-9-]+)?\?since=daily$/u.test(a.originalSourceUrl) ||
      !exactTimestamp(a.serializedAt) || !exactTimestamp(a.committedAt) || !exactTimestamp(a.acquiredAt) ||
      a.serializedAt.slice(0, 10) !== a.committedAt.slice(0, 10) ||
      Date.parse(a.serializedAt) > Date.parse(a.committedAt) ||
      Date.parse(a.committedAt) > Date.parse(a.acquiredAt)) return null;
  const language = a.filePath.slice('api/daily/'.length, -'.json'.length);
  if (a.originalSourceUrl !== `https://github.com/trending${language === 'all' ? '' : `/${language}`}?since=daily`) return null;
  return metadata as unknown as GitHubTrendingArchiveMetadata;
};

export const githubTrendingArchiveMetadata = (metadata: GitHubTrendingArchiveMetadata): JsonObject => {
  const value = normalizeJsonObject(metadata);
  if (parseGitHubTrendingArchiveMetadata(value) === null) throw new Error('Invalid archived GitHub observation');
  return value;
};

/** Missing-only selections may keep gaps in the original board ranks. */
export const assertGitHubTrendingArchiveBatchIntegrity = (params: {
  readonly providerKey: string;
  readonly items: readonly Candidate[];
}): void => {
  if (params.providerKey !== 'github-trending-page' || params.items.length > 10) {
    throw new Error('Archived GitHub observations require their provider and canonical Top 10');
  }
  let envelope: string | undefined;
  let lastRank = 0;
  const repositories = new Set<string>();
  for (const item of params.items) {
    const m = parseGitHubTrendingArchiveMetadata(item.metadata);
    if (m === null || item.externalId !== githubTrendingArchiveExternalId(m.archive, m.repository.fullName) ||
        item.canonicalUrl !== m.repository.url ||
        item.publishedAt.toISOString() !== m.archive.serializedAt ||
        !Number.isFinite(item.ingestedAt.getTime()) ||
        item.ingestedAt.getTime() < Date.parse(m.archive.acquiredAt)) {
      throw new Error('Archived GitHub observation must preserve immutable archive identity and dates');
    }
    const current = JSON.stringify([m.archive, m.trending.snapshotContentHash]);
    const identity = m.repository.fullName.toLowerCase();
    if ((envelope !== undefined && envelope !== current) || m.trending.rank <= lastRank || repositories.has(identity)) {
      throw new Error('Archived GitHub batch must preserve one archive envelope and ascending unique original ranks');
    }
    envelope = current;
    lastRank = m.trending.rank;
    repositories.add(identity);
  }
};
