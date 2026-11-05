import { createHash } from 'node:crypto';
import {
  githubTrendingArchiveExternalId, githubTrendingArchiveMetadata,
  type GitHubTrendingArchiveProvenance,
} from '../../../domain/value-objects/github-trending-archive';
import type { FetchedSourceItem } from '../../../ports';
import { canonicalGitHubTrendingRepositories, githubTrendingCanonicalBoardContentHash } from './github-trending-page-canonical-board';
import type { GitHubTrendingPageRepository } from './github-trending-page-client.port';

type ArchivedBoard = {
  readonly pubDate: string;
  readonly items: readonly {
    readonly url: string;
    readonly description: string;
    readonly language: string;
    readonly stars: number;
    readonly forks: number;
    readonly added_stars: string;
  }[];
};

/** Caller supplies verified commit/blob custody; this adapter never invents original fetch metadata. */
export const normalizeGitHubTrendingArchivedBoard = (input: {
  readonly bytes: Buffer;
  readonly archive: GitHubTrendingArchiveProvenance;
}): readonly FetchedSourceItem[] => {
  if (input.bytes.length > 1024 * 1024) throw new Error('Archived GitHub board exceeds the bounded input size');
  const fileSha = createHash('sha256').update(input.bytes).digest('hex');
  const blobSha = createHash('sha1').update(`blob ${input.bytes.length}\0`).update(input.bytes).digest('hex');
  if (fileSha !== input.archive.fileSha256 || blobSha !== input.archive.gitBlobSha1) {
    throw new Error('Archived GitHub file bytes do not match immutable file/blob custody');
  }
  const board = JSON.parse(input.bytes.toString('utf8')) as ArchivedBoard;
  if (!Array.isArray(board.items) || board.items.length > 100 ||
      typeof board.pubDate !== 'string' ||
      !Number.isFinite(Date.parse(board.pubDate)) ||
      new Date(board.pubDate).toISOString() !== input.archive.serializedAt) {
    throw new Error('Archived GitHub publication timestamp or board is invalid');
  }
  const repositories: GitHubTrendingPageRepository[] = board.items.map((row, index) => {
    if (typeof row.url !== 'string' || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(row.url) ||
        typeof row.description !== 'string' || typeof row.language !== 'string' ||
        !Number.isSafeInteger(row.stars) || row.stars <= 0 ||
        !Number.isSafeInteger(row.forks) || row.forks < 0 ||
        typeof row.added_stars !== 'string' || !/^[0-9]+(?:,[0-9]{3})* stars today$/u.test(row.added_stars)) {
      throw new Error('Archived GitHub repository metrics are malformed');
    }
    const starsGained = Number(row.added_stars.split(' ')[0]!.replaceAll(',', ''));
    if (!Number.isSafeInteger(starsGained) || starsGained <= 0) throw new Error('Archived stars gained must be positive');
    return { fullName: row.url.slice('https://github.com/'.length), url: row.url,
      description: row.description, language: row.language, totalStars: row.stars,
      forksCount: row.forks, starsGained, rank: index + 1 };
  });
  if (new Set(repositories.map(repository => repository.fullName.toLowerCase())).size !== repositories.length) {
    throw new Error('Archived GitHub board contains ambiguous duplicate repository rows');
  }
  const selected = canonicalGitHubTrendingRepositories(repositories, 10);
  const originalRanks = new Map(repositories.map(repository => [repository.fullName.toLowerCase(), repository.rank]));
  const snapshotContentHash = githubTrendingCanonicalBoardContentHash(selected);
  return selected.map(repository => ({
    externalId: githubTrendingArchiveExternalId(input.archive, repository.fullName),
    canonicalUrl: repository.url,
    title: `${repository.fullName} is #${repository.rank} on archived GitHub Trending`,
    body: `${repository.description}\nGitHub Trending daily archive: #${repository.rank}, +${repository.starsGained} stars. Total stars: ${repository.totalStars}.`,
    authorHandle: repository.fullName.split('/')[0],
    publishedAt: new Date(input.archive.serializedAt),
    metadata: githubTrendingArchiveMetadata({
      kind: 'github_trending_page_repository', repository: {
        fullName: repository.fullName, url: repository.url, description: repository.description,
        language: repository.language, totalStars: repository.totalStars, forksCount: repository.forksCount,
      },
      trending: { observationKind: 'archived', window: 'daily', source: 'github_trending_archive',
        rank: repository.rank, originalArchiveRank: originalRanks.get(repository.fullName.toLowerCase())!,
        starsGained: repository.starsGained, snapshotContentHash,
        scanJobId: null, fetchStartedAt: null, checkedAt: null },
      archive: input.archive,
    }),
  }));
};
