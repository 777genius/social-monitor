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
  githubTrendingWatchText,
  maxGitHubTrendingHighlights,
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
  const citation =
    githubCitations.length === 1 ? githubCitations[0] : undefined;
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

export const resolveAppendixCandidates = (params: {
  readonly artifact: ReaderSummaryArtifact;
  readonly citationById: ReadonlyMap<string, ReaderSummaryCitation>;
  readonly candidates: readonly ProjectionCandidate[];
  readonly selectedGroupKey: string;
}): readonly SelectedProjectionCandidate[] | undefined => {
  const section = (params.artifact.toSnapshot().content?.narrativeSections ?? [])
    .find((candidate) => candidate.id === githubTrendingNarrativeSectionId);
  if (section === undefined) return [];
  const resolved = section.citationIds.map((citationId, selectedPostIndex) => {
    const citation = params.citationById.get(citationId);
    if (citation === undefined || !isGitHubCitation(citation)) return undefined;
    const matches = params.candidates.filter((candidate) =>
      candidate.groupKey === params.selectedGroupKey &&
      candidate.item.feedItemId === citation.feedItemId &&
      candidate.item.sourceItemId === citation.sourceItemId &&
      canonicalGitHubRepositoryIdentity(citation.canonicalUrl) ===
        candidate.repositoryIdentity,
    );
    return matches.length === 1 ? {
      ...matches[0]!,
      selectedPostIndex,
      citationId,
    } : undefined;
  });
  return resolved.every((candidate) => candidate !== undefined)
    ? resolved as readonly SelectedProjectionCandidate[]
    : undefined;
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
  const findings: {
    readonly code: ReaderSummaryGitHubProjectionViolationCode;
    readonly reason: string;
  }[] = [];
  const fetchStartedAt = new Set(
    candidates.map((candidate) => dateKey(candidate.item.fetchStartedAt)),
  );
  const checkedAt = new Set(
    candidates.map((candidate) => dateKey(candidate.item.checkedAt)),
  );
  const publishedAt = new Set(
    candidates.map((candidate) => dateKey(candidate.item.publishedAt)),
  );
  const observedAt = new Set(
    candidates.map((candidate) => dateKey(candidate.item.observedAt)),
  );
  if (
    fetchStartedAt.size !== 1 ||
    checkedAt.size !== 1 ||
    publishedAt.size !== 1 ||
    observedAt.size !== 1 ||
    [...checkedAt][0] !== [...publishedAt][0]
  ) {
    findings.push({
      code: "github_projection_mixed" as const,
      reason:
        "Durable GitHub projection must share one immutable fetch, check, publication, and observation envelope.",
    });
  }
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
    candidates.length !== maxGitHubTrendingDisplayRepositories ||
    topTenCandidates.length !== maxGitHubTrendingDisplayRepositories ||
    expectedRanks.some((rank) => !topTenRanks.includes(rank))
  ) {
    findings.push({
      code: "github_projection_gapped" as const,
      reason:
        "Durable GitHub Top 10 projection must contain ranks #1 through #10.",
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
  const findings: {
    readonly code: ReaderSummaryGitHubProjectionViolationCode;
    readonly reason: string;
  }[] = [];
  const sections =
    params.artifact.toSnapshot().content?.narrativeSections ?? [];
  const expectedWatch = params.candidates
    .filter(
      (candidate) =>
        candidate.groupKey === params.selectedGroupKey &&
        (candidate.item.rank ?? 0) >= 1 &&
        (candidate.item.rank ?? 0) <= maxGitHubTrendingDisplayRepositories &&
        (candidate.item.starsGained ?? 0) > minimumGitHubTrendingStarsGained,
    )
    .sort(
      (left, right) =>
        left.item.rank! - right.item.rank! ||
        left.repositoryIdentity.localeCompare(
          right.repositoryIdentity,
          "en-US",
        ),
    )
    .slice(0, maxGitHubTrendingHighlights);
  let githubSectionCount = 0;
  for (const section of sections) {
    const githubCitations = section.citationIds.flatMap((citationId) => {
      const citation = params.citationById.get(citationId);
      return citation !== undefined && isGitHubCitation(citation)
        ? [citation]
        : [];
    });
    if (
      githubCitations.length === 0 &&
      section.id !== githubTrendingNarrativeSectionId
    ) {
      continue;
    }
    githubSectionCount += 1;
    if (
      section.kind !== "watch" ||
      section.id !== githubTrendingNarrativeSectionId ||
      section.citationIds.length !== githubCitations.length ||
      hasDuplicates(section.citationIds) ||
      githubCitations.length > maxGitHubTrendingHighlights
    ) {
      findings.push({
        code: "github_projection_mixed" as const,
        reason:
          "Supplemental GitHub repositories may appear only in the short GitHub Trending Watch item.",
      });
      continue;
    }
    const selected = githubCitations.flatMap((citation) => {
      const matches = params.candidates.filter(
        (candidate) =>
          candidate.item.feedItemId === citation.feedItemId &&
          candidate.item.sourceItemId === citation.sourceItemId &&
          candidate.groupKey === params.selectedGroupKey &&
          (candidate.item.rank ?? 0) >= 1 &&
          (candidate.item.rank ?? 0) <= maxGitHubTrendingDisplayRepositories &&
          (candidate.item.starsGained ?? 0) >
            minimumGitHubTrendingStarsGained &&
          canonicalGitHubRepositoryIdentity(citation.canonicalUrl) ===
            candidate.repositoryIdentity,
      );
      return matches.length === 1 ? matches : [];
    });
    const resolvedRepositories = selected.map(
      (candidate) => candidate.repositoryIdentity,
    );
    if (
      selected.length !== githubCitations.length ||
      hasDuplicates(resolvedRepositories) ||
      hasDuplicates(selected.map((candidate) => candidate.item.feedItemId)) ||
      hasDuplicates(selected.map((candidate) => candidate.item.sourceItemId)) ||
      selected.length !== expectedWatch.length ||
      section.text !==
        githubTrendingWatchText(
          expectedWatch.map((candidate) => ({
            repositoryIdentity: candidate.repositoryIdentity,
            rank: candidate.item.rank!,
            starsGained: candidate.item.starsGained!,
          })),
        ) ||
      selected.some(
        (candidate, index) =>
          candidate.item.feedItemId !== expectedWatch[index]?.item.feedItemId ||
          candidate.item.sourceItemId !==
            expectedWatch[index]?.item.sourceItemId,
      )
    ) {
      findings.push({
        code: "github_projection_identity_invalid" as const,
        reason:
          "GitHub Trending Watch must contain the exact ordered unique subset of at most three Top 10 repositories with strictly more than 1,000 stars gained.",
      });
    }
  }
  if (
    (expectedWatch.length === 0 && githubSectionCount > 0) ||
    (expectedWatch.length > 0 && githubSectionCount !== 1)
  ) {
    findings.push({
      code: "github_projection_mixed",
      reason:
        "GitHub Trending Watch must appear exactly once when eligible Top 10 repositories exist and be absent otherwise.",
    });
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
  providerKey: candidate.item.providerKey,
  metadataKind: candidate.item.metadataKind!,
  scanJobId: candidate.item.scanJobId!,
  repositoryIdentity: candidate.repositoryIdentity,
  canonicalUrl: candidate.item.canonicalUrl,
  starsGained: candidate.item.starsGained!,
  fetchStartedAt: candidate.item.fetchStartedAt!.toISOString(),
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
  const eligibleItems = items.filter(
    (item) =>
      item.sourceBindingId === sourceBindingId &&
      item.checkedAt !== undefined &&
      Number.isFinite(item.checkedAt.getTime()) &&
      item.fetchStartedAt !== undefined &&
      Number.isFinite(item.fetchStartedAt.getTime()) &&
      Number.isFinite(item.observedAt.getTime()) &&
      item.scanJobId !== undefined &&
      item.scanJobId.trim().length > 0,
  );
  const groups = new Map<string, ReaderSummaryGitHubProjectionItem[]>();
  for (const item of eligibleItems) {
    const key = projectionGroupKey(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const completeGroupKeys = new Set(
    [...groups.entries()]
      .filter(([, group]) => projectionGroupHasCompleteTopTen(group))
      .map(([key]) => key),
  );
  const candidates =
    completeGroupKeys.size === 0
      ? eligibleItems
      : eligibleItems.filter((item) =>
          completeGroupKeys.has(projectionGroupKey(item)),
        );
  let latestItem: ReaderSummaryGitHubProjectionItem | undefined;
  let latestFetchStartedAt = Number.NEGATIVE_INFINITY;
  let latestCheckedAt = Number.NEGATIVE_INFINITY;
  let latestObservedAt = Number.NEGATIVE_INFINITY;
  for (const item of candidates) {
    const checkedAt = item.checkedAt?.getTime();
    const fetchStartedAt = item.fetchStartedAt?.getTime();
    const observedAt = item.observedAt.getTime();
    if (
      item.sourceBindingId !== sourceBindingId ||
      checkedAt === undefined ||
      !Number.isFinite(checkedAt) ||
      fetchStartedAt === undefined ||
      !Number.isFinite(fetchStartedAt) ||
      !Number.isFinite(observedAt) ||
      item.scanJobId === undefined ||
      item.scanJobId.trim().length === 0
    ) {
      continue;
    }
    if (
      fetchStartedAt > latestFetchStartedAt ||
      (fetchStartedAt === latestFetchStartedAt &&
        checkedAt > latestCheckedAt) ||
      (fetchStartedAt === latestFetchStartedAt &&
        checkedAt === latestCheckedAt &&
        observedAt > latestObservedAt)
    ) {
      latestItem = item;
      latestCheckedAt = checkedAt;
      latestFetchStartedAt = fetchStartedAt;
      latestObservedAt = observedAt;
    }
  }
  return latestItem === undefined ? undefined : projectionGroupKey(latestItem);
};

const projectionGroupHasCompleteTopTen = (
  items: readonly ReaderSummaryGitHubProjectionItem[],
): boolean => {
  if (items.length !== maxGitHubTrendingDisplayRepositories) {
    return false;
  }
  const ranks = items.map((item) => item.rank);
  return Array.from(
    { length: maxGitHubTrendingDisplayRepositories },
    (_, index) => index + 1,
  ).every(
    (rank) => ranks.filter((candidate) => candidate === rank).length === 1,
  );
};

export const projectionGroupKey = (
  item: ReaderSummaryGitHubProjectionItem,
): string => `${item.sourceBindingId}\u0000${item.scanJobId ?? "invalid"}`;

export const projectionGroupKeyIfSelectable = (
  item: ReaderSummaryGitHubProjectionItem,
): string | undefined => {
  const checkedAt = item.checkedAt?.getTime();
  const fetchStartedAt = item.fetchStartedAt?.getTime();
  return checkedAt !== undefined &&
    Number.isFinite(checkedAt) &&
    fetchStartedAt !== undefined &&
    Number.isFinite(fetchStartedAt) &&
    item.scanJobId !== undefined &&
    item.scanJobId.trim().length > 0
    ? projectionGroupKey(item)
    : undefined;
};

export const projectionGroupEnvelopeIsCoherent = (
  items: readonly ReaderSummaryGitHubProjectionItem[],
): boolean =>
  items.length > 0 &&
  new Set(items.map((item) => item.scanJobId)).size === 1 &&
  new Set(items.map((item) => dateKey(item.fetchStartedAt))).size === 1 &&
  new Set(items.map((item) => dateKey(item.checkedAt))).size === 1 &&
  new Set(items.map((item) => dateKey(item.publishedAt))).size === 1 &&
  new Set(items.map((item) => dateKey(item.observedAt))).size === 1;

const dateKey = (value: Date | undefined): string => {
  const timestamp = value?.getTime();
  return timestamp !== undefined && Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : "invalid";
};
