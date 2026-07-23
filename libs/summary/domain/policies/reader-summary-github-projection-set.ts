import type {
  ReaderSummaryArtifact,
  ReaderSummaryItem,
} from "../entities/reader-summary-artifact";
import type { ReaderSummaryCitation } from "../entities/citation";
import {
  canonicalGitHubRepositoryIdentity,
  hasDuplicates,
  isGitHubCitation,
  selectedPostGitHubMetric,
  type ReaderSummaryGitHubProjectionBinding,
  type ReaderSummaryGitHubProjectionItem,
  type ReaderSummaryGitHubProjectionViolationCode,
} from "./reader-summary-github-projection-audit";
import {
  githubTrendingNarrativeSectionId,
  maxGitHubTrendingDisplayRepositories,
  minimumGitHubTrendingStarsGained,
} from "./reader-summary-github-trending-policy";

export type ProjectionCandidate = {
  readonly item: ReaderSummaryGitHubProjectionItem;
  readonly repositoryIdentity: string;
  readonly groupKey: string;
};

export type SelectedProjectionCandidate = ProjectionCandidate & {
  readonly selectedPostIndex: number;
  readonly citationId: string;
};

export const resolveSelectedCandidate = (params: {
  readonly post: ReaderSummaryItem;
  readonly selectedPostIndex: number;
  readonly citationById: ReadonlyMap<string, ReaderSummaryCitation>;
  readonly candidates: readonly ProjectionCandidate[];
}): SelectedProjectionCandidate | undefined => {
  const githubCitations = params.post.citationIds.flatMap((citationId) => {
    const citation = params.citationById.get(citationId);
    return citation !== undefined && isGitHubCitation(citation)
      ? [citation]
      : [];
  });
  const citation = githubCitations.length === 1 ? githubCitations[0] : undefined;
  const postIdentity = canonicalGitHubRepositoryIdentity(
    params.post.canonicalUrl,
  );
  const citationIdentity = canonicalGitHubRepositoryIdentity(
    citation?.canonicalUrl,
  );
  const rank = selectedPostGitHubMetric(params.post, "rank");
  const starsGained = selectedPostGitHubMetric(params.post, "stars");
  if (
    citation === undefined ||
    params.post.citationIds.length !== 1 ||
    postIdentity === undefined ||
    citationIdentity !== postIdentity ||
    rank === undefined ||
    starsGained === undefined
  ) {
    return undefined;
  }
  const matches = params.candidates.filter(
    (candidate) =>
      candidate.item.feedItemId === citation.feedItemId &&
      candidate.item.sourceItemId === citation.sourceItemId &&
      candidate.repositoryIdentity === postIdentity &&
      candidate.item.rank === rank &&
      candidate.item.starsGained === starsGained,
  );
  const candidate = matches.length === 1 ? matches[0] : undefined;
  return candidate === undefined
    ? undefined
    : {
        ...candidate,
        selectedPostIndex: params.selectedPostIndex,
        citationId: citation.citationId,
      };
};

export const projectionSetFindings = (
  candidates: readonly ProjectionCandidate[],
): readonly {
  readonly code: ReaderSummaryGitHubProjectionViolationCode;
  readonly reason: string;
}[] => {
  const topTenCandidates = candidates.filter(
    (candidate) =>
      candidate.item.rank !== undefined &&
      candidate.item.rank <= maxGitHubTrendingDisplayRepositories,
  );
  const ranks = candidates.map((candidate) => candidate.item.rank!);
  const topTenRanks = topTenCandidates.map((candidate) => candidate.item.rank!);
  const repositories = candidates.map(
    (candidate) => candidate.repositoryIdentity,
  );
  const feedItemIds = candidates.map((candidate) => candidate.item.feedItemId);
  const sourceItemIds = candidates.map(
    (candidate) => candidate.item.sourceItemId,
  );
  const findings = [];
  if (
    hasDuplicates(ranks) ||
    hasDuplicates(repositories) ||
    hasDuplicates(feedItemIds) ||
    hasDuplicates(sourceItemIds)
  ) {
    findings.push({
      code: "github_projection_duplicate" as const,
      reason:
        "Durable GitHub projection contains duplicate rank, repository, feed, or source identities.",
    });
  }
  const expectedRanks = Array.from(
    { length: maxGitHubTrendingDisplayRepositories },
    (_, index) => index + 1,
  );
  if (
    topTenCandidates.length !== maxGitHubTrendingDisplayRepositories ||
    expectedRanks.some((rank) => !topTenRanks.includes(rank))
  ) {
    findings.push({
      code: "github_projection_gapped" as const,
      reason: "Durable GitHub Top 10 projection must contain ranks #1 through #10.",
    });
  }
  return findings;
};

export const selectedPostsFollowProjection = (
  selected: readonly SelectedProjectionCandidate[],
  projected: readonly ProjectionCandidate[],
): boolean => {
  if (
    selected.length !== maxGitHubTrendingDisplayRepositories ||
    projected.length !== maxGitHubTrendingDisplayRepositories
  ) {
    return false;
  }
  const projectedByRank = new Map(
    projected.map((candidate) => [candidate.item.rank, candidate] as const),
  );
  return selected.every((candidate, index) => {
    const rank = index + 1;
    const projectedCandidate = projectedByRank.get(rank);
    return (
      candidate.item.rank === rank &&
      projectedCandidate?.item.feedItemId === candidate.item.feedItemId &&
      projectedCandidate.item.sourceItemId === candidate.item.sourceItemId
    );
  });
};

export const supplementalNarrativeFindings = (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly citationById: ReadonlyMap<string, ReaderSummaryCitation>;
  readonly candidates: readonly ProjectionCandidate[];
  readonly selectedGroupKey?: string;
}): readonly {
  readonly code: ReaderSummaryGitHubProjectionViolationCode;
  readonly reason: string;
}[] => {
  const findings = [];
  for (const section of params.artifact.toSnapshot().content
    ?.narrativeSections ?? []) {
    const githubCitations = section.citationIds.flatMap((citationId) => {
      const citation = params.citationById.get(citationId);
      return citation !== undefined && isGitHubCitation(citation)
        ? [citation]
        : [];
    });
    if (githubCitations.length === 0) {
      continue;
    }
    if (
      section.kind !== "watch" ||
      section.id !== githubTrendingNarrativeSectionId ||
      section.citationIds.length !== githubCitations.length ||
      hasDuplicates(section.citationIds) ||
      githubCitations.length > 3
    ) {
      findings.push({
        code: "github_projection_mixed" as const,
        reason:
          "Supplemental GitHub repositories may appear only in the short GitHub Trending Watch item.",
      });
      continue;
    }
    for (const citation of githubCitations) {
      const matches = params.candidates.filter(
        (candidate) =>
          candidate.item.feedItemId === citation.feedItemId &&
          candidate.item.sourceItemId === citation.sourceItemId &&
          candidate.groupKey === params.selectedGroupKey &&
          (candidate.item.rank ?? 0) >
            maxGitHubTrendingDisplayRepositories &&
          (candidate.item.starsGained ?? 0) >
            minimumGitHubTrendingStarsGained,
      );
      if (matches.length !== 1) {
        findings.push({
          code: "github_projection_identity_invalid" as const,
          reason:
            "GitHub Trending Watch citations must bind one projection item with strictly more than 1,000 stars gained.",
        });
      }
    }
  }
  return findings;
};

export const projectionBinding = (
  candidate: SelectedProjectionCandidate,
): ReaderSummaryGitHubProjectionBinding => ({
  selectedPostIndex: candidate.selectedPostIndex,
  rank: candidate.item.rank!,
  citationId: candidate.citationId,
  feedItemId: candidate.item.feedItemId,
  sourceItemId: candidate.item.sourceItemId,
  sourceBindingId: candidate.item.sourceBindingId,
  repositoryIdentity: candidate.repositoryIdentity,
  canonicalUrl: candidate.item.canonicalUrl,
  starsGained: candidate.item.starsGained!,
  publishedAt: candidate.item.publishedAt.toISOString(),
  checkedAt: candidate.item.checkedAt!.toISOString(),
  observedAt: candidate.item.observedAt.toISOString(),
  sourceContentHash: candidate.item.sourceContentHash,
  sourceProviderContentHash: candidate.item.sourceProviderContentHash,
});

export const latestProjectionGroupKey = (
  items: readonly ReaderSummaryGitHubProjectionItem[],
  sourceBindingId: string,
): string | undefined => {
  let latestItem: ReaderSummaryGitHubProjectionItem | undefined;
  let latestCheckedAt = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const checkedAt = item.checkedAt?.getTime();
    if (
      item.sourceBindingId !== sourceBindingId ||
      checkedAt === undefined ||
      !Number.isFinite(checkedAt)
    ) {
      continue;
    }
    if (checkedAt > latestCheckedAt) {
      latestItem = item;
      latestCheckedAt = checkedAt;
    }
  }
  return latestItem === undefined ? undefined : projectionGroupKey(latestItem);
};

export const projectionGroupKey = (
  item: ReaderSummaryGitHubProjectionItem,
): string =>
  `${item.sourceBindingId}\u0000${item.checkedAt?.toISOString() ?? "invalid"}`;

export const projectionGroupKeyIfSelectable = (
  item: ReaderSummaryGitHubProjectionItem,
): string | undefined => {
  const checkedAt = item.checkedAt?.getTime();
  return checkedAt !== undefined && Number.isFinite(checkedAt)
    ? projectionGroupKey(item)
    : undefined;
};
