import { githubTrendingPageRepositoryMetadata, type GitHubTrendingPageRepositoryMetadataInput, type GitHubTrendingPageWindow } from '../../../domain';
import type { FetchedSourceItem } from '../../../ports';
import type { GitHubTrendingPageRepository } from './github-trending-page-client.port';

/** Validate parsed Trending provider data and derive canonical SourceItems. */
export const normalizeRepository = (params: {
  readonly repository: GitHubTrendingPageRepository;
  readonly window: GitHubTrendingPageWindow;
  readonly scanJobId: string;
  readonly fetchStartedAt: Date;
  readonly checkedAt: Date;
  readonly snapshotContentHash: string;
  readonly source: GitHubTrendingPageRepositoryMetadataInput["trending"]["source"];
}): FetchedSourceItem => {
  const {
    repository,
    window,
    scanJobId,
    fetchStartedAt,
    checkedAt,
    snapshotContentHash,
    source,
  } = params;
  const metadata = githubTrendingPageRepositoryMetadata({
    repository: {
      fullName: repository.fullName,
      url: repository.url,
      description: repository.description,
      language: repository.language,
      totalStars: repository.totalStars,
      forksCount: repository.forksCount,
    },
    trending: {
      rank: repository.rank,
      starsGained: repository.starsGained,
      window,
      scanJobId,
      fetchStartedAt,
      checkedAt,
      snapshotContentHash,
      source,
    },
  });
  const description =
    repository.description ?? "No GitHub Trending description available.";

  return {
    externalId: `github-trending-page:${window}:${scanJobId}:${repository.fullName.toLocaleLowerCase("en-US")}`,
    canonicalUrl: repository.url,
    title: `${repository.fullName} is #${repository.rank} on GitHub Trending`,
    body: `${description}\nGitHub Trending ${window}: #${repository.rank}, +${repository.starsGained} stars. Total stars: ${repository.totalStars}.`,
    authorHandle: repository.fullName.split("/")[0],
    publishedAt: checkedAt,
    metadata,
  };
};

export const isUsableTrendingRepository = (
  repository: GitHubTrendingPageRepository,
): boolean =>
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository.fullName) &&
  repository.url.startsWith("https://github.com/") &&
  repository.url.toLocaleLowerCase("en-US") ===
    `https://github.com/${repository.fullName}`.toLocaleLowerCase("en-US") &&
  Number.isInteger(repository.rank) &&
  repository.rank > 0 &&
  Number.isInteger(repository.totalStars) &&
  repository.totalStars > 0 &&
  Number.isInteger(repository.forksCount) &&
  repository.forksCount >= 0 &&
  Number.isInteger(repository.starsGained) &&
  repository.starsGained > 0;

export const githubTrendingPageWarnings = (params: {
  readonly fetchedCount: number;
  readonly validCount: number;
}): readonly string[] => {
  const warnings: string[] = [];

  if (params.fetchedCount === 0) {
    warnings.push(
      "GitHub Trending page returned no repositories; parser drift or an empty filtered page should be checked.",
    );
  }

  if (params.validCount < params.fetchedCount) {
    warnings.push(
      "Some GitHub Trending page repositories had incomplete rank, URL or star metrics and were skipped.",
    );
  }

  return warnings;
};

