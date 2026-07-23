import type { ReaderSummaryArtifact } from "../entities/reader-summary-artifact";
import type { ReaderSummaryGitHubProjectionBinding } from "./reader-summary-github-projection-audit";
import {
  githubTrendingNarrativeSectionId,
  githubTrendingProviderKey,
  githubTrendingWatchText,
  maxGitHubTrendingHighlights,
  minimumGitHubTrendingStarsGained,
} from "./reader-summary-github-trending-policy";

export const verifiedGitHubWatchFollowsBindings = (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly bindings: readonly ReaderSummaryGitHubProjectionBinding[];
}): boolean => {
  const snapshot = params.artifact.toSnapshot();
  const githubCitationIds = new Set(
    snapshot.citationMap
      .filter(
        (citation) =>
          citation.providerKey.trim().toLocaleLowerCase("en-US") ===
          githubTrendingProviderKey,
      )
      .map((citation) => citation.citationId),
  );
  const githubSections = (snapshot.content?.narrativeSections ?? []).filter(
    (section) =>
      section.id === githubTrendingNarrativeSectionId ||
      section.citationIds.some((citationId) =>
        githubCitationIds.has(citationId),
      ),
  );
  const expectedEntries = params.bindings
    .filter(
      (binding) =>
        binding.starsGained > minimumGitHubTrendingStarsGained,
    )
    .sort((left, right) => left.rank - right.rank)
    .slice(0, maxGitHubTrendingHighlights);
  const expectedCitationIds = expectedEntries.map(
    (binding) => binding.citationId,
  );
  if (expectedCitationIds.length === 0) {
    return githubSections.length === 0;
  }
  const section = githubSections.length === 1 ? githubSections[0] : undefined;
  return (
    section !== undefined &&
    section.id === githubTrendingNarrativeSectionId &&
    section.kind === "watch" &&
    section.text === githubTrendingWatchText(expectedEntries) &&
    section.citationIds.length === expectedCitationIds.length &&
    section.citationIds.every(
      (citationId, index) => citationId === expectedCitationIds[index],
    )
  );
};
