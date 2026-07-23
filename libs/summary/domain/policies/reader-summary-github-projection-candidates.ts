import {
  canonicalGitHubRepositoryIdentity,
  githubProjectionTimesAreBounded,
  nonEmpty,
  normalizeRepositoryFullName,
  type ReaderSummaryGitHubProjectionItem,
  type ReaderSummaryGitHubProjectionViolationCode,
} from "./reader-summary-github-projection-audit";
import {
  projectionGroupKey,
  projectionGroupKeyIfSelectable,
  type ProjectionCandidate,
} from "./reader-summary-github-projection-set";

export const githubProjectionItemTouchesDay = (
  item: ReaderSummaryGitHubProjectionItem,
  dayStartedAt: Date,
  dayEndedAt: Date,
): boolean => {
  const startedAt = dayStartedAt.getTime();
  const endedAt = dayEndedAt.getTime();
  return [
    item.fetchStartedAt,
    item.checkedAt,
    item.publishedAt,
    item.observedAt,
  ].some((value) => {
    const timestamp = value?.getTime();
    return (
      timestamp !== undefined &&
      Number.isFinite(timestamp) &&
      timestamp >= startedAt &&
      timestamp < endedAt
    );
  });
};

export const collectCanonicalProjectionCandidates = (params: {
  readonly items: readonly ReaderSummaryGitHubProjectionItem[];
  readonly eligibleBindingIds: ReadonlySet<string>;
  readonly canonicalGroupKeyByBindingId: ReadonlyMap<string, string>;
  readonly dayStartedAt: Date;
  readonly dayEndedAt: Date;
  readonly observedThrough: Date;
}): {
  readonly candidates: readonly ProjectionCandidate[];
  readonly findings: readonly {
    readonly code: ReaderSummaryGitHubProjectionViolationCode;
    readonly reason: string;
  }[];
} => {
  const findings: {
    code: ReaderSummaryGitHubProjectionViolationCode;
    reason: string;
  }[] = [];
  const candidates = params.items.flatMap((item) => {
    const groupKey = projectionGroupKeyIfSelectable(item);
    const canonicalGroupKey = params.canonicalGroupKeyByBindingId.get(
      item.sourceBindingId,
    );
    if (
      canonicalGroupKey === undefined ||
      projectionGroupKey(item) !== canonicalGroupKey
    ) {
      return [];
    }
    const repositoryIdentity = canonicalGitHubRepositoryIdentity(
      item.canonicalUrl,
    );
    const metadataIdentity = normalizeRepositoryFullName(
      item.repositoryFullName,
    );
    const checkedAt = item.checkedAt?.getTime();
    const fetchStartedAt = item.fetchStartedAt?.getTime();
    const valid =
      params.eligibleBindingIds.has(item.sourceBindingId) &&
      item.providerKey === "github-trending-page" &&
      item.metadataKind === "github_trending_page_repository" &&
      nonEmpty(item.scanJobId ?? "") &&
      nonEmpty(item.feedItemId) &&
      nonEmpty(item.sourceItemId) &&
      nonEmpty(item.sourceBindingId) &&
      /^[a-f0-9]{64}$/iu.test(item.sourceContentHash) &&
      /^[a-f0-9]{64}$/iu.test(item.sourceProviderContentHash) &&
      repositoryIdentity !== undefined &&
      metadataIdentity === repositoryIdentity &&
      Number.isInteger(item.rank) &&
      (item.rank ?? 0) > 0 &&
      Number.isSafeInteger(item.starsGained) &&
      (item.starsGained ?? -1) >= 0 &&
      item.window === "daily" &&
      fetchStartedAt !== undefined &&
      Number.isFinite(fetchStartedAt) &&
      checkedAt !== undefined &&
      Number.isFinite(checkedAt) &&
      githubProjectionTimesAreBounded({
        dayStartedAt: params.dayStartedAt,
        dayEndedAt: params.dayEndedAt,
        observedThrough: params.observedThrough,
        fetchStartedAt: item.fetchStartedAt!,
        publishedAt: item.publishedAt,
        checkedAt: item.checkedAt!,
        observedAt: item.observedAt,
      });
    if (!valid || groupKey === undefined) {
      findings.push({
        code: "github_projection_identity_invalid",
        reason:
          "Latest durable GitHub projection contains an invalid provider, metadata kind, scan identity, daily metric, fingerprint, or timestamp.",
      });
      return [];
    }
    return [
      { item, repositoryIdentity, groupKey } satisfies ProjectionCandidate,
    ];
  });

  return { candidates, findings };
};
