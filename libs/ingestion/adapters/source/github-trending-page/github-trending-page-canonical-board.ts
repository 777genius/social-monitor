import type { GitHubTrendingPageRepository } from "./github-trending-page-client.port";

export const maxGitHubTrendingCanonicalRepositories = 10;

export const canonicalGitHubTrendingRepositories = (
  repositories: readonly GitHubTrendingPageRepository[],
  requestedLimit: number,
): readonly GitHubTrendingPageRepository[] => {
  const strongestByRepository = new Map<
    string,
    GitHubTrendingPageRepository
  >();

  for (const repository of repositories) {
    const identity = repositoryIdentity(repository);
    const existing = strongestByRepository.get(identity);
    if (
      existing === undefined ||
      compareDuplicateRepository(repository, existing) < 0
    ) {
      strongestByRepository.set(identity, repository);
    }
  }

  return [...strongestByRepository.values()]
    .sort(
      (left, right) =>
        right.starsGained - left.starsGained ||
        repositoryIdentity(left).localeCompare(
          repositoryIdentity(right),
          "en-US",
        ),
    )
    .slice(
      0,
      Math.min(requestedLimit, maxGitHubTrendingCanonicalRepositories),
    )
    .map((repository, index) => ({ ...repository, rank: index + 1 }));
};

const compareDuplicateRepository = (
  left: GitHubTrendingPageRepository,
  right: GitHubTrendingPageRepository,
): number =>
  right.starsGained - left.starsGained ||
  right.totalStars - left.totalStars ||
  right.forksCount - left.forksCount ||
  left.rank - right.rank ||
  left.url.localeCompare(right.url, "en-US") ||
  left.fullName.localeCompare(right.fullName, "en-US") ||
  (left.description ?? "").localeCompare(right.description ?? "", "en-US") ||
  (left.language ?? "").localeCompare(right.language ?? "", "en-US");

const repositoryIdentity = (
  repository: GitHubTrendingPageRepository,
): string => repository.fullName.trim().toLocaleLowerCase("en-US");
