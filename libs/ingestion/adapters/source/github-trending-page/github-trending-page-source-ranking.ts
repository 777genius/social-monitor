import type { GitHubTrendingPageScope } from "../../../domain";
import type { GitHubTrendingPageRepository } from "./github-trending-page-client.port";

export type ScopedGitHubTrendingRepository = {
  readonly repository: GitHubTrendingPageRepository;
  readonly scope: GitHubTrendingPageScope;
  readonly scopeIndex: number;
};

export type RankedGitHubTrendingRepository = {
  readonly primary: ScopedGitHubTrendingRepository;
  readonly occurrences: readonly ScopedGitHubTrendingRepository[];
};

export const rankGitHubTrendingRepositoriesBySourceScope = (
  occurrences: readonly ScopedGitHubTrendingRepository[],
  scopeCount: number,
  limit: number,
): readonly RankedGitHubTrendingRepository[] => {
  const occurrencesByRepository = new Map<
    string,
    Map<string, ScopedGitHubTrendingRepository>
  >();

  for (const occurrence of occurrences) {
    const repositoryKey =
      occurrence.repository.fullName.toLocaleLowerCase("en-US");
    const byScope = occurrencesByRepository.get(repositoryKey) ?? new Map();
    const scopeKey = githubTrendingPageScopeKey(occurrence.scope);
    const existing = byScope.get(scopeKey);

    if (
      existing === undefined ||
      betterScopedOccurrence(occurrence, existing)
    ) {
      byScope.set(scopeKey, occurrence);
    }
    occurrencesByRepository.set(repositoryKey, byScope);
  }

  const candidates = [...occurrencesByRepository.values()].map((byScope) => {
    const scopedOccurrences = [...byScope.values()].sort(compareOccurrences);

    return {
      primary: scopedOccurrences[0]!,
      occurrences: scopedOccurrences,
    };
  });

  return selectAcrossSourceScopes(candidates, scopeCount, limit);
};

export const githubTrendingPageScope = (params: {
  readonly programmingLanguage?: string;
  readonly spokenLanguage?: string;
}): GitHubTrendingPageScope => ({
  ...(params.programmingLanguage === undefined
    ? {}
    : { programmingLanguage: params.programmingLanguage }),
  ...(params.spokenLanguage === undefined
    ? {}
    : { spokenLanguage: params.spokenLanguage }),
});

const selectAcrossSourceScopes = (
  candidates: readonly RankedGitHubTrendingRepository[],
  scopeCount: number,
  limit: number,
): readonly RankedGitHubTrendingRepository[] => {
  const candidateByRepository = new Map(
    candidates.map((candidate) => [
      candidate.primary.repository.fullName.toLocaleLowerCase("en-US"),
      candidate,
    ]),
  );
  const occurrencesByScope = Array.from({ length: scopeCount }, (_, index) =>
    candidates
      .flatMap((candidate) => candidate.occurrences)
      .filter((occurrence) => occurrence.scopeIndex === index)
      .sort(compareOccurrences),
  );
  const selected: RankedGitHubTrendingRepository[] = [];
  const selectedRepositoryKeys = new Set<string>();
  const maxScopeLength = Math.max(
    0,
    ...occurrencesByScope.map((scopeOccurrences) => scopeOccurrences.length),
  );

  for (let rankIndex = 0; rankIndex < maxScopeLength; rankIndex += 1) {
    for (const scopeOccurrences of occurrencesByScope) {
      const occurrence = scopeOccurrences[rankIndex];
      if (occurrence === undefined) {
        continue;
      }
      const repositoryKey =
        occurrence.repository.fullName.toLocaleLowerCase("en-US");
      const candidate = candidateByRepository.get(repositoryKey);

      if (
        candidate !== undefined &&
        !selectedRepositoryKeys.has(repositoryKey)
      ) {
        selected.push({ ...candidate, primary: occurrence });
        selectedRepositoryKeys.add(repositoryKey);
      }
      if (selected.length === limit) {
        return selected;
      }
    }
  }

  return selected;
};

const compareOccurrences = (
  left: ScopedGitHubTrendingRepository,
  right: ScopedGitHubTrendingRepository,
): number =>
  left.scopeIndex - right.scopeIndex ||
  left.repository.rank - right.repository.rank;

const betterScopedOccurrence = (
  candidate: ScopedGitHubTrendingRepository,
  existing: ScopedGitHubTrendingRepository,
): boolean =>
  candidate.repository.rank < existing.repository.rank ||
  (candidate.repository.rank === existing.repository.rank &&
    candidate.repository.starsGained > existing.repository.starsGained);

const githubTrendingPageScopeKey = (scope: GitHubTrendingPageScope): string =>
  [
    scope.programmingLanguage?.toLocaleLowerCase("en-US") ?? "overall",
    scope.spokenLanguage?.toLocaleLowerCase("en-US") ?? "any",
  ].join(":");
